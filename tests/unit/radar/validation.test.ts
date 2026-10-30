import { describe, expect, it } from "vitest";
import { RADAR_HEADERS } from "@/features/radar/template";
import {
  validateRadarFileMeta,
  validateRadarHeaders,
  validateRadarRow,
} from "@/features/radar/validation";

const TODAY = "2026-10-26";

function mapFor(header: string[]) {
  const result = validateRadarHeaders(header);
  if (!result.map) throw new Error(`expected valid headers: ${result.error}`);
  return result.map;
}

const STANDARD = mapFor([...RADAR_HEADERS]);

describe("validateRadarFileMeta", () => {
  it("accepts .csv and .xlsx within size and rejects the rest", () => {
    expect(validateRadarFileMeta("radar.csv", 100)).toBeNull();
    expect(validateRadarFileMeta("radar.xlsx", 100)).toBeNull();
    expect(validateRadarFileMeta("radar.xls", 100)).toContain(".csv");
    expect(validateRadarFileMeta("radar.pdf", 100)).toContain(".csv");
    expect(validateRadarFileMeta("radar.csv", 6 * 1024 * 1024)).toContain("5 MB");
  });
});

describe("validateRadarHeaders", () => {
  it("accepts the exact contract", () => {
    expect(validateRadarHeaders([...RADAR_HEADERS]).error).toBeNull();
  });

  it("is case-insensitive, trims, and ignores order", () => {
    const result = validateRadarHeaders([
      "  note ",
      "NEW CLIENT",
      "last contacted",
      "LAST INVESTED",
      "investment type",
      "mobile",
      "client NAME",
    ]);
    expect(result.error).toBeNull();
  });

  it("rejects a missing Client Name column", () => {
    expect(validateRadarHeaders(["Mobile", "Note"]).error).toContain("Client Name");
    expect(validateRadarHeaders([]).error).toContain("empty");
  });

  it("rejects duplicate canonical headers", () => {
    const result = validateRadarHeaders([...RADAR_HEADERS, "mobile"]);
    expect(result.error).toContain("appears 2 times");
  });

  it("reports extra columns as ignored", () => {
    const result = validateRadarHeaders([...RADAR_HEADERS, "PAN", "Folio"]);
    expect(result.error).toBeNull();
    expect(result.ignored).toEqual(["PAN", "Folio"]);
  });
});

describe("validateRadarRow", () => {
  it("accepts a complete valid row", () => {
    const result = validateRadarRow(
      ["Rajesh", "9876543210", "SIP", "25/10/2026", "01/10/2026", "Y", "Met at branch"],
      STANDARD,
      TODAY,
    );
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      name: "Rajesh",
      phoneValid: true,
      investmentType: "SIP",
      lastInvested: "2026-10-25",
      lastContacted: "2026-10-01",
      isNewClient: true,
      note: "Met at branch",
    });
    expect(result.warnings).toEqual([]);
  });

  it("accepts a client with both dates blank (no signal, still valid)", () => {
    const result = validateRadarRow(["Asha", "", "", "", "", "", ""], STANDARD, TODAY);
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({ lastInvested: null, lastContacted: null });
  });

  it("rejects missing and over-long names", () => {
    expect(validateRadarRow(["", "", "", "", "", "", ""], STANDARD, TODAY).error).toContain(
      "missing",
    );
    expect(
      validateRadarRow(["x".repeat(61), "", "", "", "", "", ""], STANDARD, TODAY).error,
    ).toContain("60");
  });

  it("rejects malformed and future dates", () => {
    expect(
      validateRadarRow(["R", "", "", "99/99/9999", "", "", ""], STANDARD, TODAY).error,
    ).toContain("not a valid");
    expect(
      validateRadarRow(["R", "", "", "27/10/2026", "", "", ""], STANDARD, TODAY).error,
    ).toContain("future");
    expect(
      validateRadarRow(["R", "", "", "", "30/10/2026", "", ""], STANDARD, TODAY).error,
    ).toContain("future");
  });

  it("warns on invalid phone but keeps the row", () => {
    const result = validateRadarRow(["R", "abc", "", "", "", "", ""], STANDARD, TODAY);
    expect(result.error).toBeNull();
    expect(result.row?.phoneValid).toBe(false);
    expect(result.warnings.some((w) => w.includes("Phone number"))).toBe(true);
  });

  it("normalizes investment type and flag with warnings", () => {
    const result = validateRadarRow(["R", "", "Crypto", "", "", "maybe", ""], STANDARD, TODAY);
    expect(result.error).toBeNull();
    expect(result.row?.investmentType).toBe("Other");
    expect(result.row?.isNewClient).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });

  it("rejects over-long notes and sensitive content without echoing it", () => {
    expect(
      validateRadarRow(["R", "", "", "", "", "", "x".repeat(201)], STANDARD, TODAY).error,
    ).toContain("200");
    const pan = "ABCDE1234F";
    const result = validateRadarRow(["R", "", "", "", "", "", `id ${pan}`], STANDARD, TODAY);
    expect(result.error).toContain("sensitive");
    expect(result.error).not.toContain(pan);
  });

  it("reads reordered columns through the header map", () => {
    const map = mapFor([
      "Note",
      "New Client",
      "Last Contacted",
      "Last Invested",
      "Investment Type",
      "Mobile",
      "Client Name",
    ]);
    const result = validateRadarRow(
      ["n", "", "01/10/2026", "25/10/2026", "sip", "9876543210", "Rajesh"],
      map,
      TODAY,
    );
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      name: "Rajesh",
      investmentType: "SIP",
      lastInvested: "2026-10-25",
    });
  });
});
