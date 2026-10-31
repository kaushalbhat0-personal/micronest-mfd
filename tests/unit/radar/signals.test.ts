import { describe, expect, it } from "vitest";
import {
  computeSignals,
  DEFAULT_RECONNECT_INTERVAL_DAYS,
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
    isNewClient: false,
    note: "",
    signals: [],
    ...overrides,
  };
}

describe("computeSignals / recent-investor", () => {
  it.each([
    ["2026-10-26", true],
    ["2026-10-25", true],
    ["2026-09-27", true],
    ["2026-09-26", true],
    ["2026-09-25", false],
  ])("invested %s with 30-day rule gives recent=%s", (invested, expected) => {
    const signals = computeSignals(
      { lastInvested: invested, lastContacted: TODAY, isNewClient: false },
      TODAY,
      90,
    );
    expect(signals.includes("recent-investor")).toBe(expected);
  });

  it("null lastInvested never qualifies", () => {
    const signals = computeSignals(
      { lastInvested: null, lastContacted: TODAY, isNewClient: false },
      TODAY,
      90,
    );
    expect(signals).not.toContain("recent-investor");
  });

  it("uses the fixed 30-day product rule", () => {
    expect(RECENT_INVESTOR_DAYS).toBe(30);
  });
});

describe("computeSignals / reconnect-due", () => {
  const base = { lastInvested: null as string | null, isNewClient: false };

  it.each([
    ["2026-10-26", false],
    ["2026-10-25", false],
    ["2026-07-29", false],
    ["2026-07-28", true],
    ["2026-07-27", true],
  ])("contacted %s with 90-day interval gives due=%s", (contacted, expected) => {
    const signals = computeSignals({ ...base, lastContacted: contacted }, TODAY, 90);
    expect(signals.includes("reconnect-due")).toBe(expected);
  });

  it("null lastContacted is always due (never recorded)", () => {
    for (const interval of RECONNECT_INTERVAL_OPTIONS) {
      const signals = computeSignals({ ...base, lastContacted: null }, TODAY, interval);
      expect(signals.includes("reconnect-due")).toBe(true);
    }
  });

  it.each([30, 60, 120, 180])("honours a %s-day interval", (interval) => {
    const signals = computeSignals({ ...base, lastContacted: "2026-10-26" }, TODAY, interval);
    expect(signals.includes("reconnect-due")).toBe(false);
  });

  it("uses 90 as the default interval", () => {
    expect(DEFAULT_RECONNECT_INTERVAL_DAYS).toBe(90);
    expect(RECONNECT_INTERVAL_OPTIONS).toEqual([30, 60, 90, 120, 180]);
  });
});

describe("computeSignals / new-client and coexistence", () => {
  it("flags never-contacted new clients only", () => {
    const flagged = computeSignals(
      { lastInvested: null, lastContacted: null, isNewClient: true },
      TODAY,
      90,
    );
    expect(flagged).toContain("new-client");
    const unflagged = computeSignals(
      { lastInvested: "2026-10-26", lastContacted: null, isNewClient: false },
      TODAY,
      90,
    );
    expect(unflagged).not.toContain("new-client");
  });

  it("resolves the new-client reason once the client has been spoken to", () => {
    const before = computeSignals(
      { lastInvested: null, lastContacted: null, isNewClient: true },
      TODAY,
      90,
    );
    expect(before).toContain("new-client");
    const after = computeSignals(
      { lastInvested: null, lastContacted: TODAY, isNewClient: true },
      TODAY,
      90,
    );
    expect(after).not.toContain("new-client");
    expect(after).not.toContain("reconnect-due");
  });

  it("resolves the reconnect reason on contact but lets it return later", () => {
    const due = computeSignals(
      { lastInvested: null, lastContacted: "2026-07-21", isNewClient: false },
      TODAY,
      90,
    );
    expect(due).toContain("reconnect-due");
    const contacted = computeSignals(
      { lastInvested: null, lastContacted: TODAY, isNewClient: false },
      TODAY,
      90,
    );
    expect(contacted).not.toContain("reconnect-due");
    const stale = computeSignals(
      { lastInvested: null, lastContacted: "2026-07-21", isNewClient: false },
      "2026-10-26",
      30,
    );
    expect(stale).toContain("reconnect-due");
  });

  it("coexists: recent investor plus reconnect due plus new client", () => {
    const signals = computeSignals(
      { lastInvested: "2026-10-26", lastContacted: null, isNewClient: true },
      TODAY,
      90,
    );
    expect(signals).toEqual(["recent-investor", "reconnect-due", "new-client"]);
  });

  it("keeps the stored new-client flag untouched — only the signal resolves", () => {
    // The flag is explicit metadata; computeSignals never clears it.
    const input = { lastInvested: null, lastContacted: TODAY, isNewClient: true };
    computeSignals(input, TODAY, 90);
    expect(input.isNewClient).toBe(true);
  });
});

describe("reasonsFor", () => {
  it("builds factual reasons per signal", () => {
    expect(
      reasonsFor({ lastInvested: "2026-10-12", lastContacted: null }, ["recent-investor"], TODAY),
    ).toEqual(["Recent investor · invested 12/10/2026"]);
    expect(
      reasonsFor({ lastInvested: null, lastContacted: null }, ["reconnect-due"], TODAY),
    ).toEqual(["Follow-up due · haven't spoken yet"]);
    expect(
      reasonsFor({ lastInvested: null, lastContacted: "2026-07-21" }, ["reconnect-due"], TODAY),
    ).toEqual(["Follow-up due · 97 days since you last spoke"]);
    expect(reasonsFor({ lastInvested: null, lastContacted: TODAY }, ["new-client"], TODAY)).toEqual(
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
  it("orders recent-plus-reconnect above recent above new above reconnect above none", () => {
    expect(radarPriorityClass(["recent-investor", "reconnect-due"])).toBe(1);
    expect(radarPriorityClass(["recent-investor"])).toBe(2);
    expect(radarPriorityClass(["new-client"])).toBe(3);
    expect(radarPriorityClass(["reconnect-due"])).toBe(4);
    expect(radarPriorityClass([])).toBe(5);
    expect(radarPriorityClass(["recent-investor", "new-client"])).toBe(2);
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
        lastContacted: TODAY,
        isNewClient: true,
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
    expect(sortRadarRecords(records, TODAY).map((r) => r.rowNumber)).toEqual([
      2, 5, 8, 1, 4, 3, 6, 7,
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
