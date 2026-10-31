import { describe, expect, it } from "vitest";
import { buildTodayItems, countToday, filterTodayItems } from "@/features/radar/today";
import { filterBookItems } from "@/features/radar/book";
import {
  computeSignals,
  hasActionableSignal,
  investmentRecency,
  isNewRelationship,
  NEW_INVESTMENT_DAYS,
  RECENT_INVESTOR_DAYS,
} from "@/features/radar/signals";
import { markContacted, parseAndBuildRadar } from "@/features/radar/model";
import type { ClientRecord } from "@/features/radar/types";
import type { StoredFollowup } from "@/features/followups/types";

/**
 * MFD-70 lifecycle characterization matrix. New is calendar-derived from
 * lastInvested + lastContacted — no stored flag anywhere.
 */
const TODAY = "2026-11-01";
const INTERVAL = 90;

let n = 0;
function rec(overrides: Partial<ClientRecord> = {}): ClientRecord {
  n += 1;
  const r: ClientRecord = {
    id: `lc${n}`, rowNumber: n, name: `LC${n}`, phone: "9876543210", phoneValid: true,
    investmentType: "SIP", sipAmountPaise: null, lumpsumAmountPaise: null,
    lastInvested: null, lastContacted: null, note: "", signals: [], ...overrides,
  };
  r.signals = computeSignals(
    { lastInvested: r.lastInvested, lastContacted: r.lastContacted },
    TODAY, INTERVAL,
  );
  return r;
}

function fu(clientId: string, dueDate: string): StoredFollowup {
  return {
    id: `f-${clientId}`, clientId, reason: "Papers", note: "",
    dueDate, completedAt: null, createdAt: `${TODAY}T00:00:00.000Z`,
  };
}

describe("MFD-70 investment recency boundaries", () => {
  it.each([
    ["2026-11-01", "new"], // A: 0 days
    ["2026-10-31", "new"], // 1 day
    ["2026-10-30", "new"], // 2 days
    ["2026-10-29", "new"], // D: 3 days
    ["2026-10-28", "recent"], // E: 4 days
    ["2026-10-12", "recent"], // F: 20 days
    ["2026-10-02", "recent"], // G: 30 days
    ["2026-10-01", "older"], // H: 31 days
    ["2026-05-01", "older"], // I: 6 months
  ])("invested %s → %s", (invested, expected) => {
    expect(investmentRecency(invested, TODAY)).toBe(expected);
  });

  it("null and future investments never classify (T)", () => {
    expect(investmentRecency(null, TODAY)).toBe("none");
    expect(investmentRecency("2026-11-02", TODAY)).toBe("none");
  });

  it("windows live in one domain place (B, I)", () => {
    expect(NEW_INVESTMENT_DAYS).toBe(3);
    expect(RECENT_INVESTOR_DAYS).toBe(30);
  });

  it("calendar transitions need no migration (W, X)", () => {
    expect(investmentRecency("2026-10-29", TODAY)).toBe("new");
    expect(investmentRecency("2026-10-28", TODAY)).toBe("recent");
    expect(investmentRecency("2026-10-02", TODAY)).toBe("recent");
    expect(investmentRecency("2026-10-01", TODAY)).toBe("older");
  });
});

