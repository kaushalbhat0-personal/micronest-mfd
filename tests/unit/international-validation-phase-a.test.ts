import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDisplayDate } from "@/lib/dates";
import { DEFAULT_LOCALE, formatDateLocale, resolveLocale } from "@/lib/locale";
import {
  effectiveVertical,
  hasInvestmentEvidence,
  resolveVerticalContext,
} from "@/lib/vertical";
import { investmentSummaryLine } from "@/features/radar/template";
import { buildTodayItems, dueWords, upcomingFollowups } from "@/features/radar/today";
import { reasonsFor } from "@/features/radar/signals";
import type { ClientRecord } from "@/features/radar/types";
import { DEFAULT_PREFS, loadPrefs } from "@/features/message-studio/prefs";
import { TEMPLATE_ORDER } from "@/features/message-studio/templates";

const TODAY = "2026-10-26";

function stubNavigator(language: string): void {
  vi.stubGlobal("navigator", { language });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function record(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: "client-1",
    rowNumber: 0,
    name: "Alex Morgan",
    phone: "+1 5551234567",
    phoneValid: true,
    investmentType: "Other",
    sipAmountPaise: null,
    lumpsumAmountPaise: null,
    lastInvested: null,
    lastContacted: null,
    note: "",
    signals: [],
    ...overrides,
  };
}

describe("vertical context (MFD-76 Phase A P0-3)", () => {
  it("resolves IN-region devices to the MFD vertical", () => {
    expect(resolveVerticalContext("IN")).toBe("mfd");
    expect(resolveVerticalContext("in")).toBe("mfd");
  });

  it("resolves generic regions to the generic vertical", () => {
    expect(resolveVerticalContext("US")).toBe("generic");
    expect(resolveVerticalContext("GB")).toBe("generic");
    expect(resolveVerticalContext("AU")).toBe("generic");
  });

  it("reads the browser region through the existing locale helper", () => {
    stubNavigator("en-US");
    expect(resolveLocale()).toBe("en-US");
    expect(resolveVerticalContext()).toBe("generic");
    stubNavigator("en-IN");
    expect(resolveVerticalContext()).toBe("mfd");
  });

  it("treats a bare activity date as non-evidence", () => {
    // A date alone never upgrades: the generic "Last activity" field maps
    // onto the same stored column, so evidence needs category or amounts.
    expect(
      hasInvestmentEvidence({ investmentType: "Other", sipAmountPaise: null }),
    ).toBe(false);
    expect(hasInvestmentEvidence({})).toBe(false);
  });

  it("treats a non-default category or recorded amount as MFD evidence", () => {
    expect(hasInvestmentEvidence({ investmentType: "SIP" })).toBe(true);
    expect(hasInvestmentEvidence({ investmentType: "Insurance" })).toBe(true);
    expect(hasInvestmentEvidence({ investmentType: "Other", sipAmountPaise: 500000 })).toBe(true);
    expect(hasInvestmentEvidence({ investmentType: "Other", lumpsumAmountPaise: 100 })).toBe(true);
  });

  it("upgrades generic surfaces to MFD wording only with record evidence", () => {
    expect(effectiveVertical({ investmentType: "Other" }, "generic")).toBe("generic");
    expect(effectiveVertical({ investmentType: "SIP" }, "generic")).toBe("mfd");
    expect(effectiveVertical({ investmentType: "Other" }, "mfd")).toBe("mfd");
  });
});

describe("investment summary line gating (MFD-76 Phase A P1-3)", () => {
  const empty = {
    investmentType: "Other" as const,
    sipAmountPaise: null,
    lumpsumAmountPaise: null,
    lastInvested: null,
  };

  it("keeps byte-identical MFD output by default", () => {
    expect(investmentSummaryLine(empty)).toBe("No investment details");
    expect(
      investmentSummaryLine({
        investmentType: "SIP",
        sipAmountPaise: 500000,
        lumpsumAmountPaise: null,
        lastInvested: null,
      }),
    ).toContain("Never invested");
    expect(
      investmentSummaryLine({
        investmentType: "SIP",
        sipAmountPaise: 500000,
        lumpsumAmountPaise: null,
        lastInvested: "2026-10-25",
      }),
    ).toContain("Invested 25/10/2026");
  });

  it("reads relationship-neutral for generic clients", () => {
    expect(investmentSummaryLine(empty, { vertical: "generic" })).toBe("No activity yet");
    expect(
      investmentSummaryLine({ ...empty, lastInvested: "2026-10-20" }, { vertical: "generic" }),
    ).toBe("Last activity 20/10/2026");
  });

  it("keeps MFD wording when the record carries investment evidence", () => {
    expect(
      investmentSummaryLine(
        {
          investmentType: "SIP",
          sipAmountPaise: 500000,
          lumpsumAmountPaise: null,
          lastInvested: null,
        },
        { vertical: "generic" },
      ),
    ).toContain("Never invested");
  });

  it("renders the activity date in the requested locale", () => {
    expect(
      investmentSummaryLine(
        { ...empty, lastInvested: "2026-10-25" },
        { vertical: "generic", locale: "en-US" },
      ),
    ).toBe("Last activity 10/25/2026");
    expect(
      investmentSummaryLine(
        {
          investmentType: "SIP",
          sipAmountPaise: 500000,
          lumpsumAmountPaise: null,
          lastInvested: "2026-10-25",
        },
        { locale: "en-GB" },
      ),
    ).toContain("Invested 25/10/2026");
  });
});

