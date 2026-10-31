import { computeSignals, hasActionableSignal, sortRadarRecords } from "./signals";
import type { ClientRecord, Signal } from "./types";

export type RadarFilter = "attention" | Signal | "all";

export const RADAR_FILTERS: Array<{ id: RadarFilter; label: string }> = [
  { id: "attention", label: "Attention" },
  { id: "recent-investor", label: "Recent Investors" },
  { id: "reconnect-due", label: "Reconnect Due" },
  { id: "new-client", label: "New Clients" },
  { id: "all", label: "All Clients" },
];

/**
 * UI-only subsetting. The domain owns signals and ordering — this only
 * picks which slice of the already-prioritized collection to show.
 * The attention slice is ACTIONABLE only: recent-investor context alone
 * never qualifies (MFD-66 single source of truth: hasActionableSignal).
 * New is the derived new-relationship signal (MFD-70), never a stored flag.
 */
export function filterRadarRecords(records: ClientRecord[], filter: RadarFilter): ClientRecord[] {
  if (filter === "all") return records;
  if (filter === "attention") return records.filter((r) => hasActionableSignal(r.signals));
  return records.filter((r) => r.signals.includes(filter));
}

/**
 * Case-insensitive client-name search over the loaded list. Pure, local,
 * and non-destructive: the full dataset is preserved by the caller.
 * The query never leaves the device (never in the URL, never persisted).
 */
export function filterClientsByName(records: ClientRecord[], query: string): ClientRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return records;
  return records.filter((record) => record.name.toLowerCase().includes(needle));
}

export interface RadarSummary {
  total: number;
  attention: number;
  recentInvestors: number;
  reconnectDue: number;
  newClients: number;
}

/** Counts derived from domain signals. Attention counts ACTIONABLE
 * signals only — recent-investor context alone never qualifies. No
 * separate signal calculation. */
export function summarizeRadar(records: ClientRecord[]): RadarSummary {
  const has = (r: ClientRecord, s: Signal): boolean => r.signals.includes(s);
  return {
    total: records.length,
    attention: records.filter((r) => hasActionableSignal(r.signals)).length,
    recentInvestors: records.filter((r) => has(r, "recent-investor")).length,
    reconnectDue: records.filter((r) => has(r, "reconnect-due")).length,
    newClients: records.filter((r) => has(r, "new-client")).length,
  };
}

/**
 * Recomputes signals for every record when the reconnect interval changes,
 * then restores domain ordering. Signal rules stay in the domain.
 */
export function withReconnectInterval(
  records: ClientRecord[],
  todayYMD: string,
  intervalDays: number,
): ClientRecord[] {
  const next = records.map((r) => ({
    ...r,
    signals: computeSignals(
      { lastInvested: r.lastInvested, lastContacted: r.lastContacted },
      todayYMD,
      intervalDays,
    ),
  }));
  return sortRadarRecords(next, todayYMD);
}

/**
 * Plain greeting for the user-initiated WhatsApp handoff. No advice, no
 * template duplication — the MFD writes the actual message in the chat app.
 */
export function radarWhatsAppText(name: string): string {
  return `Hi ${name}, just reconnecting. Are you available for a quick chat this week?`;
}
