import { daysBetweenYMD, formatDisplayDate } from "@/lib/dates";
import type { ClientRecord, Signal } from "./types";

/** Fixed product rule: invested within the last 30 days (inclusive). */
export const RECENT_INVESTOR_DAYS = 30;

/** The only reconnect intervals the UI may offer. The domain accepts any positive integer. */
export const RECONNECT_INTERVAL_OPTIONS = [30, 60, 90, 120, 180] as const;

export const DEFAULT_RECONNECT_INTERVAL_DAYS = 90;

export interface SignalInput {
  lastInvested: string | null;
  lastContacted: string | null;
  isNewClient: boolean;
}

/**
 * Computes radar signals from two dates and one explicit flag.
 * Deterministic: same inputs + same today + same interval = same signals.
 *
 * Attention semantics (the product rule "once I have spoken to this
 * client, stop telling me to speak to them for that same reason"):
 * - "new-client" fires only while the client was never contacted
 *   (isNewClient AND lastContacted === null). Speaking to a new client
 *   resolves that reason; the stored is_new_client flag itself is left
 *   untouched as explicit metadata.
 * - "reconnect-due" is purely date-driven, so a contacted client becomes
 *   due again naturally once the interval passes.
 */
export function computeSignals(
  input: SignalInput,
  todayYMD: string,
  reconnectIntervalDays: number = DEFAULT_RECONNECT_INTERVAL_DAYS,
): Signal[] {
  const signals: Signal[] = [];

  if (
    input.lastInvested !== null &&
    daysBetweenYMD(input.lastInvested, todayYMD) <= RECENT_INVESTOR_DAYS
  ) {
    signals.push("recent-investor");
  }
  // Blank Last Contacted means never recorded — that is the most due of all.
  if (
    input.lastContacted === null ||
    daysBetweenYMD(input.lastContacted, todayYMD) >= reconnectIntervalDays
  ) {
    signals.push("reconnect-due");
  }
  if (input.isNewClient && input.lastContacted === null) {
    signals.push("new-client");
  }
  return signals;
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
    reasons.push(`Recent investor · invested ${formatDisplayDate(input.lastInvested)}`);
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

/** Priority class for ordering: 1 hottest → 5 no signal (All-clients view only). */
export function radarPriorityClass(signals: Signal[]): 1 | 2 | 3 | 4 | 5 {
  const has = (s: Signal): boolean => signals.includes(s);
  if (has("recent-investor") && has("reconnect-due")) return 1;
  if (has("recent-investor")) return 2;
  if (has("new-client")) return 3;
  if (has("reconnect-due")) return 4;
  return 5;
}

function daysSinceContact(rec: ClientRecord, todayYMD: string): number | null {
  if (rec.lastContacted === null) return null;
  return daysBetweenYMD(rec.lastContacted, todayYMD);
}

/**
 * Full ordering: recent+reconnect (invested desc) → recent (invested desc) →
 * new (file order) → reconnect (never-contacted first, then longest silence) →
 * no signal (file order). Stable final tiebreak on rowNumber.
 */
export function sortRadarRecords(records: ClientRecord[], todayYMD: string): ClientRecord[] {
  const priorityOf = (rec: ClientRecord): number => radarPriorityClass(rec.signals);
  return [...records].sort((a, b) => {
    const priorityDiff = priorityOf(a) - priorityOf(b);
    if (priorityDiff !== 0) return priorityDiff;
    const priority = priorityOf(a);

    if ((priority === 1 || priority === 2) && a.lastInvested && b.lastInvested) {
      if (a.lastInvested !== b.lastInvested) return a.lastInvested < b.lastInvested ? 1 : -1;
      return a.rowNumber - b.rowNumber;
    }
    if (priority === 3) return a.rowNumber - b.rowNumber;
    if (priority === 4) {
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
