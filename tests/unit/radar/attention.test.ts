import { describe, expect, it } from "vitest";
import { buildTodayItems, countToday, filterTodayItems } from "@/features/radar/today";
import { filterBookItems } from "@/features/radar/book";
import { markContacted } from "@/features/radar/model";
import {
  computeSignals,
  hasActionableSignal,
  sortRadarRecords,
} from "@/features/radar/signals";
import { filterRadarRecords, summarizeRadar } from "@/features/radar/view";
import type { ClientRecord } from "@/features/radar/types";
import type { StoredFollowup } from "@/features/followups/types";

/**
 * MFD-66 — Credentialed Attention & Contact verification, domain level.
 * Recent-investor is CONTEXT, never attention. Actionable attention is
 * only new-client / reconnect-due (plus open follow-ups in the queue).
 * Contact resolves only the contact-resolved reasons; follow-ups,
 * flags, and amounts are never touched by a contact.
 */
const TODAY = "2026-10-31";

function record(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: "id-1",
    rowNumber: 1,
    name: "Asha Mehta",
    phone: "9876543210",
    phoneValid: true,
    investmentType: "SIP",
    sipAmountPaise: 500000,
    lumpsumAmountPaise: 2000000,
    lastInvested: null,
    lastContacted: null,
    isNewClient: false,
    note: "Prefers mornings",
    signals: [],
    ...overrides,
  };
}

function followup(overrides: Partial<StoredFollowup> = {}): StoredFollowup {
  return {
    id: "fu-1",
    clientId: "id-1",
    dueDate: TODAY,
    reason: "SIP review",
    note: "",
    completedAt: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  };
}

function signalsFor(rec: Pick<ClientRecord, "lastInvested" | "lastContacted" | "isNewClient">) {
  return computeSignals(
    {
      lastInvested: rec.lastInvested,
      lastContacted: rec.lastContacted,
      isNewClient: rec.isNewClient,
    },
    TODAY,
    90,
  );
}

