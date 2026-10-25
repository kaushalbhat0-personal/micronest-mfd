"use client";

import { cn } from "@/lib/utils";
import type { FollowUpStatus } from "../types";

export type FollowUpFilter = "attention" | FollowUpStatus;

interface StatusChipsProps {
  counts: Record<FollowUpStatus, number>;
  value: FollowUpFilter;
  onChange: (filter: FollowUpFilter) => void;
}

const CHIPS: Array<{ id: FollowUpFilter; label: string; dot: string }> = [
  { id: "attention", label: "Attention", dot: "bg-red-500" },
  { id: "overdue", label: "Overdue", dot: "bg-red-500" },
  { id: "today", label: "Today", dot: "bg-amber-500" },
  { id: "upcoming", label: "Upcoming", dot: "bg-sky-600" },
];

/** Simple filter buttons with counts. Plain buttons — no tab component needed. */
export function StatusChips({ counts, value, onChange }: StatusChipsProps) {
  const attention = counts.overdue + counts.today;
  const countFor = (id: FollowUpFilter): number => (id === "attention" ? attention : counts[id]);

  return (
    <div
      role="group"
      aria-label="Filter follow-ups"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {CHIPS.map((chip) => {
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
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", chip.dot)} />
            {chip.label} · {countFor(chip.id)}
          </button>
        );
      })}
    </div>
  );
}
