import { daysBetweenYMD, formatDisplayDate } from "@/lib/dates";
import type { ClientRecord, Signal } from "./types";

/** Fixed product rule: invested within the last 30 days (inclusive). */
export const RECENT_INVESTOR_DAYS = 30;

/** Fixed product rule: invested within the last 3 days (inclusive). A subset of the recent window. */
export const NEW_INVESTMENT_DAYS = 3;

/** The only reconnect intervals the UI may offer. The domain accepts any positive integer. */
export const RECONNECT_INTERVAL_OPTIONS = [30, 60, 90, 120, 180] as const;

export const DEFAULT_RECONNECT_INTERVAL_DAYS = 90;

export interface SignalInput {
  lastInvested: string | null;
  lastContacted: string | null;
}

/**
 * Investment recency derived from the calendar only. No flags, no contact
 * state — pure distance from today. Future-dated investments never classify
 * as new/recent (data error, not a fresh investment).
 */
export type InvestmentRecency = "new" | "recent" | "older" | "none";

export function investmentRecency(
  lastInvested: string | null,
  todayYMD: string,
): InvestmentRecency {
  if (lastInvested === null) return "none";
  const age = daysBetweenYMD(lastInvested, todayYMD);
  if (age < 0) return "none";
  if (age <= NEW_INVESTMENT_DAYS) return "new";
  if (age <= RECENT_INVESTOR_DAYS) return "recent";
  return "older";
}

/**
 * Relationship lifecycle derived from contact state + investment history.
 * A never-contacted person with no investment history, or with a
 * new/recent investment, is a NEW relationship — first contact is still
 * owed. A never-contacted person whose investment history is older than
 * the recent window is an established (quiet) relationship instead.
 * First contact graduates the lifecycle unconditionally.
 */
export function isNewRelationship(
  lastInvested: string | null,
  lastContacted: string | null,
  todayYMD: string,
): boolean {
  if (lastContacted !== null) return false;
  const recency = investmentRecency(lastInvested, todayYMD);
  return recency === "none" || recency === "new" || recency === "recent";
}

/**
 * Computes radar signals from two dates. Deterministic: same inputs + same
 * today + same interval = same signals.
 *
 * Calendar-derived lifecycle (MFD-70 replaces the persistent is_new_client
 * flag — the database column may remain unread, but nothing here consults
 * it):
 * - "new-client" fires exactly while isNewRelationship holds. Contact
 *   graduates the lifecycle; silence beyond the interval on an established
 *   relationship becomes "reconnect-due", never "new-client" again.
 * - "reconnect-due" is suppressed while the relationship is new, and fires
 *   for established quiet (never-contacted + older history counts as
 *   established). New and reconnect are mutually exclusive by construction.
 *
 * Product rule (MFD-66): "recent-investor" is CONTEXT, not attention.
 * A client who only invested recently — with no new relationship, no
 * reconnect due, and no open follow-up — must NOT count as needing
 * attention. It may still render as a "Recent" badge/line, but it never
 * inflates counts, filters, or priority on its own. Actionable attention
 * is only "reconnect-due" and "new-client" (plus open follow-ups, which
 * the today/book view-model owns).
 */
export function computeSignals(
  input: SignalInput,
  todayYMD: string,
  reconnectIntervalDays: number = DEFAULT_RECONNECT_INTERVAL_DAYS,
): Signal[] {
  const signals: Signal[] = [];

  const recency = investmentRecency(input.lastInvested, todayYMD);
  if (recency === "new" || recency === "recent") {
    signals.push("recent-investor");
  }
  const newRelationship = isNewRelationship(input.lastInvested, input.lastContacted, todayYMD);
  if (newRelationship) {
    signals.push("new-client");
  } else if (
    input.lastContacted === null ||
    daysBetweenYMD(input.lastContacted, todayYMD) >= reconnectIntervalDays
  ) {
    // Established quiet: never-contacted here means older investment
    // history (the new lifecycle already claimed the rest), so this is a
    // relationship gone quiet — not a fresh one.
    signals.push("reconnect-due");
  }
  return signals;
}

