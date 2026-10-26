import * as React from "react";
import { cn } from "@/lib/utils";

export type SignalTone = "emerald" | "amber" | "red" | "stone";

const TONES: Record<SignalTone, string> = {
  emerald: "bg-emerald-50 text-emerald-900",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-50 text-red-800",
  stone: "bg-stone-100 text-stone-700",
};

interface SignalBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: SignalTone;
}

/**
 * Shared status pill (RCCF-MFD-38). Text always carries the meaning;
 * tint only reinforces it. For filter/query controls use Chip instead.
 */
export function SignalBadge({ tone = "stone", className, children, ...rest }: SignalBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
