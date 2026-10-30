import { describe, expect, it } from "vitest";
import {
  buildRadarHandoff,
  inferRadarPurpose,
  markContacted,
  parseAndBuildRadar,
  serializeRadarCsv,
} from "@/features/radar/model";
import { RADAR_HEADERS } from "@/features/radar/template";
import { validateRadarHeaders } from "@/features/radar/validation";
import type { ClientRecord } from "@/features/radar/types";

const TODAY = "2026-10-26";
const HEADER = [...RADAR_HEADERS].join(",");

function record(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: "id-1",
    rowNumber: 2,
    name: "Rajesh",
    phone: "9876543210",
    phoneValid: true,
    investmentType: "SIP",
    amountPaise: null,
    lastInvested: "2026-10-20",
    lastContacted: "2026-08-01",
    isNewClient: false,
    note: "",
    signals: ["recent-investor", "reconnect-due"],
    ...overrides,
  };
}

describe("radar CSV contract", () => {
  it("validator accepts the eight-column contract", () => {
    expect(validateRadarHeaders([...RADAR_HEADERS]).error).toBeNull();
  });

  it("still accepts the previous seven-column template with a blank amount", () => {
    const csv = [
      "Client Name,Mobile,Investment Type,Last Invested,Last Contacted,New Client,Note",
      "Old Seven,9876543210,SIP,01/01/2026,,Y,Legacy row",
    ].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.fileError).toBeNull();
    expect(report.records).toHaveLength(1);
    expect(report.records[0]).toMatchObject({ name: "Old Seven", amountPaise: null });
  });
});

describe("parseAndBuildRadar", () => {
  it("builds signal-bearing records in priority order", () => {
    const csv = [
      HEADER,
      "Old Investor,9876543210,SIP,,01/01/2026,,",
      "Fresh SIP,,SIP,5000,25/10/2026,,,",
      "Quiet Amit,,Lumpsum,,,01/01/2026,,",
      "New Meera,9876543210,Both,,,,Y,Met at camp",
    ].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.fileError).toBeNull();
    expect(report.records.map((r) => r.name)).toEqual([
      "Fresh SIP",
      "New Meera",
      "Old Investor",
      "Quiet Amit",
    ]);
  });

  it("keeps no-signal clients for the All view instead of discarding them", () => {
    const csv = [HEADER, "Steady Sam,,Insurance,,,26/10/2026,,"].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.fileError).toBeNull();
    expect(report.records).toHaveLength(1);
    expect(report.records[0].signals).toEqual([]);
  });

  it("preserves every valid row without dedupe", () => {
    const csv = [HEADER, "Same Name,,SIP,,,,", "Same Name,,SIP,,,,"].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.records).toHaveLength(2);
    expect(report.records[0].id).not.toBe(report.records[1].id);
  });

  it("rejects files with zero valid rows and reports invalid ones", () => {
    const csv = [HEADER, ",,,,,,,", "Bad Date,,SIP,,99/99/9999,,,"].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.records).toHaveLength(0);
    expect(report.fileError).toContain("No valid client rows");
    expect(report.invalid.map((i) => i.rowNumber)).toEqual([2, 3]);
  });

  it("ignores extra columns without modelling them", () => {
    const csv = [`${HEADER},PAN`, "Rajesh,9876543210,SIP,,,,,,ABCDE1234F"].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.fileError).toBeNull();
    expect(report.ignoredColumns).toEqual(["PAN"]);
    expect(JSON.stringify(report.records[0])).not.toContain("ABCDE1234F");
  });

  it("rejects future dates", () => {
    const csv = [HEADER, "Future,,SIP,,27/10/2026,,,"].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.fileError).toContain("No valid client rows");
    expect(report.invalid[0].reason).toContain("future");
  });
});

describe("markContacted", () => {
  it("sets Last Contacted to today and recomputes signals", () => {
    const before = record({ lastContacted: null, signals: ["recent-investor", "reconnect-due"] });
    const after = markContacted(before, TODAY, 90);
    expect(after.lastContacted).toBe(TODAY);
    expect(after.signals).toEqual(["recent-investor"]);
    expect(after.name).toBe(before.name);
  });

  it("overwrites an old contact date", () => {
    const after = markContacted(record(), TODAY, 90);
    expect(after.lastContacted).toBe(TODAY);
  });
});

describe("serializeRadarCsv round-trip", () => {
  it("re-imports to identical normalized values", () => {
    const csv = [
      HEADER,
      "Rajesh,9876543210,sip,2500,25/10/2026,,Y,Note with, comma",
      'Asha,,Lumpsum,,,,,"Said ""later"""',
    ].join("\n");
    const first = parseAndBuildRadar(csv, TODAY, 90);
    expect(first.fileError).toBeNull();
    const exported = serializeRadarCsv(first.records);
    expect(exported.split("\n")[0]).toBe(HEADER);
    const second = parseAndBuildRadar(exported, TODAY, 90);
    expect(second.fileError).toBeNull();
    expect(second.records).toHaveLength(first.records.length);
    const strip = (r: ClientRecord): object => ({
      name: r.name,
      phone: r.phone,
      phoneValid: r.phoneValid,
      investmentType: r.investmentType,
      amountPaise: r.amountPaise,
      lastInvested: r.lastInvested,
      lastContacted: r.lastContacted,
      isNewClient: r.isNewClient,
      note: r.note,
      signals: r.signals,
    });
    expect(second.records.map(strip)).toEqual(first.records.map(strip));
  });

  it("normalizes vocabulary on export (sip becomes SIP, unknown becomes Other)", () => {
    const csv = [HEADER, "R,,sip,,,,,", "S,,crypto,,,,,,"].join("\n");
    const exported = serializeRadarCsv(parseAndBuildRadar(csv, TODAY, 90).records);
    expect(exported).toContain(",SIP,");
    expect(exported).toContain(",Other,");
  });
});

describe("radar studio handoff", () => {
  it("maps recent SIP investors to sip-confirmation with the invested date", () => {
    const handoff = buildRadarHandoff(record());
    expect(handoff.purpose).toBe("sip-confirmation");
    expect(handoff.fields.clientName).toBe("Rajesh");
    expect(handoff.fields.sipDate).toBe("20/10/2026");
    expect(handoff.phone).toBe("9876543210");
  });

  it("maps reconnect-due records to review-invite", () => {
    const handoff = buildRadarHandoff(
      record({ investmentType: "Other", lastInvested: null, signals: ["reconnect-due"] }),
    );
    expect(handoff.purpose).toBe("review-invite");
  });

  it("falls back to kyc-reminder with the note as action", () => {
    const handoff = buildRadarHandoff(
      record({ signals: [], note: "KYC pending", lastInvested: null, lastContacted: TODAY }),
    );
    expect(handoff.purpose).toBe("kyc-reminder");
    expect(handoff.fields.action).toBe("KYC pending");
  });

  it("infers purpose deterministically", () => {
    expect(inferRadarPurpose({ investmentType: "Both", signals: ["recent-investor"] })).toBe(
      "sip-confirmation",
    );
    expect(inferRadarPurpose({ investmentType: "Insurance", signals: ["recent-investor"] })).toBe(
      "kyc-reminder",
    );
  });
});
