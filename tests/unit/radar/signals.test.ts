import { describe, expect, it } from "vitest";
import {
  computeSignals,
  DEFAULT_RECONNECT_INTERVAL_DAYS,
  investmentRecency,
  isNewRelationship,
  NEW_INVESTMENT_DAYS,
  radarPriorityClass,
  reasonsFor,
  RECONNECT_INTERVAL_OPTIONS,
  RECENT_INVESTOR_DAYS,
  sortRadarRecords,
} from "@/features/radar/signals";
import type { ClientRecord } from "@/features/radar/types";

const TODAY = "2026-10-26";

function record(overrides: Partial<ClientRecord> & { rowNumber: number }): ClientRecord {
  return {
    id: `id-${overrides.rowNumber}`,
    name: `Client ${overrides.rowNumber}`,
    phone: "",
    phoneValid: false,
    investmentType: "SIP",
    sipAmountPaise: null,
    lumpsumAmountPaise: null,
    lastInvested: null,
    lastContacted: null,
    note: "",
    signals: [],
    ...overrides,
  };
}

describe("investmentRecency boundaries (MFD-70)", () => {
  it.each([
    ["2026-10-26", "new"], // 0 days
    ["2026-10-25", "new"], // 1 day
    ["2026-10-24", "new"], // 2 days
    ["2026-10-23", "new"], // 3 days
    ["2026-10-22", "recent"], // 4 days
    ["2026-09-27", "recent"], // 29 days
    ["2026-09-26", "recent"], // 30 days
    ["2026-09-25", "older"], // 31 days
    ["2026-05-01", "older"],
  ])("invested %s gives recency %s", (invested, expected) => {
    expect(investmentRecency(invested, TODAY)).toBe(expected);
  });

  it("null and future-dated investments never classify as new/recent", () => {
    expect(investmentRecency(null, TODAY)).toBe("none");
    expect(investmentRecency("2026-10-27", TODAY)).toBe("none");
    expect(investmentRecency("2027-01-01", TODAY)).toBe("none");
  });

  it("uses fixed product windows", () => {
    expect(NEW_INVESTMENT_DAYS).toBe(3);
    expect(RECENT_INVESTOR_DAYS).toBe(30);
  });
});

describe("isNewRelationship lifecycle (MFD-70)", () => {
  it.each([
    [null, null, true], // manual add, no history
    ["2026-10-26", null, true], // invested today
    ["2026-10-23", null, true], // 3 days
    ["2026-10-22", null, true], // 4 days
    ["2026-09-26", null, true], // 30 days
    ["2026-09-25", null, false], // 31 days: established quiet
    ["2026-05-01", null, false], // old history: established quiet
    [null, TODAY, false], // first contact graduates
    ["2026-10-26", TODAY, false],
    ["2026-10-12", "2026-07-24", false], // contacted long ago
  ])("invested=%s contacted=%s gives new=%s", (invested, contacted, expected) => {
    expect(isNewRelationship(invested, contacted, TODAY)).toBe(expected);
  });
});

describe("computeSignals / recent-investor", () => {
  it.each([
    ["2026-10-26", true],
    ["2026-10-25", true],
    ["2026-09-27", true],
    ["2026-09-26", true],
    ["2026-09-25", false],
  ])("invested %s with 30-day rule gives recent=%s", (invested, expected) => {
    const signals = computeSignals({ lastInvested: invested, lastContacted: TODAY }, TODAY, 90);
    expect(signals.includes("recent-investor")).toBe(expected);
  });

  it("null and future lastInvested never qualify", () => {
    expect(
      computeSignals({ lastInvested: null, lastContacted: TODAY }, TODAY, 90),
    ).not.toContain("recent-investor");
    expect(
      computeSignals({ lastInvested: "2026-10-27", lastContacted: TODAY }, TODAY, 90),
    ).not.toContain("recent-investor");
  });
});

