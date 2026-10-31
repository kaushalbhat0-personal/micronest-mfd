import { formatDisplayDate } from "@/lib/dates";
import { getFollowUpStatus } from "../followups/dates";
import type { StoredFollowup } from "../followups/types";
import { hasActionableSignal, NEW_INVESTMENT_DAYS, sortRadarRecords } from "./signals";
import type { ClientRecord } from "./types";

export type TodayFilter =
  "all" | "attention" | "followups" | "reconnect" | "new" | "recent" | "contacted";

/** Legacy `?filter=` values from the retired routes. Unknown → attention. */
export function parseTodayFilter(value: unknown): TodayFilter {
  if (
    value === "all" ||
    value === "attention" ||
    value === "followups" ||
    value === "reconnect" ||
    value === "new" ||
    value === "recent" ||
    value === "contacted"
  ) {
    return value;
  }
  return "attention";
}

export type PrimaryAction = "call" | "whatsapp" | "message";

export type WhyKind =
  "followup-overdue" | "followup-today" | "followup-upcoming" | "recent" | "reconnect" | "new";

export interface TodayWhy {
  kind: WhyKind;
  /** Short verb headline, e.g. "Reconnect — 62 days silent". */
  title: string;
  /** One factual detail line. */
  detail: string;
}

export interface TodayFollowup {
  id: string;
  reason: string;
  dueDate: string;
  status: "overdue" | "today" | "upcoming";
  daysOverdue: number;
}

export interface TodayItem {
  record: ClientRecord;
  /** Open follow-ups, overdue first, then earliest due. */
  followups: TodayFollowup[];
  hasOverdue: boolean;
  hasDueToday: boolean;
  primary: PrimaryAction;
  /** Null when the client carries no signal and no follow-up (All view). */
  why: TodayWhy | null;
}

export interface TodayCounts {
  total: number;
  attention: number;
  overdue: number;
  dueToday: number;
  reconnect: number;
  followups: number;
  fresh: number;
  /** Clients carrying the recent-investor context signal (any status). */
  recent: number;
  /** Clients whose persisted Last Contacted equals the given day. */
  contacted: number;
}

export interface UpcomingItem {
  clientId: string;
  clientName: string;
  reason: string;
  dueDate: string;
  label: string;
}

/**
 * Deterministic primary action. Phone validity dominates: without a valid
 * number there is nothing to tap but the detail view. Recent investors get
 * WhatsApp (share the win in writing); everyone else gets Call.
 */
export function primaryActionFor(
  record: Pick<ClientRecord, "phoneValid" | "signals">,
): PrimaryAction {
  if (!record.phoneValid) return "message";
  if (record.signals.includes("recent-investor")) return "whatsapp";
  return "call";
}

/** Plain due-date words. Paired with icon + color at render, never alone. */
export function dueWords(
  status: "overdue" | "today" | "upcoming",
  daysOverdue: number,
  dueDate: string,
): string {
  if (status === "overdue") {
    return daysOverdue === 1 ? "1 day overdue" : `${daysOverdue} days overdue`;
  }
  if (status === "today") return "Due today";
  return `Due ${formatDisplayDate(dueDate)}`;
}

function whyFor(
  record: ClientRecord,
  followups: TodayFollowup[],
  todayYMD: string,
): TodayWhy | null {
  const overdue = followups.find((f) => f.status === "overdue");
  if (overdue) {
    return {
      kind: "followup-overdue",
      title: `Follow-up overdue — ${dueWords("overdue", overdue.daysOverdue, overdue.dueDate)}`,
      detail: overdue.reason,
    };
  }
  const today = followups.find((f) => f.status === "today");
  if (today) {
    return { kind: "followup-today", title: "Follow-up due today", detail: today.reason };
  }
  // Actionable derived lifecycle outranks informational context: a new
  // relationship leads even when it also carries recent-investment
  // context, and reconnect only fires for established relationships
  // (the engine guarantees new + reconnect never co-fire).
  // "recent" stays visible as context but never as the top why when an
  // actionable reason exists.
  if (record.signals.includes("new-client")) {
    return { kind: "new", title: "New client", detail: "Say hello and set the rhythm" };
  }
  if (record.signals.includes("reconnect-due")) {
    const detail =
      record.lastContacted === null
        ? "Haven't spoken yet"
        : `${daysSince(record.lastContacted, todayYMD)} days since you last spoke`;
    return { kind: "reconnect", title: "Reconnect due", detail };
  }
  if (record.signals.includes("recent-investor") && record.lastInvested) {
    const age = daysSince(record.lastInvested, todayYMD);
    const title = age >= 0 && age <= NEW_INVESTMENT_DAYS ? "New investment" : "Recent investor";
    return {
      kind: "recent",
      title,
      detail: `Invested ${formatDisplayDate(record.lastInvested)}`,
    };
  }
  const upcoming = followups.find((f) => f.status === "upcoming");
  if (upcoming) {
    return {
      kind: "followup-upcoming",
      title: dueWords("upcoming", 0, upcoming.dueDate),
      detail: upcoming.reason,
    };
  }
  return null;
}

