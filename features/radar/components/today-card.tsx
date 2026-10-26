"use client";

import * as React from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { SignalBadge, type SignalTone } from "@/components/ui/signal-badge";
import {
  CheckIcon,
  ChevronDownIcon,
  DotsIcon,
  MessageIcon,
  PhoneIcon,
  WhyIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/dates";
import { buildCallUrl, buildWhatsAppUrl } from "@/lib/whatsapp";
import { radarWhatsAppText } from "../view";
import type { TodayItem, TodayWhy } from "../today";

function whyStyle(kind: TodayWhy["kind"]): { text: string; dot: string } {
  switch (kind) {
    case "followup-overdue":
      return { text: "text-red-800", dot: "bg-red-600" };
    case "followup-today":
      return { text: "text-amber-800", dot: "bg-amber-500" };
    case "followup-upcoming":
      return { text: "text-stone-700", dot: "bg-stone-400" };
    case "recent":
      return { text: "text-emerald-900", dot: "bg-emerald-700" };
    case "reconnect":
      return { text: "text-emerald-900", dot: "bg-emerald-700" };
    case "new":
      return { text: "text-amber-800", dot: "bg-amber-500" };
  }
}

export type TodaySeverity = "overdue" | "warning" | "reconnect" | "neutral";

/**
 * Presentation-only mapping from the existing TodayWhy kind to the
 * severity accent. No business logic — every kind already produced
 * by the domain view-model (../today.ts).
 */
export function severityForWhyKind(kind: TodayWhy["kind"] | null): TodaySeverity {
  switch (kind) {
    case "followup-overdue":
      return "overdue";
    case "followup-today":
    case "new":
      return "warning";
    case "reconnect":
    case "recent":
      return "reconnect";
    case "followup-upcoming":
    case null:
    default:
      return "neutral";
  }
}

const SEVERITY_ACCENT: Record<TodaySeverity, string> = {
  overdue: "today-accent-overdue",
  warning: "today-accent-warning",
  reconnect: "today-accent-reconnect",
  neutral: "today-accent",
};

/**
 * Presentation-only signal badge for a Today card. Reads the existing
 * TodayWhy kind — no domain logic. The badge reinforces the why line;
 * the why text always carries the meaning.
 */
export function todaySignalBadge(kind: TodayWhy["kind"]): { label: string; tone: SignalTone } {
  switch (kind) {
    case "followup-overdue":
      return { label: "Overdue", tone: "red" };
    case "followup-today":
      return { label: "Due today", tone: "amber" };
    case "followup-upcoming":
      return { label: "Upcoming", tone: "stone" };
    case "recent":
      return { label: "Recent", tone: "emerald" };
    case "reconnect":
      return { label: "Reconnect", tone: "amber" };
    case "new":
      return { label: "New", tone: "emerald" };
  }
}

function secondaryLine(item: TodayItem): string {
  const { record } = item;
  if (record.lastContacted) {
    return `${record.investmentType} · last contact ${formatDisplayDate(record.lastContacted)}`;
  }
  return `${record.investmentType} · never contacted`;
}

interface TodayCardProps {
  item: TodayItem;
  index: number;
  onContacted: (id: string) => void;
  pending?: boolean;
}

/**
 * One person to contact: who, why, one obvious action.
 * Secondary actions live behind the overflow menu — never four equal grids.
 */
export function TodayCard({ item, index, onContacted, pending }: TodayCardProps) {
  const { record, why, primary } = item;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const callUrl = buildCallUrl(record.phone);
  const waUrl = record.phoneValid
    ? buildWhatsAppUrl(radarWhatsAppText(record.name), record.phone)
    : null;
  const detailHref = `/workspace/clients/${record.id}`;

  React.useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const style = why ? whyStyle(why.kind) : null;

  const primaryNode =
    primary === "call" && callUrl ? (
      <a href={callUrl} className={cn(buttonClasses("primary"), "min-h-[48px] w-full")}>
        <PhoneIcon className="mr-2" />
        Call
      </a>
    ) : primary === "whatsapp" && waUrl ? (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonClasses("primary"), "min-h-[48px] w-full")}
      >
        <MessageIcon className="mr-2" />
        WhatsApp
      </a>
    ) : (
      <Link href={detailHref} className={cn(buttonClasses("primary"), "min-h-[48px] w-full")}>
        <MessageIcon className="mr-2" />
        Message
      </Link>
    );

  // The primary action is excluded from the overflow — no duplicates.
  const showCall = callUrl && primary !== "call";
  const showWhatsApp = waUrl && primary !== "whatsapp";

  return (
    <article
      aria-label={`Contact ${record.name}`}
      className={cn(
        "today-enter",
        cardClasses("compact"),
        SEVERITY_ACCENT[severityForWhyKind(why ? why.kind : null)],
      )}
      style={index < 5 ? { animationDelay: `${index * 24}ms` } : undefined}
    >
      <div className="flex items-start gap-3">
        <ClientAvatar name={record.name} className="h-11 w-11" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            {why && style ? (
              <p
                className={cn(
                  "flex min-w-0 items-center gap-1.5 text-xs font-semibold",
                  style.text,
                )}
              >
                <WhyIcon kind={why.kind} />
                <span className="truncate">{why.title}</span>
              </p>
            ) : (
              <span />
            )}
            {why && (
              <SignalBadge tone={todaySignalBadge(why.kind).tone}>
                {todaySignalBadge(why.kind).label}
              </SignalBadge>
            )}
          </div>
          <h3 className="truncate text-base font-semibold text-stone-900">{record.name}</h3>
          <p className="tnum text-xs text-stone-500">{secondaryLine(item)}</p>
        </div>
      </div>
      {why && <p className="mt-1.5 text-sm text-stone-700">{why.detail}</p>}

      {!record.phoneValid && (
        <p className="mt-2 text-xs text-stone-500">
          {record.phone
            ? "Mobile number needs checking — Call and WhatsApp unavailable."
            : "No mobile number — open the client to message."}
        </p>
      )}

      <div className="mt-2.5">{primaryNode}</div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onContacted(record.id)}
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          <CheckIcon />
          {pending ? "Saving…" : "Mark contacted"}
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${record.name}`}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label={`More actions for ${record.name}`}
              className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-stone-200 bg-white py-1 shadow-md"
            >
              {showCall && (
                <a
                  role="menuitem"
                  href={callUrl}
                  className="flex min-h-[44px] items-center gap-2 px-3 text-sm text-stone-800 hover:bg-stone-50"
                >
                  <PhoneIcon /> Call
                </a>
              )}
              {showWhatsApp && (
                <a
                  role="menuitem"
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center gap-2 px-3 text-sm text-stone-800 hover:bg-stone-50"
                >
                  <MessageIcon /> WhatsApp
                </a>
              )}
              <Link
                role="menuitem"
                href={detailHref}
                className="flex min-h-[44px] items-center gap-2 px-3 text-sm text-stone-800 hover:bg-stone-50"
              >
                <ChevronDownIcon className="rotate-[-90deg]" /> View client
              </Link>
            </div>
          )}
        </div>
      </div>

      {item.followups.length > 1 && (
        <p className="mt-1 text-xs text-stone-500">
          +{item.followups.length - 1} more follow-up{item.followups.length - 1 === 1 ? "" : "s"}
        </p>
      )}
    </article>
  );
}
