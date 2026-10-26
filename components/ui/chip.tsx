import * as React from "react";
import { cn } from "@/lib/utils";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  count?: number;
}

/**
 * Shared filter chip (RCCF-MFD-29 Phase A). Single-select semantics live
 * with the caller; the chip owns touch size, scroll behavior, and the
 * pressed announcement. Always text + optional count — never color alone.
 */
export function Chip({ selected, count, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-1",
        selected
          ? "border-emerald-900 bg-emerald-900 text-white"
          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100",
        className,
      )}
      {...rest}
    >
      {children}
      {typeof count === "number" && (
        <span className={cn("tnum text-xs", selected ? "text-emerald-100" : "text-stone-500")}>
          {count}
        </span>
      )}
    </button>
  );
}
