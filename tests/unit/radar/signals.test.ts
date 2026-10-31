import { describe, expect, it } from "vitest";
import {
  compareClientText,
  compareInvestedNewestFirst,
  computeSignals,
  DEFAULT_RECONNECT_INTERVAL_DAYS,
  investmentRecency,
  isNewRelationship,
  NEW_INVESTMENT_DAYS,
  radarPriorityClass,
  rankableInvestedDate,
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

describe("canonical date + identity ordering", () => {
  it("orders new relationships by newest investment, missing last", () => {
    const records = [
      record({ rowNumber: 1, id: "old", name: "Old", signals: ["new-client"] }),
      record({
        rowNumber: 2,
        id: "dated-old",
        name: "Dated Old",
        lastInvested: "2026-09-01",
        signals: ["new-client"],
      }),
      record({
        rowNumber: 3,
        id: "dated-new",
        name: "Dated New",
        lastInvested: "2026-10-25",
        signals: ["new-client"],
      }),
    ];
    expect(sortRadarRecords(records, TODAY).map((r) => r.id)).toEqual([
      "dated-new",
      "dated-old",
      "old",
    ]);
  });

  it("treats missing investment dates as oldest instead of file position", () => {
    const dated = record({
      rowNumber: 9,
      id: "dated",
      name: "Zed",
      lastInvested: "2026-01-01",
      signals: ["recent-investor", "new-client"],
    });
    const missing = record({
      rowNumber: 1,
      id: "missing",
      name: "Amy",
      signals: ["recent-investor", "new-client"],
    });
    // "Amy" < "Zed" and row 1 < row 9, yet the dated client leads.
    expect(sortRadarRecords([missing, dated], TODAY).map((r) => r.id)).toEqual([
      "dated",
      "missing",
    ]);
  });

  it("never floats future-dated investments to the top", () => {
    const future = record({
      rowNumber: 1,
      id: "future",
      name: "Future",
      lastInvested: "2026-12-25",
      signals: ["recent-investor"],
    });
    const past = record({
      rowNumber: 2,
      id: "past",
      name: "Past",
      lastInvested: "2026-10-26",
      lastContacted: "2026-10-26",
      signals: ["recent-investor"],
    });
    expect(rankableInvestedDate(future, TODAY)).toBeNull();
    expect(sortRadarRecords([future, past], TODAY).map((r) => r.id)).toEqual(["past", "future"]);
  });

  it("breaks full ties by normalized name, then stable id", () => {
    const rows = [
      record({ rowNumber: 3, id: "id-c", name: "  ZARA ", signals: [] }),
      record({ rowNumber: 1, id: "id-b", name: "amina", signals: [] }),
      record({ rowNumber: 2, id: "id-a", name: "Amina", signals: [] }),
    ];
    // Same class, no dates: case/whitespace-insensitive name, then id.
    expect(sortRadarRecords(rows, TODAY).map((r) => r.id)).toEqual(["id-a", "id-b", "id-c"]);
    expect(compareInvestedNewestFirst(rows[0], rows[1], TODAY)).toBe(0);
    expect(compareClientText(rows[2], rows[1])).toBeLessThan(0);
  });

  it("produces identical order for shuffled, reshuffled, and reversed input", () => {
    const signalsPool: ClientRecord["signals"][] = [
      ["recent-investor", "new-client"],
      ["new-client"],
      ["reconnect-due"],
      ["recent-investor"],
      [],
      ["recent-investor", "reconnect-due"],
    ];
    const investedPool: Array<string | null> = [
      "2026-10-26",
      "2026-10-20",
      "2026-09-15",
      null,
      "2026-12-01",
      "2026-05-01",
    ];
    const contactedPool: Array<string | null> = [null, "2026-10-26", "2026-07-01", "2026-10-20"];
    const names = ["Asha", "Bala", "asha", "Chetan", "Asha", "Divya", "Eshan", "Farah"];
    const records: ClientRecord[] = Array.from({ length: 50 }, (_, i) =>
      record({
        rowNumber: i + 1,
        id: `seed-${String(i).padStart(2, "0")}`,
        name: `${names[i % names.length]} ${i % 7 === 0 ? "K" : "J"}`,
        lastInvested: investedPool[i % investedPool.length],
        lastContacted: contactedPool[(i * 3 + 1) % contactedPool.length],
        signals: signalsPool[i % signalsPool.length],
      }),
    );
    const orderOf = (input: ClientRecord[]): string[] =>
      sortRadarRecords(input, TODAY).map((r) => r.id);
    const baseline = orderOf(records);
    // Deterministic permutation (rotate + interleave): no randomness.
    const rotated = [...records.slice(17), ...records.slice(0, 17)];
    const interleaved = records.filter((_, i) => i % 2 === 0).concat(
      records.filter((_, i) => i % 2 === 1),
    );
    expect(orderOf(rotated)).toEqual(baseline);
    expect(orderOf(interleaved)).toEqual(baseline);
    expect(orderOf([...records].reverse())).toEqual(baseline);
    // And the baseline itself is fully deterministic: priority classes
    // never decrease along the queue.
    const classes = sortRadarRecords(records, TODAY).map((r) => radarPriorityClass(r.signals));
    expect([...classes].sort((a, b) => a - b)).toEqual(classes);
  });
});