function daysSince(fromYMD: string, todayYMD: string): number {
  const from = Date.UTC(
    Number(fromYMD.slice(0, 4)),
    Number(fromYMD.slice(5, 7)) - 1,
    Number(fromYMD.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(todayYMD.slice(0, 4)),
    Number(todayYMD.slice(5, 7)) - 1,
    Number(todayYMD.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

/**
 * Builds the Today queue from domain records + open follow-ups.
 * No new signal engine: ordering reuses sortRadarRecords, follow-up
 * status reuses getFollowUpStatus. Explicit overdue/today follow-ups
 * outrank derived signals; remaining order is the domain order.
 */
export function buildTodayItems(
  records: ClientRecord[],
  openFollowups: StoredFollowup[],
  todayYMD: string,
): TodayItem[] {
  const byClient = new Map<string, TodayFollowup[]>();
  for (const stored of openFollowups) {
    if (stored.completedAt !== null) continue;
    const { status, daysOverdue } = getFollowUpStatus(stored.dueDate, todayYMD);
    const list = byClient.get(stored.clientId) ?? [];
    list.push({
      id: stored.id,
      reason: stored.reason,
      dueDate: stored.dueDate,
      status,
      daysOverdue,
    });
    byClient.set(stored.clientId, list);
  }
  for (const list of byClient.values()) {
    const rank = { overdue: 0, today: 1, upcoming: 2 } as const;
    list.sort((a, b) =>
      rank[a.status] !== rank[b.status]
        ? rank[a.status] - rank[b.status]
        : a.dueDate < b.dueDate
          ? -1
          : a.dueDate > b.dueDate
            ? 1
            : 0,
    );
  }

  const items: TodayItem[] = records.map((record) => {
    const followups = byClient.get(record.id) ?? [];
    return {
      record,
      followups,
      hasOverdue: followups.some((f) => f.status === "overdue"),
      hasDueToday: followups.some((f) => f.status === "today"),
      primary: primaryActionFor(record),
      why: whyFor(record, followups, todayYMD),
    };
  });

  const rank = { overdue: 0, today: 1, other: 2 } as const;
  const groupOf = (item: TodayItem): 0 | 1 | 2 => (item.hasOverdue ? 0 : item.hasDueToday ? 1 : 2);
  // Domain order is authoritative: sort each group with sortRadarRecords so
  // the relative order never diverges from the Clients/Detail views.
  const ordered = sortRadarRecords(
    items.map((i) => i.record),
    todayYMD,
  );
  const byId = new Map(items.map((i) => [i.record.id, i]));
  return ordered
    .map((record) => byId.get(record.id)!)
    .sort((a, b) => {
      const groupDiff =
        rank[groupOf(a) === 0 ? "overdue" : groupOf(a) === 1 ? "today" : "other"] -
        rank[groupOf(b) === 0 ? "overdue" : groupOf(b) === 1 ? "today" : "other"];
      if (groupDiff !== 0) return groupDiff;
      if (groupOf(a) === 0 && groupOf(b) === 0) {
        const aDays = Math.max(
          ...a.followups.filter((f) => f.status === "overdue").map((f) => f.daysOverdue),
        );
        const bDays = Math.max(
          ...b.followups.filter((f) => f.status === "overdue").map((f) => f.daysOverdue),
        );
        if (aDays !== bDays) return bDays - aDays;
      }
      // Stable: keep domain order within the group.
      return 0;
    });
}

export function filterTodayItems(
  items: TodayItem[],
  filter: TodayFilter,
  todayYMD?: string,
): TodayItem[] {
  switch (filter) {
    case "all":
      return items;
    case "attention":
      // MFD-66: actionable signals only — recent-investor context alone
      // never qualifies. Open follow-ups (any status) still count, as
      // before; this change only demotes the informational signal.
      return items.filter((i) => hasActionableSignal(i.record.signals) || i.followups.length > 0);
    case "followups":
      return items.filter((i) => i.followups.length > 0);
    case "reconnect":
      return items.filter((i) => i.record.signals.includes("reconnect-due"));
    case "new":
      // Derived lifecycle: the New slice is the new-relationship signal,
      // recomputed from dates at projection time — never the stored flag.
      return items.filter((i) => i.record.signals.includes("new-client"));
    case "recent":
      // Context only: every client carrying recent-investor, whether or
      // not an actionable reason also exists. Never feeds attention.
      return items.filter((i) => i.record.signals.includes("recent-investor"));
    case "contacted":
      // Session progress over the canonical Last Contacted field — the
      // same source as wasContactedToday/contactedToday. No second model:
      // the day is supplied by the caller so counts and slices agree.
      return todayYMD === undefined
        ? items.filter((i) => i.record.lastContacted !== null)
        : items.filter((i) => wasContactedToday(i.record, todayYMD));
  }
}

export function countToday(items: TodayItem[], todayYMD?: string): TodayCounts {
  const hasSignal = (i: TodayItem): boolean =>
    hasActionableSignal(i.record.signals) || i.followups.length > 0;
  const contacted =
    todayYMD === undefined
      ? items.filter((i) => i.record.lastContacted !== null).length
      : items.filter((i) => wasContactedToday(i.record, todayYMD)).length;
  return {
    total: items.length,
    attention: items.filter(hasSignal).length,
    overdue: items.filter((i) => i.hasOverdue).length,
    dueToday: items.filter((i) => i.hasDueToday).length,
    reconnect: items.filter((i) => i.record.signals.includes("reconnect-due")).length,
    followups: items.filter((i) => i.followups.length > 0).length,
    fresh: items.filter((i) => i.record.signals.includes("new-client")).length,
    recent: items.filter((i) => i.record.signals.includes("recent-investor")).length,
    contacted,
  };
}

/** Upcoming explicit follow-ups across the queue, earliest first, capped. */
export function upcomingFollowups(items: TodayItem[], limit = 3): UpcomingItem[] {
  const upcoming: UpcomingItem[] = [];
  for (const item of items) {
    for (const f of item.followups) {
      if (f.status !== "upcoming") continue;
      upcoming.push({
        clientId: item.record.id,
        clientName: item.record.name,
        reason: f.reason,
        dueDate: f.dueDate,
        label: dueWords("upcoming", 0, f.dueDate),
      });
    }
  }
  upcoming.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  return upcoming.slice(0, limit);
}

/** Clients contacted today — session progress, not a metric. */
export function contactedToday(records: ClientRecord[], todayYMD: string): ClientRecord[] {
  return records.filter((r) => r.lastContacted === todayYMD);
}

/**
 * Execution state for one queue card. True when the persisted
 * Last Contacted already equals today — i.e. the MFD has dealt with
 * this relationship in this session or an earlier one today. The only
 * source is the existing field; no separate activity state exists.
 */
export function wasContactedToday(
  record: Pick<ClientRecord, "lastContacted">,
  todayYMD: string,
): boolean {
  return record.lastContacted === todayYMD;
}

export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Tue 26 Oct" style date line from a YYYY-MM-DD day. Pure, locale-fixed. */
export function displayDay(todayYMD: string): string {
  const date = new Date(
    Number(todayYMD.slice(0, 4)),
    Number(todayYMD.slice(5, 7)) - 1,
    Number(todayYMD.slice(8, 10)),
  );
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}