describe("computeSignals / new relationship (MFD-70)", () => {
  it("never-contacted with no history or new/recent investment is new, never reconnect", () => {
    for (const invested of [null, "2026-10-26", "2026-10-23", "2026-10-22", "2026-09-26"]) {
      const signals = computeSignals({ lastInvested: invested, lastContacted: null }, TODAY, 90);
      expect(signals).toContain("new-client");
      expect(signals).not.toContain("reconnect-due");
    }
  });

  it("never-contacted with older investment is established quiet: reconnect, not new", () => {
    for (const invested of ["2026-09-25", "2026-05-01", "2025-01-01"]) {
      const signals = computeSignals({ lastInvested: invested, lastContacted: null }, TODAY, 90);
      expect(signals).toEqual(["reconnect-due"]);
    }
  });

  it("first contact graduates the new relationship", () => {
    const before = computeSignals({ lastInvested: null, lastContacted: null }, TODAY, 90);
    expect(before).toContain("new-client");
    const after = computeSignals({ lastInvested: null, lastContacted: TODAY }, TODAY, 90);
    expect(after).not.toContain("new-client");
    expect(after).not.toContain("reconnect-due");
  });

  it("new and reconnect are mutually exclusive across the matrix", () => {
    const investedOptions = [null, "2026-10-26", "2026-10-22", "2026-09-26", "2026-09-25", "2026-05-01"];
    const contactedOptions = [null, TODAY, "2026-10-22", "2026-07-21"];
    for (const invested of investedOptions) {
      for (const contacted of contactedOptions) {
        const signals = computeSignals({ lastInvested: invested, lastContacted: contacted }, TODAY, 90);
        expect(signals.includes("new-client") && signals.includes("reconnect-due")).toBe(false);
      }
    }
  });
});

describe("computeSignals / reconnect-due", () => {
  it.each([
    ["2026-10-26", false],
    ["2026-10-25", false],
    ["2026-07-29", false],
    ["2026-07-28", true],
    ["2026-07-27", true],
  ])("contacted %s with 90-day interval gives due=%s", (contacted, expected) => {
    const signals = computeSignals({ lastInvested: null, lastContacted: contacted }, TODAY, 90);
    // Contacted clients are never new relationships, so these are pure reconnect checks.
    expect(signals.includes("new-client")).toBe(false);
    expect(signals.includes("reconnect-due")).toBe(expected);
  });

  it("null lastContacted with older history is due at every interval", () => {
    for (const interval of RECONNECT_INTERVAL_OPTIONS) {
      const signals = computeSignals(
        { lastInvested: "2026-05-01", lastContacted: null },
        TODAY,
        interval,
      );
      expect(signals.includes("reconnect-due")).toBe(true);
    }
  });

  it.each([30, 60, 120, 180])("honours a %s-day interval", (interval) => {
    const signals = computeSignals({ lastInvested: null, lastContacted: "2026-10-26" }, TODAY, interval);
    expect(signals.includes("reconnect-due")).toBe(false);
  });

  it("uses 90 as the default interval", () => {
    expect(DEFAULT_RECONNECT_INTERVAL_DAYS).toBe(90);
    expect(RECONNECT_INTERVAL_OPTIONS).toEqual([30, 60, 90, 120, 180]);
  });

  it("resolves the reconnect reason on contact but lets it return later", () => {
    const due = computeSignals(
      { lastInvested: "2026-05-01", lastContacted: "2026-07-21" },
      TODAY,
      90,
    );
    expect(due).toContain("reconnect-due");
    const contacted = computeSignals(
      { lastInvested: "2026-05-01", lastContacted: TODAY },
      TODAY,
      90,
    );
    expect(contacted).not.toContain("reconnect-due");
    const stale = computeSignals(
      { lastInvested: "2026-05-01", lastContacted: "2026-07-21" },
      "2026-10-26",
      30,
    );
    expect(stale).toContain("reconnect-due");
  });
});

