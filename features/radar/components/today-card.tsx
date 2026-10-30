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
  ClockIcon,
  DotsIcon,
  FileTextIcon,
  MessageIcon,
  PhoneIcon,
  WhyIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/dates";
import { buildCallUrl, buildWhatsAppUrl } from "@/lib/whatsapp";
import { radarWhatsAppText } from "../view";
import { formatAmountContext } from "../template";
import { wasContactedToday, type TodayItem, type TodayWhy } from "../today";

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

interface TodayCardProps {
  item: TodayItem;
  index: number;
  /** Device-local day the queue was built for. */
  todayYMD: string;
  onContacted: (id: string) => void;
  onUndo: (id: string) => void;
  /** True when the pre-contact value is still known (same session). */
  canUndo: boolean;
  pending?: boolean;
}

/**
 * One person to contact: who, why, one obvious action.
 * Secondary actions live behind the overflow menu — never four equal grids.
 * After contact, the card states the fact ("Contacted today") instead of
 * offering the action again; Undo stays available while the prior value
 * is known.
 */
export function TodayCard({
  item,
  index,
  todayYMD,
  onContacted,
  onUndo,
  canUndo,
  pending,
}: TodayCardProps) {
  const { record, why, primary } = item;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const contacted = wasContactedToday(record, todayYMD);

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

  const markContactedNode = contacted ? (
    <span className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-emerald-900">
      <CheckIcon />
      Spoke today
      {canUndo && (
        <button
          type="button"
          onClick={() => onUndo(record.id)}
          aria-label={`Mark ${record.name} as not spoken to`}
          className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          Undo
        </button>
      )}
    </span>
  ) : (
    <button
      type="button"
      onClick={() => onContacted(record.id)}
      disabled={pending}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
    >
      <CheckIcon />
      {pending ? "Saving…" : "I spoke to them"}
    </button>
  );

  const overflowNode = (
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
  );

  // Desktop exposes secondary actions inline; mobile keeps one obvious
  // action plus the overflow menu. Same links, responsive arrangement.
  const desktopActionsNode = (
    <div className="flex items-center gap-1.5">
      {showCall && (
        <a
          href={callUrl}
          aria-label={`Call ${record.name}`}
          title="Call"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-stone-200 bg-white text-emerald-900 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          <PhoneIcon />
        </a>
      )}
      {showWhatsApp && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${record.name}`}
          title="WhatsApp"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-stone-200 bg-white text-emerald-900 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          <MessageIcon />
        </a>
      )}
      <Link
        href={detailHref}
        aria-label={`View ${record.name}`}
        title="View client"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
      >
        <ChevronDownIcon className="rotate-[-90deg]" />
      </Link>
    </div>
  );

  return (
    <article
      aria-label={`Contact ${record.name}`}
      className={cn(
        "today-enter",
        cardClasses("compact"),
        SEVERITY_ACCENT[severityForWhyKind(why ? why.kind : null)],
        "lg:p-5",
      )}
      style={index < 5 ? { animationDelay: `${index * 24}ms` } : undefined}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ClientAvatar name={record.name} className="h-11 w-11 lg:h-12 lg:w-12" />
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
            <h3 className="truncate text-base font-semibold text-stone-900 lg:text-lg">
              {record.name}
            </h3>
            <p className="tnum flex items-center gap-1.5 text-xs text-stone-600 lg:text-sm">
              <FileTextIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{investmentLine(item)}</span>
            </p>
            <p className="tnum flex items-center gap-1.5 text-xs text-stone-600 lg:text-sm">
              <ClockIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contactLine(item)}</span>
            </p>
            {why && <p className="mt-1 text-sm leading-relaxed text-stone-700">{why.detail}</p>}

            {!record.phoneValid && (
              <p className="mt-1.5 text-xs text-stone-500">
                {record.phone
                  ? "Mobile number needs checking — Call and WhatsApp unavailable."
                  : "No mobile number — open the client to message."}
              </p>
            )}
          </div>
        </div>
        {/* Mobile / tablet: one obvious action + mark contacted + overflow. */}
        <div className="flex min-w-0 flex-col gap-2 lg:hidden lg:w-56 lg:shrink-0">
          <div className="w-full">{primaryNode}</div>
          <div className="flex items-center justify-between gap-2">
            {markContactedNode}
            {overflowNode}
          </div>
        </div>
        {/* Desktop: primary action + inline secondary actions + mark contacted. */}
        <div className="hidden min-w-0 flex-col gap-2 lg:flex lg:w-60 lg:shrink-0">
          <div className="w-full">{primaryNode}</div>
          {desktopActionsNode}
          <span className="inline-flex min-h-[44px] items-center self-start">
            {markContactedNode}
          </span>
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
