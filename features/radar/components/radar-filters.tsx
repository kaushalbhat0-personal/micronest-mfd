"use client";

import { cn } from "@/lib/utils";
import { RADAR_FILTERS, type RadarFilter } from "../view";

interface RadarFiltersProps {
  counts: { attention: number; recent: number; reconnect: number; fresh: number; all: number };
  value: RadarFilter;
  onChange: (filter: RadarFilter) => void;
}

/** Simple filter buttons with domain-derived counts. Plain buttons only. */
export function RadarFilters({ counts, value, onChange }: RadarFiltersProps) {
  const countFor = (id: RadarFilter): number => {
    switch (id) {
      case "attention":
        return counts.attention;
      case "recent-investor":
        return counts.recent;
      case "reconnect-due":
        return counts.reconnect;
      case "new-client":
        return counts.fresh;
      case "all":
        return counts.all;
    }
  };

  return (
    <div role="group" aria-label="Filter clients" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {RADAR_FILTERS.map((chip) => {
        const selected = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(chip.id)}
            className={cn(
              "flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
              selected
                ? "border-2 border-emerald-900 bg-emerald-50 font-medium text-stone-900"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            {chip.label} · {countFor(chip.id)}
          </button>
        );
      })}
    </div>
  );
}
