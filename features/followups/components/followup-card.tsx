"use client";

import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDisplayDate, buildDirectMessage } from "../model";
import type { FollowUpRow } from "../types";

interface FollowUpCardProps {
  row: FollowUpRow;
  onMessage: (row: FollowUpRow) => void;
  onDone: (id: string) => void;
  onUndo: (id: string) => void;
}

function dueLabel(row: FollowUpRow): { text: string; className: string } {
  switch (row.status) {
    case "overdue":
      return {
        text: row.daysOverdue === 1 ? "1 day overdue" : `${row.daysOverdue} days overdue`,
        className: "text-red-700",
      };
    case "today":
      return { text: "Due today", className: "text-amber-700" };
    case "upcoming":
      return { text: formatDisplayDate(row.date), className: "text-stone-500" };
  }
}

/** One follow-up: who, why, when — plus WhatsApp / Message / Done. */
export function FollowUpCard({ row, onMessage, onDone, onUndo }: FollowUpCardProps) {
  if (row.done) {
    return (
      <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
        <p className="text-sm text-stone-500">
          ✓ <span className="line-through">{row.name}</span> — done
        </p>
        <Button variant="ghost" onClick={() => onUndo(row.id)} className="min-h-[44px] px-2">
          Undo
        </Button>
      </div>
    );
  }

  const due = dueLabel(row);
  const waUrl = row.phoneValid ? buildWhatsAppUrl(buildDirectMessage(row), row.phone) : null;

  return (
    <article
      aria-label={`Follow up with ${row.name}`}
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-stone-900">{row.name}</h3>
        <p className={cn("shrink-0 text-xs font-medium", due.className)}>{due.text}</p>
      </div>
      {(row.reason || row.note) && (
        <p className="mt-1 text-sm text-stone-600">
          {[row.reason, row.note].filter((part) => part.length > 0).join(" · ")}
        </p>
      )}
      {!row.phoneValid && (
        <p className="mt-2 text-xs text-stone-500">
          {row.phone
            ? "Mobile number needs checking — Message still available."
            : "Mobile unavailable — Message still available."}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonClasses("primary"), "sm:flex-1")}
          >
            WhatsApp
          </a>
        ) : null}
        <Button variant="secondary" onClick={() => onMessage(row)} className="sm:flex-1">
          Message
        </Button>
        <Button variant="secondary" onClick={() => onDone(row.id)} className="sm:flex-1">
          Done
        </Button>
      </div>
    </article>
  );
}
