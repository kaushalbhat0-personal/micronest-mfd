"use client";

import Link from "next/link";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { SignalBadge } from "@/components/ui/signal-badge";
import {
  ArrowRightIcon,
  ClockIcon,
  FileTextIcon,
  MessageIcon,
  PhoneIcon,
  WhyIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/dates";
import { buildCallUrl, buildWhatsAppUrl } from "@/lib/whatsapp";
import { dueWords } from "../today";
import { radarWhatsAppText } from "../view";
import { bookPillForItem } from "../book";
import { formatAmountContext } from "../template";
import type { TodayItem } from "../today";

function investmentLine(item: TodayItem): string {
  const { record } = item;
  const amount = formatAmountContext(record.investmentType, record.amountPaise);
  const base = amount ? `${record.investmentType} · ${amount}` : record.investmentType;
  if (record.lastInvested) {
    return `${base} · Invested ${formatDisplayDate(record.lastInvested)}`;
  }
  return `${base} · Never invested`;
}

function contactLine(item: TodayItem): string {
  const { record } = item;
  if (record.lastContacted) {
    return `Last spoke ${formatDisplayDate(record.lastContacted)}`;
  }
  return "Haven't spoken yet";
}

const ACTION_BASE =
  "inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900";

/**
 * One relationship row: who → why → next step. Lighter than a Today
 * card on purpose — the Client Book helps the MFD decide whether to
 * open the client, while Client Detail remains the action workspace.
 * Every status shown here is derived by the domain view-model; the
 * row only renders copy and links.
 */
export function ClientBookCard({ item }: { item: TodayItem }) {
  const { record, why, followups } = item;
  const pill = bookPillForItem(item);
  const detailHref = `/workspace/clients/${record.id}`;

  const callUrl = buildCallUrl(record.phone);
  const waUrl = record.phoneValid
    ? buildWhatsAppUrl(radarWhatsAppText(record.name), record.phone)
    : null;
  const firstFollowup = followups.length > 0 ? followups[0] : null;
  // The why line already carries follow-up status when the domain ranks
  // a follow-up first — the explicit line only adds information when the
  // top reason is signal-driven (or there is no reason at all).
  const showFollowupLine =
    firstFollowup !== null &&
    (why === null || why.kind === "recent" || why.kind === "reconnect" || why.kind === "new");

  return (
    <article
      aria-label={record.name}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-3">
        <ClientAvatar name={record.name} className="h-11 w-11 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-stone-900">{record.name}</h3>
            {pill && <SignalBadge tone={pill.tone}>{pill.label}</SignalBadge>}
          </div>
          {why && (
            <p className="tnum flex min-w-0 items-center gap-1.5 text-xs font-medium text-stone-800">
              <WhyIcon kind={why.kind} />
              <span className="truncate">
                {why.title} · {why.detail}
              </span>
            </p>
          )}
          <p className="tnum flex items-center gap-1.5 truncate text-xs text-stone-600">
            <FileTextIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{investmentLine(item)}</span>
          </p>
          <p className="tnum flex items-center gap-1.5 truncate text-xs text-stone-600">
            <ClockIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{contactLine(item)}</span>
          </p>
          {showFollowupLine && firstFollowup && (
            <p className="tnum flex items-center gap-1.5 truncate text-xs text-stone-600">
              <ClockIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {dueWords(firstFollowup.status, firstFollowup.daysOverdue, firstFollowup.dueDate)}
                {firstFollowup.reason ? ` · ${firstFollowup.reason}` : ""}
                {followups.length > 1 ? ` (+${followups.length - 1} more)` : ""}
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        {callUrl && (
          <a
            href={callUrl}
            aria-label={`Call ${record.name}`}
            className={cn(
              ACTION_BASE,
              "border-emerald-900/30 bg-white text-emerald-900 hover:bg-emerald-50",
            )}
          >
            <PhoneIcon aria-hidden="true" className="h-4 w-4" />
            Call
          </a>
        )}
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${record.name}`}
            className={cn(
              ACTION_BASE,
              "border-emerald-900/30 bg-white text-emerald-900 hover:bg-emerald-50",
            )}
          >
            <MessageIcon aria-hidden="true" className="h-4 w-4" />
            WhatsApp
          </a>
        )}
        <Link
          href={detailHref}
          aria-label={`View ${record.name}`}
          className={cn(ACTION_BASE, "border-stone-200 bg-white text-stone-700 hover:bg-stone-50")}
        >
          View
          <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
