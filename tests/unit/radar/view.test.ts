import { describe, expect, it } from "vitest";
import type { ClientRecord } from "@/features/radar/types";
import {
  filterRadarRecords,
  radarWhatsAppText,
  summarizeRadar,
  withReconnectInterval,
} from "@/features/radar/view";

function record(overrides: Partial<ClientRecord> & { name: string }): ClientRecord {
  const { name, ...rest } = overrides;
  return {
    id: name,
    rowNumber: 2,
    name,
    phone: "9876543210",
    phoneValid: true,
    investmentType: "SIP",
    sipAmountPaise: null,
    lumpsumAmountPaise: null,
    lastInvested: null,
    lastContacted: null,
    isNewClient: false,
    note: "",
    signals: [],
    ...rest,
  };
}

describe("radar view helpers", () => {
  const records = [
    record({ name: "Both", signals: ["recent-investor", "reconnect-due"] }),
    record({ name: "Recent", signals: ["recent-investor"] }),
    record({ name: "Fresh", signals: ["new-client"] }),
    record({ name: "Due", signals: ["reconnect-due"] }),
    record({ name: "Quiet", signals: [] }),
  ];

  it("attention shows only clients with signals, preserving priority order", () => {
    expect(filterRadarRecords(records, "attention").map((r) => r.name)).toEqual([
      "Both",
      "Recent",
      "Fresh",
      "Due",
    ]);
  });

  it("signal filters pick their subset and all returns everything", () => {
    expect(filterRadarRecords(records, "recent-investor").map((r) => r.name)).toEqual([
      "Both",
      "Recent",
    ]);
    expect(filterRadarRecords(records, "reconnect-due").map((r) => r.name)).toEqual([
      "Both",
      "Due",
    ]);
    expect(filterRadarRecords(records, "new-client").map((r) => r.name)).toEqual(["Fresh"]);
    expect(filterRadarRecords(records, "all")).toHaveLength(5);
  });

  it("summarizes counts from signals", () => {
    expect(summarizeRadar(records)).toEqual({
      total: 5,
      attention: 4,
      recentInvestors: 2,
      reconnectDue: 2,
      newClients: 1,
    });
  });

  it("recomputes signals when the interval changes", () => {
    const rows = [
      record({ name: "Due At 90", lastContacted: "2026-07-17", signals: ["reconnect-due"] }),
      record({ name: "Never", lastContacted: null, signals: ["reconnect-due"] }),
    ];
    const relaxed = withReconnectInterval(rows, "2026-10-25", 180);
    expect(relaxed.find((r) => r.name === "Due At 90")?.signals).toEqual([]);
    expect(relaxed.find((r) => r.name === "Never")?.signals).toEqual(["reconnect-due"]);
  });

  it("builds a plain WhatsApp greeting without advice", () => {
    expect(radarWhatsAppText("Aarav")).toBe(
      "Hi Aarav, just reconnecting. Are you available for a quick chat this week?",
    );
  });
});
