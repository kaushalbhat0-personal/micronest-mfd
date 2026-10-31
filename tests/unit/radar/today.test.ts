import { describe, expect, it } from "vitest";
import {
  buildTodayItems,
  contactedToday,
  countToday,
  displayDay,
  dueWords,
  filterTodayItems,
  greetingFor,
  parseTodayFilter,
  primaryActionFor,
  upcomingFollowups,
  wasContactedToday,
} from "@/features/radar/today";
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

describe("parseTodayFilter", () => {
  it("accepts the five supported filters", () => {
    for (const f of ["all", "attention", "followups", "reconnect", "new"] as const) {
      expect(parseTodayFilter(f)).toBe(f);
    }
  });

  it("falls back to attention for legacy and unknown values", () => {
    expect(parseTodayFilter("recent")).toBe("attention");
    expect(parseTodayFilter(undefined)).toBe("attention");
    expect(parseTodayFilter("bulk-export")).toBe("attention");
  });
});

describe("primaryActionFor", () => {
  it("is message when the phone is missing or invalid", () => {
    expect(primaryActionFor({ phoneValid: false, signals: ["reconnect-due"] })).toBe("message");
    expect(primaryActionFor({ phoneValid: false, signals: [] })).toBe("message");
  });

  it("is whatsapp for recent investors with a valid phone", () => {
    expect(primaryActionFor({ phoneValid: true, signals: ["recent-investor"] })).toBe("whatsapp");
    expect(
      primaryActionFor({ phoneValid: true, signals: ["recent-investor", "reconnect-due"] }),
    ).toBe("whatsapp");
  });

  it("is call for reconnect and new clients with a valid phone", () => {
    expect(primaryActionFor({ phoneValid: true, signals: ["reconnect-due"] })).toBe("call");
    expect(primaryActionFor({ phoneValid: true, signals: ["new-client"] })).toBe("call");
    expect(primaryActionFor({ phoneValid: true, signals: [] })).toBe("call");
  });
});

describe("dueWords", () => {
  it("uses singular and plural overdue wording", () => {
    expect(dueWords("overdue", 1, TODAY)).toBe("1 day overdue");
    expect(dueWords("overdue", 9, TODAY)).toBe("9 days overdue");
  });

  it("names today and formats upcoming dates", () => {
    expect(dueWords("today", 0, TODAY)).toBe("Due today");
    expect(dueWords("upcoming", 0, "2026-10-28")).toBe("Due 28/10/2026");
  });
});

describe("buildTodayItems", () => {
  it("ranks overdue follow-ups first, then due-today, then domain order", () => {
    const plain = record({ id: "plain", name: "Plain", signals: ["recent-investor"] });
    const dueToday = record({ id: "due", name: "Due", signals: [] });
    const overdue = record({ id: "over", name: "Over", signals: [] });
    const items = buildTodayItems(
      [plain, dueToday, overdue],
      [
        followup({ id: "f1", clientId: "due", dueDate: TODAY, reason: "Call back" }),
        followup({ id: "f2", clientId: "over", dueDate: "2026-10-20", reason: "Overdue call" }),
      ],
      TODAY,
    );
    expect(items.map((i) => i.record.id)).toEqual(["over", "due", "plain"]);
    expect(items[0].why?.kind).toBe("followup-overdue");
    expect(items[0].why?.title).toContain("6 days overdue");
    expect(items[1].why?.kind).toBe("followup-today");
  });

  it("prefers derived-signal reasons when no follow-up exists", () => {
    const items = buildTodayItems(
      [
        record({
          id: "r1",
          signals: ["recent-investor"],
          lastInvested: "2026-10-12",
        }),
      ],
      [],
      TODAY,
    );
    expect(items[0].why?.kind).toBe("recent");
    expect(items[0].why?.detail).toContain("12/10/2026");
  });

  it("reports reconnect silence factually and new clients plainly", () => {
    const items = buildTodayItems(
      [
        record({ id: "r1", signals: ["reconnect-due"], lastContacted: "2026-08-25" }),
        record({ id: "n1", name: "New", signals: ["new-client"], isNewClient: true }),
      ],
      [],
      TODAY,
    );
    expect(items.map((i) => i.why?.kind)).toEqual(["new", "reconnect"]);
    expect(items[1].why?.detail).toContain("days since you last spoke");
  });

  it("leaves why null for signal-free clients in the All view", () => {
    const items = buildTodayItems([record({ id: "q", signals: [] })], [], TODAY);
    expect(items[0].why).toBeNull();
  });

  it("keeps a contacted client in attention while an overdue follow-up is open", () => {
    const items = buildTodayItems(
      [record({ id: "c", name: "Contacted", signals: [], lastContacted: TODAY })],
      [followup({ id: "f", clientId: "c", dueDate: "2026-10-20", reason: "Late papers" })],
      TODAY,
    );
    expect(items).toHaveLength(1);
    expect(items[0].why?.kind).toBe("followup-overdue");
    expect(countToday(items).attention).toBe(1);
    expect(filterTodayItems(items, "attention")).toHaveLength(1);
  });

  it("drops a contacted client from attention once no reason remains", () => {
    const contacted = record({ id: "c", name: "Contacted", signals: [], lastContacted: TODAY });
    const due = record({
      id: "d",
      name: "Due",
      signals: ["reconnect-due"],
      lastContacted: "2026-07-21",
    });
    const items = buildTodayItems([contacted, due], [], TODAY);
    expect(countToday(items).attention).toBe(1);
    expect(filterTodayItems(items, "attention").map((i) => i.record.id)).toEqual(["d"]);
    expect(filterTodayItems(items, "all").map((i) => i.record.id)).toEqual(["d", "c"]);
  });
});