describe("reasonsFor", () => {
  it("builds factual reasons per signal", () => {
    expect(
      reasonsFor({ lastInvested: "2026-10-12", lastContacted: null }, ["recent-investor"], TODAY),
    ).toEqual(["Recent investor · invested 12/10/2026"]);
    expect(
      reasonsFor({ lastInvested: "2026-10-25", lastContacted: null }, ["recent-investor"], TODAY),
    ).toEqual(["New investment · invested 25/10/2026"]);
    expect(
      reasonsFor({ lastInvested: null, lastContacted: null }, ["reconnect-due"], TODAY),
    ).toEqual(["Follow-up due · haven't spoken yet"]);
    expect(
      reasonsFor({ lastInvested: null, lastContacted: "2026-07-21" }, ["reconnect-due"], TODAY),
    ).toEqual(["Follow-up due · 97 days since you last spoke"]);
    expect(reasonsFor({ lastInvested: null, lastContacted: null }, ["new-client"], TODAY)).toEqual(
      ["New client"],
    );
  });

  it("uses singular day correctly", () => {
    expect(
      reasonsFor({ lastInvested: null, lastContacted: "2026-10-25" }, ["reconnect-due"], TODAY),
    ).toEqual(["Follow-up due · 1 day since you last spoke"]);
  });
});

describe("radarPriorityClass", () => {
  it("orders actionable first, recent-only context below every actionable client", () => {
    // MFD-66: recent-investor is context, not attention. Actionable
    // (reconnect/new) always outranks recent-only; a recent investment
    // only boosts an already-actionable client into class 1.
    expect(radarPriorityClass(["recent-investor", "reconnect-due"])).toBe(1);
    expect(radarPriorityClass(["recent-investor", "new-client"])).toBe(1);
    expect(radarPriorityClass(["new-client"])).toBe(2);
    expect(radarPriorityClass(["reconnect-due"])).toBe(3);
    expect(radarPriorityClass(["recent-investor"])).toBe(4);
    expect(radarPriorityClass([])).toBe(5);
  });
});

describe("sortRadarRecords", () => {
  it("applies priority, within-class, and tiebreak ordering exactly", () => {
    const records = [
      record({
        rowNumber: 1,
        lastInvested: "2026-10-20",
        lastContacted: "2026-10-26",
        signals: ["recent-investor"],
      }),
      record({
        rowNumber: 2,
        lastInvested: "2026-10-26",
        lastContacted: null,
        signals: ["recent-investor", "reconnect-due"],
      }),
      record({ rowNumber: 3, lastInvested: null, lastContacted: null, signals: ["reconnect-due"] }),
      record({
        rowNumber: 4,
        lastInvested: null,
        lastContacted: null,
        signals: ["new-client"],
      }),
      record({
        rowNumber: 5,
        lastInvested: "2026-10-25",
        lastContacted: null,
        signals: ["recent-investor", "reconnect-due"],
      }),
      record({
        rowNumber: 6,
        lastInvested: null,
        lastContacted: "2026-09-01",
        signals: ["reconnect-due"],
      }),
      record({ rowNumber: 7, lastInvested: null, lastContacted: TODAY, signals: [] }),
      record({
        rowNumber: 8,
        lastInvested: "2026-10-26",
        lastContacted: "2026-10-26",
        signals: ["recent-investor"],
      }),
    ];
    // MFD-66: actionable first (recent-boosted, then new, then
    // reconnect), then recent-only context, then no signal.
    expect(sortRadarRecords(records, TODAY).map((r) => r.rowNumber)).toEqual([
      2, 5, 4, 3, 6, 8, 1, 7,
    ]);
  });

  it("does not mutate the input array", () => {
    const records = [
      record({ rowNumber: 2, signals: [] }),
      record({ rowNumber: 1, signals: ["new-client"] }),
    ];
    const sorted = sortRadarRecords(records, TODAY);
    expect(sorted.map((r) => r.rowNumber)).toEqual([1, 2]);
    expect(records.map((r) => r.rowNumber)).toEqual([2, 1]);
  });
});