describe("MFD-66 attention model", () => {
  it("Test A — new client: contact resolves attention without touching the flag", () => {
    const before = record({ id: "a", lastContacted: null, isNewClient: true });
    const beforeSignals = signalsFor(before);
    expect(beforeSignals).toContain("new-client");
    expect(hasActionableSignal(beforeSignals)).toBe(true);

    const after = markContacted({ ...before, signals: beforeSignals }, TODAY, 90);
    expect(after.lastContacted).toBe(TODAY);
    expect(after.signals).toEqual([]);
    expect(hasActionableSignal(after.signals)).toBe(false);
    // The stored flag is explicit metadata — contact resolves the reason,
    // never the flag.
    expect(after.isNewClient).toBe(true);

    const beforeItems = buildTodayItems([{ ...before, signals: beforeSignals }], [], TODAY);
    expect(countToday(beforeItems).attention).toBe(1);
    expect(filterTodayItems(beforeItems, "attention").map((i) => i.record.id)).toEqual(["a"]);

    const afterItems = buildTodayItems([after], [], TODAY);
    expect(countToday(afterItems).attention).toBe(0);
    expect(filterTodayItems(afterItems, "attention")).toHaveLength(0);
    // Contacted client drops below the client that still needs attention.
    const due = record({ id: "due", signals: ["reconnect-due"], lastContacted: "2026-07-21" });
    expect(sortRadarRecords([after, due], TODAY).map((r) => r.id)).toEqual(["due", "a"]);
  });

  it("Test B — reconnect-due: contact resolves the reason", () => {
    const before = record({ id: "b", lastContacted: "2026-07-21" });
    const beforeSignals = signalsFor(before);
    expect(beforeSignals).toEqual(["reconnect-due"]);

    const after = markContacted({ ...before, signals: beforeSignals }, TODAY, 90);
    expect(after.lastContacted).toBe(TODAY);
    expect(after.signals).toEqual([]);

    const items = buildTodayItems([after], [], TODAY);
    expect(countToday(items).attention).toBe(0);
    expect(filterTodayItems(items, "attention")).toHaveLength(0);
    expect(items[0].why).toBeNull();
  });

  it("Test C — recent investor only: informational, never attention", () => {
    // Mirrors the production reports: invested 25/10/2026, no other reason.
    const recent = record({
      id: "c",
      lastInvested: "2026-10-25",
      lastContacted: TODAY,
    });
    const sig = signalsFor(recent);
    expect(sig).toEqual(["recent-investor"]);
    expect(hasActionableSignal(sig)).toBe(false);

    const withSignals = { ...recent, signals: sig };
    expect(filterRadarRecords([withSignals], "attention")).toHaveLength(0);
    expect(summarizeRadar([withSignals]).attention).toBe(0);
    expect(summarizeRadar([withSignals]).recentInvestors).toBe(1);

    const items = buildTodayItems([withSignals], [], TODAY);
    expect(countToday(items).attention).toBe(0);
    expect(filterTodayItems(items, "attention")).toHaveLength(0);
    expect(filterTodayItems(items, "all")).toHaveLength(1);
    // Still visible in Clients with its Recent context line.
    expect(filterBookItems(items, "all", "")).toHaveLength(1);
    expect(filterBookItems(items, "attention", "")).toHaveLength(0);
    expect(items[0].why?.kind).toBe("recent");
    expect(items[0].why?.detail).toContain("25/10/2026");
  });

  it("Test D — recent investor + already contacted: not attention, keeps Recent badge", () => {
    const rec = { ...record({ id: "d", lastInvested: "2026-10-17", lastContacted: TODAY }), signals: ["recent-investor"] as ClientRecord["signals"] };
    const items = buildTodayItems([rec], [], TODAY);
    expect(countToday(items).attention).toBe(0);
    expect(items[0].why?.kind).toBe("recent");
    // Ordering: recent-only context sorts below actionable, above no-signal.
    const actionable = record({ id: "act", signals: ["reconnect-due"], lastContacted: "2026-07-21" });
    const quiet = record({ id: "q", signals: [] });
    expect(sortRadarRecords([rec, actionable, quiet], TODAY).map((r) => r.id)).toEqual([
      "act",
      "d",
      "q",
    ]);
  });

  it("Test E — contacted + overdue follow-up: attention remains, contact never clears the follow-up", () => {
    const contacted = record({ id: "e", lastContacted: TODAY, signals: [] });
    const items = buildTodayItems(
      [contacted],
      [followup({ id: "f", clientId: "e", dueDate: "2026-10-20", reason: "Late papers" })],
      TODAY,
    );
    expect(countToday(items).attention).toBe(1);
    expect(items[0].why?.kind).toBe("followup-overdue");

    // "I spoke to them" only rewrites lastContacted + signals; the
    // open follow-up list is untouched, so the reason survives.
    const afterContact = markContacted(contacted, TODAY, 90);
    expect(afterContact.signals).toEqual([]);
    const afterItems = buildTodayItems(
      [afterContact],
      [followup({ id: "f", clientId: "e", dueDate: "2026-10-20", reason: "Late papers" })],
      TODAY,
    );
    expect(countToday(afterItems).attention).toBe(1);
    expect(afterItems[0].why?.kind).toBe("followup-overdue");
  });

  it("Test F — multiple reasons: contact removes only the contact-resolved reason", () => {
    const both = record({ id: "f", lastContacted: "2026-07-21", signals: ["reconnect-due"] });
    const fu = followup({ id: "of", clientId: "f", dueDate: "2026-10-20", reason: "Overdue call" });
    const before = buildTodayItems([both], [fu], TODAY);
    expect(countToday(before).attention).toBe(1);
    expect(before[0].why?.kind).toBe("followup-overdue");

    const afterContact = markContacted(both, TODAY, 90);
    expect(afterContact.signals).toEqual([]);
    const after = buildTodayItems([afterContact], [fu], TODAY);
    // Still attention: the overdue follow-up is independent of contact.
    expect(countToday(after).attention).toBe(1);
    expect(filterTodayItems(after, "attention")).toHaveLength(1);

    // Completing the follow-up removes the remaining reason.
    const cleared = buildTodayItems([afterContact], [], TODAY);
    expect(countToday(cleared).attention).toBe(0);
    expect(cleared[0].why).toBeNull();
  });

  it("contact preserves amounts, note, type, and flags", () => {
    const before = record({
      id: "g",
      lastInvested: "2026-10-25",
      lastContacted: null,
      isNewClient: true,
      investmentType: "Both",
      sipAmountPaise: 500000,
      lumpsumAmountPaise: 2000000,
      note: "Do not lose",
      signals: ["recent-investor", "reconnect-due", "new-client"],
    });
    const after = markContacted(before, TODAY, 90);
    expect(after.isNewClient).toBe(true);
    expect(after.investmentType).toBe("Both");
    expect(after.sipAmountPaise).toBe(500000);
    expect(after.lumpsumAmountPaise).toBe(2000000);
    expect(after.note).toBe("Do not lose");
    expect(after.lastInvested).toBe("2026-10-25");
    // Recent context survives contact; actionable reasons resolve.
    expect(after.signals).toEqual(["recent-investor"]);
    expect(hasActionableSignal(after.signals)).toBe(false);
  });

  it("Client Book and Today agree on the same attention set", () => {
    const actionable = record({ id: "a1", signals: ["reconnect-due"], lastContacted: "2026-07-21" });
    const recentOnly = record({ id: "r1", signals: ["recent-investor"], lastInvested: "2026-10-25", lastContacted: TODAY });
    const quiet = record({ id: "q1", signals: [] });
    const items = buildTodayItems([recentOnly, actionable, quiet], [], TODAY);
    const attentionIds = filterTodayItems(items, "attention").map((i) => i.record.id);
    expect(attentionIds).toEqual(["a1"]);
    expect(filterBookItems(items, "attention", "").map((i) => i.record.id)).toEqual(["a1"]);
    expect(countToday(items).attention).toBe(summarizeRadar(items.map((i) => i.record)).attention);
  });

  it("produced 25/10/2026-style report rows are recent-only when contact is fresh", () => {
    for (const invested of ["2026-10-25", "2026-10-17", "2026-10-16"]) {
      const sig = computeSignals(
        { lastInvested: invested, lastContacted: TODAY, isNewClient: false },
        TODAY,
        90,
      );
      expect(sig).toEqual(["recent-investor"]);
      expect(hasActionableSignal(sig)).toBe(false);
    }
  });
});
