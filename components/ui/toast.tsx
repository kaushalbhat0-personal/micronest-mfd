import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToastData {
  id: number;
  tone: "success" | "error";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Lightweight status feedback (RCCF-MFD-29 Phase A). Presentational only —
 * the caller owns timing and dismissal. Success announces politely,
 * errors assertively. Optional action slot supports "You spoke to … · Undo".
 */
export function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm",
        toast.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-red-300 bg-red-50 text-red-900",
      )}
    >
      <p className="text-sm font-medium">{toast.message}</p>
      <span className="flex shrink-0 items-center gap-1">
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onDismiss();
            }}
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
          >
            {toast.actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