describe("today view-model locale gating (MFD-76 Phase A P1-4)", () => {
  it("keeps MFD wording and en-IN dates by default", () => {
    const rec = record({ lastInvested: "2026-10-20", signals: ["recent-investor"] });
    const [item] = buildTodayItems([rec], [], TODAY);
    expect(item.why?.title).toBe("Recent investor");
    expect(item.why?.detail).toBe("Invested 20/10/2026");
    expect(dueWords("upcoming", 0, "2026-10-30")).toBe("Due 30/10/2026");
  });

  it("reads relationship-neutral with a generic vertical", () => {
    const rec = record({ lastInvested: "2026-10-20", signals: ["recent-investor"] });
    const [item] = buildTodayItems([rec], [], TODAY, { vertical: "generic" });
    expect(item.why?.title).toBe("Recent activity");
    expect(item.why?.detail).toBe("Last activity 20/10/2026");
  });

  it("keeps MFD wording for evidence-carrying records on generic surfaces", () => {
    const rec = record({
      investmentType: "Lumpsum",
      lastInvested: "2026-10-20",
      signals: ["recent-investor"],
    });
    const [item] = buildTodayItems([rec], [], TODAY, { vertical: "generic" });
    expect(item.why?.title).toBe("Recent investor");
  });

  it("formats due dates in the requested locale without touching storage", () => {
    expect(dueWords("upcoming", 0, "2026-10-25", "en-US")).toBe("Due 10/25/2026");
    expect(dueWords("upcoming", 0, "2026-10-25", "en-GB")).toBe("Due 25/10/2026");
    const rec = record({ signals: [] });
    const upcoming = upcomingFollowups(
      buildTodayItems(
        [rec],
        [
          {
            id: "f1",
            clientId: "client-1",
            reason: "Call",
            dueDate: "2026-10-30",
            note: "",
            completedAt: null,
            createdAt: "2026-10-26T00:00:00.000Z",
          },
        ],
        TODAY,
      ),
      3,
      "en-US",
    );
    expect(upcoming[0]?.label).toBe("Due 10/30/2026");
  });
});

describe("detail reasons locale gating (MFD-76 Phase A P1-3/P1-4)", () => {
  it("keeps MFD wording by default", () => {
    expect(
      reasonsFor({ lastInvested: "2026-10-24", lastContacted: null }, ["recent-investor"], TODAY),
    ).toEqual(["New investment · invested 24/10/2026"]);
  });

  it("reads neutral for generic evidence-free records", () => {
    expect(
      reasonsFor({ lastInvested: "2026-10-24", lastContacted: null }, ["recent-investor"], TODAY, {
        vertical: "generic",
        evidence: { investmentType: "Other" },
      }),
    ).toEqual(["New activity · last activity 24/10/2026"]);
  });

  it("keeps MFD wording for evidence-carrying records on generic surfaces", () => {
    expect(
      reasonsFor({ lastInvested: "2026-10-24", lastContacted: null }, ["recent-investor"], TODAY, {
        vertical: "generic",
        evidence: { investmentType: "Both" },
      }),
    ).toEqual(["New investment · invested 24/10/2026"]);
  });
});

describe("date presentation locales (MFD-76 Phase A P1-4)", () => {
  it("renders en-IN, en-US, and en-GB distinctly", () => {
    expect(formatDisplayDate("2026-10-25")).toBe("25/10/2026");
    expect(formatDisplayDate("2026-10-25", "en-IN")).toBe("25/10/2026");
    expect(formatDisplayDate("2026-10-25", "en-US")).toBe("10/25/2026");
    expect(formatDisplayDate("2026-10-25", "en-GB")).toBe("25/10/2026");
    expect(formatDateLocale("2026-12-05", "en-US")).toBe("12/05/2026");
  });

  it("keeps the MFD-compatible default locale pinned", () => {
    expect(DEFAULT_LOCALE).toBe("en-IN");
  });
});

describe("message studio generic-first default (MFD-76 Phase A P0-5)", () => {
  it("defaults new users to the generic check-in purpose", () => {
    expect(DEFAULT_PREFS.purpose).toBe("check-in");
    expect(TEMPLATE_ORDER[0]).toBe("check-in");
  });

  it("falls back to check-in on unknown stored purposes", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => JSON.stringify({ purpose: "nope" }),
        setItem: () => {},
        removeItem: () => {},
      },
    });
    expect(loadPrefs().purpose).toBe("check-in");
  });

  it("never silently changes an existing user's selected purpose", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => JSON.stringify({ purpose: "document-request" }),
        setItem: () => {},
        removeItem: () => {},
      },
    });
    expect(loadPrefs().purpose).toBe("document-request");
  });
});