describe("filterTodayItems + countToday", () => {
  function sample() {
    return buildTodayItems(
      [
        record({ id: "o", name: "Over", signals: ["reconnect-due"], lastContacted: "2026-01-01" }),
        record({ id: "n", name: "New", signals: ["new-client"], isNewClient: true }),
        record({ id: "q", name: "Quiet", signals: [] }),
      ],
      [followup({ id: "f", clientId: "o", dueDate: "2026-10-20", reason: "Late" })],
      TODAY,
    );
  }

  it("counts the strip and filters consistently", () => {
    const items = sample();
    const counts = countToday(items);
    expect(counts).toMatchObject({
      total: 3,
      attention: 2,
      overdue: 1,
      dueToday: 0,
      reconnect: 1,
      followups: 1,
      fresh: 1,
    });
    expect(filterTodayItems(items, "attention").map((i) => i.record.id)).toEqual(["o", "n"]);
    expect(filterTodayItems(items, "followups").map((i) => i.record.id)).toEqual(["o"]);
    expect(filterTodayItems(items, "reconnect").map((i) => i.record.id)).toEqual(["o"]);
    expect(filterTodayItems(items, "new").map((i) => i.record.id)).toEqual(["n"]);
    expect(filterTodayItems(items, "all")).toHaveLength(3);
  });
});

describe("upcomingFollowups + contactedToday", () => {
  it("returns the earliest upcoming items capped at the limit", () => {
    const items = buildTodayItems(
      [record({ id: "a" }), record({ id: "b", name: "Bala" })],
      [
        followup({ id: "f3", clientId: "a", dueDate: "2026-11-05", reason: "Third" }),
        followup({ id: "f1", clientId: "a", dueDate: "2026-10-27", reason: "First" }),
        followup({ id: "f2", clientId: "b", dueDate: "2026-10-29", reason: "Second" }),
      ],
      TODAY,
    );
    const upcoming = upcomingFollowups(items, 2);
    expect(upcoming.map((u) => u.reason)).toEqual(["First", "Second"]);
    expect(upcoming[0].label).toBe("Due 27/10/2026");
  });

  it("lists clients contacted today", () => {
    const records = [
      record({ id: "t", lastContacted: TODAY }),
      record({ id: "y", name: "Yesterday", lastContacted: "2026-10-25" }),
    ];
    expect(contactedToday(records, TODAY).map((r) => r.id)).toEqual(["t"]);
  });

  it("flags the per-card contacted state from the persisted field only", () => {
    expect(wasContactedToday(record({ lastContacted: TODAY }), TODAY)).toBe(true);
    expect(wasContactedToday(record({ lastContacted: "2026-10-25" }), TODAY)).toBe(false);
    expect(wasContactedToday(record({ lastContacted: null }), TODAY)).toBe(false);
  });
});

describe("greetingFor + displayDay", () => {
  it("greets by time of day without a name", () => {
    const at = (h: number): Date => {
      const d = new Date(2026, 9, 26);
      d.setHours(h);
      return d;
    };
    expect(greetingFor(at(8))).toBe("Good morning");
    expect(greetingFor(at(13))).toBe("Good afternoon");
    expect(greetingFor(at(20))).toBe("Good evening");
  });

  it("formats the day line deterministically", () => {
    expect(displayDay("2026-10-26")).toBe("Mon 26 Oct");
  });
});