describe("MFD-70 relationship lifecycle + target matrix", () => {
  function summarize(r: ClientRecord, fus: StoredFollowup[] = []) {
    const items = buildTodayItems([r], fus, TODAY);
    return {
      signals: r.signals,
      attn: countToday(items).attention,
      why: items[0].why?.kind ?? null,
      newF: filterTodayItems(items, "new").length,
      recF: filterTodayItems(items, "reconnect").length,
    };
  }

  it("never contacted, no investment → New (U, manual add)", () => {
    const s = summarize(rec());
    expect(s).toMatchObject({ signals: ["new-client"], attn: 1, why: "new", newF: 1, recF: 0 });
    expect(isNewRelationship(null, null, TODAY)).toBe(true);
  });

  it("never contacted, invested ≤3d → New + recent, headline New (C, D)", () => {
    for (const inv of ["2026-11-01", "2026-10-31", "2026-10-29"]) {
      const s = summarize(rec({ lastInvested: inv }));
      expect(s).toMatchObject({
        signals: ["recent-investor", "new-client"], attn: 1, why: "new", newF: 1, recF: 0,
      });
    }
  });

  it("never contacted, invested 4–30d → New + recent, headline New (E, F, G)", () => {
    for (const inv of ["2026-10-28", "2026-10-12", "2026-10-02"]) {
      const s = summarize(rec({ lastInvested: inv }));
      expect(s).toMatchObject({
        signals: ["recent-investor", "new-client"], attn: 1, why: "new", newF: 1, recF: 0,
      });
    }
  });

  it("never contacted, invested >30d → Reconnect, not New", () => {
    for (const inv of ["2026-10-01", "2026-05-01"]) {
      const s = summarize(rec({ lastInvested: inv }));
      expect(s).toMatchObject({
        signals: ["reconnect-due"], attn: 1, why: "reconnect", newF: 0, recF: 1,
      });
    }
  });

  it("contacted, invested ≤3d/≤30d → recent context only, no attention (N)", () => {
    expect(summarize(rec({ lastInvested: "2026-10-31", lastContacted: TODAY }))).toMatchObject({
      signals: ["recent-investor"], attn: 0, why: "recent", newF: 0, recF: 0,
    });
    expect(summarize(rec({ lastInvested: "2026-10-12", lastContacted: "2026-10-22" }))).toMatchObject({
      signals: ["recent-investor"], attn: 0, why: "recent", newF: 0, recF: 0,
    });
  });

  it("contacted, silence ≥90d → Reconnect (H)", () => {
    const s = summarize(rec({ lastInvested: "2026-05-01", lastContacted: "2026-07-24" }));
    expect(s).toMatchObject({ signals: ["reconnect-due"], attn: 1, why: "reconnect", recF: 1 });
  });

  it("quiet clients carry no signal and no attention", () => {
    const s = summarize(rec({ lastContacted: TODAY }));
    expect(s).toMatchObject({ signals: [], attn: 0, why: null, newF: 0, recF: 0 });
  });

  it("new investment alone and recent alone are context, never attention (I, J)", () => {
    for (const r of [
      rec({ lastInvested: "2026-10-31", lastContacted: TODAY }),
      rec({ lastInvested: "2026-10-12", lastContacted: TODAY }),
    ]) {
      expect(hasActionableSignal(r.signals)).toBe(false);
      expect(countToday(buildTodayItems([r], [], TODAY)).attention).toBe(0);
    }
  });

  it("first contact graduates the new relationship (G, V)", () => {
    const before = rec({ lastInvested: "2026-10-25" });
    expect(before.signals).toContain("new-client");
    const after = markContacted(before, TODAY, INTERVAL);
    expect(after.lastContacted).toBe(TODAY);
    expect(after.signals).toEqual(["recent-investor"]);
    const items = buildTodayItems([after], [], TODAY);
    expect(countToday(items).attention).toBe(0);
    expect(filterTodayItems(items, "new")).toHaveLength(0);
  });

  it("new + overdue / due-today follow-up stays actionable (K, L, P)", () => {
    const r = rec({ lastInvested: "2026-10-25" });
    const over = buildTodayItems([r], [fu(r.id, "2026-10-20")], TODAY);
    expect(countToday(over).attention).toBe(1);
    expect(over[0].why?.kind).toBe("followup-overdue");
    const due = buildTodayItems([r], [fu(r.id, TODAY)], TODAY);
    expect(countToday(due).attention).toBe(1);
    expect(due[0].why?.kind).toBe("followup-today");
  });

  it("new and reconnect are mutually exclusive (M)", () => {
    const invested = [null, "2026-11-01", "2026-10-28", "2026-10-02", "2026-10-01", "2026-05-01"];
    const contacted = [null, TODAY, "2026-10-22", "2026-07-01"];
    for (const lastInvested of invested) {
      for (const lastContacted of contacted) {
        const sig = computeSignals({ lastInvested, lastContacted }, TODAY, INTERVAL);
        expect(sig.includes("new-client") && sig.includes("reconnect-due")).toBe(false);
      }
    }
  });

  it("Today and Clients agree on every slice with matching counts (N, O, P, Q)", () => {
    const records = [
      rec({ id: "a-new", lastInvested: "2026-10-25" }),
      rec({ id: "b-due", lastInvested: "2026-05-01", lastContacted: "2026-07-01" }),
      rec({ id: "c-oldq", lastInvested: "2026-01-01" }),
      rec({ id: "d-recent", lastInvested: "2026-10-25", lastContacted: TODAY }),
      rec({ id: "e-quiet", lastContacted: TODAY }),
    ];
    const items = buildTodayItems(records, [], TODAY);
    const counts = countToday(items);
    expect(filterTodayItems(items, "attention")).toHaveLength(counts.attention);
    expect(filterTodayItems(items, "new")).toHaveLength(counts.fresh);
    expect(filterTodayItems(items, "reconnect")).toHaveLength(counts.reconnect);
    expect(filterTodayItems(items, "followups")).toHaveLength(counts.followups);
    expect(counts.attention).toBe(3); // new + due + old-quiet
    expect(counts.fresh).toBe(1);
    expect(counts.reconnect).toBe(2);
    // Book delegates to the same predicates and counts.
    expect(filterBookItems(items, "attention", "")).toHaveLength(counts.attention);
    expect(filterBookItems(items, "new", "")).toHaveLength(counts.fresh);
    expect(filterBookItems(items, "followups", "")).toHaveLength(counts.followups);
    expect(filterBookItems(items, "all", "")).toHaveLength(items.length);
  });
});

