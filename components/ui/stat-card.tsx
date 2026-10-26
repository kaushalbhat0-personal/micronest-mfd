import * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconTone: string;
  valueTone: string;
  /** Toggle state when the stat mirrors a filter 1:1. */
  pressed?: boolean;
  onSelect: () => void;
  ariaLabel?: string;
}

/**
 * Shared attention stat card: icon + tabular number + short label.
 * Used by the Today command center. Pressed state only when the stat
 * maps 1:1 to a filter — otherwise selection lives in the filter rail.
 */
export function StatCard({
  icon,
  label,
  value,
  pressed,
  iconTone,
  valueTone,
  onSelect,
  ariaLabel,
}: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={pressed}
      aria-label={ariaLabel ?? `${label}: ${value}`}
      className={cn(
        "flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border border-stone-200 bg-white px-2 py-3 shadow-sm lg:min-h-[112px] lg:flex-row lg:gap-3 lg:px-5 lg:py-4 lg:text-left",
        "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
        pressed && "border-emerald-900 ring-1 ring-inset ring-emerald-900",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full lg:h-10 lg:w-10",
          iconTone,
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col items-center lg:items-start">
        <span className={cn("tnum text-2xl font-semibold tracking-tight lg:text-3xl", valueTone)}>
          {value}
        </span>
        <span className="text-xs text-stone-600 lg:text-sm">{label}</span>
      </span>
    </button>
  );
}
