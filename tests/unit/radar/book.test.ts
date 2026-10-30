import { describe, expect, it } from "vitest";
import { BOOK_FILTERS, bookPillForItem, countToday, filterBookItems } from "@/features/radar/book";
import { buildTodayItems } from "@/features/radar/today";
import type { ClientRecord } from "@/features/radar/types";
import type { StoredFollowup } from "@/features/followups/types";

const TODAY = "2026-10-26";

function record(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: "id-1",
    rowNumber: 1,
    name: "Asha Mehta",
    phone: "9876543210",
    phoneValid: true,
    investmentType: "SIP",
    lastInvested: null,
    lastContacted: null,
    isNewClient: false,
    note: "",
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

/**
 * RCCF-MFD-49: the Client Book composes the existing domain view-model
 * (buildTodayItems / countToday / filterTodayItems / filterClientsByName).
 * These tests pin the composition: filters, search interplay, and that
 * summary counts come from the same source as the Today queue.
 */
describe("filterBookItems", () => {
  it("returns everything in domain order for the all filter", () => {
    const items = buildTodayItems(
      [
        record({ id: "a", name: "Asha", signals: ["recent-investor"] }),
        record({ id: "b", name: "Bina", signals: [] }),
      ],
      [],
      TODAY,
    );
    expect(filterBookItems(items, "all", "").map((i) => i.record.id)).toEqual(["a", "b"]);
  });

  it("selects attention, follow-ups, and new slices from domain state", () => {
    const items = buildTodayItems(
      [
        record({ id: "hot", name: "Hot", signals: ["reconnect-due"] }),
        record({ id: "fresh", name: "Fresh", signals: ["new-client"], isNewClient: true }),
        record({ id: "plain", name: "Plain", signals: [] }),
      ],
      [followup({ id: "f1", clientId: "plain", dueDate: "2026-10-20", reason: "Ring back" })],
      TODAY,
    );
    // plain carries no signal but has an overdue follow-up: needs attention.
    expect(
      filterBookItems(items, "attention", "")
        .map((i) => i.record.id)
        .sort(),
    ).toEqual(["fresh", "hot", "plain"]);
    expect(filterBookItems(items, "followups", "").map((i) => i.record.id)).toEqual(["plain"]);
    expect(filterBookItems(items, "new", "").map((i) => i.record.id)).toEqual(["fresh"]);
  });

  it("composes the filter with a case-insensitive name search", () => {
    const items = buildTodayItems(
      [
        record({ id: "a", name: "Asha Mehta", signals: ["reconnect-due"] }),
        record({ id: "b", name: "Bina Shah", signals: ["reconnect-due"] }),
      ],
      [],
      TODAY,
    );
    expect(filterBookItems(items, "attention", "asha").map((i) => i.record.id)).toEqual(["a"]);
    expect(filterBookItems(items, "attention", "  ").map((i) => i.record.id)).toHaveLength(2);
    expect(filterBookItems(items, "attention", "zzz")).toHaveLength(0);
  });
});

describe("book summary counts", () => {
  it("derives attention, new, and follow-up counts from the same items", () => {
    const items = buildTodayItems(
      [
        record({ id: "a", name: "A", signals: ["reconnect-due"] }),
        record({ id: "b", name: "B", signals: ["new-client"], isNewClient: true }),
        record({ id: "c", name: "C", signals: [] }),
      ],
      [followup({ id: "f1", clientId: "c", dueDate: TODAY, reason: "Call" })],
      TODAY,
    );
    const counts = countToday(items);
    expect(counts.total).toBe(3);
    expect(counts.attention).toBe(3);
    expect(counts.fresh).toBe(1);
    expect(counts.followups).toBe(1);
    expect(BOOK_FILTERS.map((f) => f.id)).toEqual(["all", "attention", "followups", "new"]);
  });
});

describe("bookPillForItem", () => {
  function pillFor(recordOverrides: Partial<ClientRecord>, fuDate: string | null) {
    const rec = record(recordOverrides);
    const fus = fuDate ? [followup({ clientId: rec.id, dueDate: fuDate })] : [];
    const [item] = buildTodayItems([rec], fus, TODAY);
    return bookPillForItem(item);
  }

  it("ranks follow-up states above derived signals", () => {
    expect(pillFor({ signals: ["recent-investor"] }, "2026-10-20")?.label).toBe("Overdue");
    expect(pillFor({ signals: ["recent-investor"] }, TODAY)?.label).toBe("Due today");
    expect(pillFor({ signals: ["recent-investor"] }, "2026-11-02")?.label).toBe("Upcoming");
  });

  it("maps derived signals to the shared Today badge copy", () => {
    expect(pillFor({ signals: ["recent-investor"], lastInvested: TODAY }, null)?.label).toBe(
      "Recent",
    );
    expect(pillFor({ signals: ["reconnect-due"] }, null)?.label).toBe("Reconnect");
    expect(pillFor({ signals: ["new-client"], isNewClient: true }, null)?.label).toBe("New");
  });

  it("shows no pill when the client carries no signal and no follow-up", () => {
    expect(pillFor({ signals: [] }, null)).toBeNull();
  });

  it("carries a text label so status is never color-only", () => {
    const pill = pillFor({ signals: ["reconnect-due"] }, "2026-10-20");
    expect(pill?.label.length).toBeGreaterThan(0);
    expect(["emerald", "amber", "red", "stone"]).toContain(pill?.tone);
  });
});
