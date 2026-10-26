import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared contextual empty state (RCCF-MFD-38). Icon + title + hint with
 * an optional action — never a bare "Nothing here."
 */
export function EmptyState({ icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center shadow-sm",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
        >
          {icon}
        </span>
      )}
      <p className="text-base font-semibold text-stone-900">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-relaxed text-stone-600">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