/**
 * The signals that count as ACTIONABLE attention. "recent-investor" is
 * deliberately absent: it is informational context, never a reason to
 * contact on its own. Single source of truth for every attention count,
 * filter, and ordering decision (view.ts, today.ts, book.ts).
 */
export const ACTIONABLE_SIGNALS = ["reconnect-due", "new-client"] as const;

/** True when the signal set carries at least one actionable reason. */
export function hasActionableSignal(signals: Signal[]): boolean {
  return signals.includes("reconnect-due") || signals.includes("new-client");
}

/**
 * Factual why-contact reasons derived from data only.
 * No urgency language, no advice — the MFD decides what they mean.
 */
export function reasonsFor(
  input: Pick<SignalInput, "lastInvested" | "lastContacted">,
  signals: Signal[],
  todayYMD: string,
): string[] {
  const reasons: string[] = [];
  if (signals.includes("recent-investor") && input.lastInvested) {
    const age = daysBetweenYMD(input.lastInvested, todayYMD);
    const label = age >= 0 && age <= NEW_INVESTMENT_DAYS ? "New investment" : "Recent investor";
    reasons.push(`${label} · invested ${formatDisplayDate(input.lastInvested)}`);
  }
  if (signals.includes("reconnect-due")) {
    if (input.lastContacted === null) {
      reasons.push("Follow-up due · haven't spoken yet");
    } else {
      const days = daysBetweenYMD(input.lastContacted, todayYMD);
      reasons.push(`Follow-up due · ${days} day${days === 1 ? "" : "s"} since you last spoke`);
    }
  }
  if (signals.includes("new-client")) {
    reasons.push("New client");
  }
  return reasons;
}

/** Priority class for ordering: 1 hottest → 5 no signal (All-clients view only).
 * Actionable reasons always outrank informational context: a recent-only
 * investor (4) sorts below every actionable client, so contacting someone
 * drops them below clients that still need attention instead of sticking
 * near the top. A recent investment only boosts an already-actionable
 * client into class 1. */
export function radarPriorityClass(signals: Signal[]): 1 | 2 | 3 | 4 | 5 {
  const has = (s: Signal): boolean => signals.includes(s);
  const actionable = has("reconnect-due") || has("new-client");
  if (has("recent-investor") && actionable) return 1;
  if (has("new-client")) return 2;
  if (has("reconnect-due")) return 3;
  if (has("recent-investor")) return 4;
  return 5;
}

function daysSinceContact(rec: ClientRecord, todayYMD: string): number | null {
  if (rec.lastContacted === null) return null;
  return daysBetweenYMD(rec.lastContacted, todayYMD);
}

/**
 * Full ordering: actionable+recent (invested desc) → new (file order) →
 * reconnect (never-contacted first, then longest silence) →
 * recent-only context (invested desc) → no signal (file order).
 * Stable final tiebreak on rowNumber.
 */
export function sortRadarRecords(records: ClientRecord[], todayYMD: string): ClientRecord[] {
  const priorityOf = (rec: ClientRecord): number => radarPriorityClass(rec.signals);
  return [...records].sort((a, b) => {
    const priorityDiff = priorityOf(a) - priorityOf(b);
    if (priorityDiff !== 0) return priorityDiff;
    const priority = priorityOf(a);

    if ((priority === 1 || priority === 4) && a.lastInvested && b.lastInvested) {
      if (a.lastInvested !== b.lastInvested) return a.lastInvested < b.lastInvested ? 1 : -1;
      return a.rowNumber - b.rowNumber;
    }
    if (priority === 2) return a.rowNumber - b.rowNumber;
    if (priority === 3) {
      const aDays = daysSinceContact(a, todayYMD);
      const bDays = daysSinceContact(b, todayYMD);
      if (aDays === null && bDays === null) return a.rowNumber - b.rowNumber;
      if (aDays === null) return -1;
      if (bDays === null) return 1;
      if (aDays !== bDays) return bDays - aDays;
      return a.rowNumber - b.rowNumber;
    }
    return a.rowNumber - b.rowNumber;
  });
}