describe("MFD-70 import classification", () => {
  const HEADER = "Client Name,Mobile,Investment Type,SIP Amount,Lumpsum Amount,Last Invested,Last Contacted,Note";

  it("classifies only from row dates; import date has no meaning (R)", () => {
    const csv = [
      HEADER,
      "A,,SIP,,,31/10/2026,,",
      "B,,SIP,,,20/10/2026,,",
      "C,,SIP,,,10/08/2026,,",
      "D,,SIP,,,,,,",
    ].join("\n");
    const report = parseAndBuildRadar(csv, "2026-11-01", 90);
    expect(report.fileError).toBeNull();
    const byName = new Map(report.records.map((r) => [r.name, r]));
    // A: new investment + new relationship
    expect(byName.get("A")?.signals).toEqual(["recent-investor", "new-client"]);
    // B: recent + new relationship
    expect(byName.get("B")?.signals).toEqual(["recent-investor", "new-client"]);
    // C: older + never contacted → reconnect
    expect(byName.get("C")?.signals).toEqual(["reconnect-due"]);
    // D: no history + never contacted → new relationship
    expect(byName.get("D")?.signals).toEqual(["new-client"]);
  });

  it("retired New Client values cannot override derived lifecycle (S)", () => {
    const csv = [
      "Client Name,Mobile,Investment Type,Last Invested,Last Contacted,New Client,Note",
      "Oldie,9876543210,SIP,01/01/2026,,Y,Legacy flag",
    ].join("\n");
    const report = parseAndBuildRadar(csv, TODAY, 90);
    expect(report.fileError).toBeNull();
    // Older history + never contacted → reconnect, despite the Y flag.
    expect(report.records[0].signals).toEqual(["reconnect-due"]);
    expect(report.ignoredColumns).toContain("New Client");
  });
});
