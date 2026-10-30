import type { SignalTone } from "@/components/ui/signal-badge";
import { todaySignalBadge } from "./components/today-card";
import { countToday, filterTodayItems, type TodayCounts, type TodayItem } from "./today";
import { filterClientsByName } from "./view";

/**
 * Client Book view-model (RCCF-MFD-49). Composition only — every rule
 * lives in the existing domain:
 * - signals + ordering: signals.ts (via toClientRecord / sortRadarRecords)
 * - follow-up status + priority: followups/dates + today.ts (buildTodayItems)
 * - counts: countToday, search: filterClientsByName, slices: filterTodayItems
 * No business rules live here or in the JSX that consumes it.
 */

export type BookFilter = "all" | "attention" | "followups" | "new";

export const BOOK_FILTERS: Array<{ id: BookFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Attention" },
  { id: "followups", label: "Follow-ups" },
  { id: "new", label: "New" },
];

/**
 * Applies the attention slice first (domain order preserved — never
 * re-sorted here), then the name search. Used by the Client Book list.
 */
export function filterBookItems(
  items: TodayItem[],
  filter: BookFilter,
  query: string,
): TodayItem[] {
  const subset = filter === "all" ? items : filterTodayItems(items, filter);
  const records = filterClientsByName(
    subset.map((item) => item.record),
    query,
  );
  const keep = new Set(records.map((record) => record.id));
  return subset.filter((item) => keep.has(item.record.id));
}

export interface BookPill {
  label: string;
  tone: SignalTone;
}

/**
 * Presentation-only pill for a Client Book row. Reads the existing
 * TodayWhy kind — follow-up states outrank derived signals exactly as
 * they do on Today — so the book and the queue never disagree.
 * Null when the client carries no signal and no follow-up.
 */
export function bookPillForItem(item: TodayItem): BookPill | null {
  if (!item.why) return null;
  return todaySignalBadge(item.why.kind);
}

/** Re-exported so the book renders counts from the same source as Today. */
export { countToday, type TodayCounts, type TodayItem };
