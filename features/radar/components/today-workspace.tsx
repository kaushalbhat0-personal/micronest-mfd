"use client";

import * as React from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Toast, type ToastData } from "@/components/ui/toast";
import { AttentionStripSkeleton, ClientCardSkeleton } from "@/components/ui/skeleton";
import { SignalBadge } from "@/components/ui/signal-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  SunIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { todayLocalYMD } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { StoredFollowup } from "@/features/followups/types";
import { markContacted } from "../model";
import {
  RadarStoreError,
  toClientRecord,
  updateLastContacted,
  type StoredRadarClient,
} from "../repository";
import {
  buildTodayItems,
  contactedToday,
  countToday,
  displayDay,
  filterTodayItems,
  greetingFor,
  upcomingFollowups,
  type TodayFilter,
} from "../today";
import { TodayCard } from "./today-card";

const FILTERS: Array<{ id: TodayFilter; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "followups", label: "Follow-ups" },
  { id: "reconnect", label: "Reconnect" },
  { id: "new", label: "New" },
  { id: "all", label: "All" },
];

function storeErrorMessage(error: unknown): string {
  if (error instanceof RadarStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

interface TodayWorkspaceProps {
  initialClients: StoredRadarClient[];
  initialFollowups: StoredFollowup[];
  initialFilter: TodayFilter;
  configured: boolean;
  signedIn: boolean;
}

/**
 * Today: the daily relationship queue (RCCF-MFD-29 Phase B).
 * Server loads the owned list + open follow-ups once; ranking, filtering,
 * and display copy are pure view-model (../today.ts). Mark Contacted
 * persists first through the repository, then updates local state.
 */
export function TodayWorkspace({
  initialClients,
  initialFollowups,
  initialFilter,
  configured,
  signedIn,
}: TodayWorkspaceProps) {
  const [todayYMD, setTodayYMD] = React.useState(() => todayLocalYMD());
  const [records, setRecords] = React.useState(() =>
    initialClients.map((stored, i) => toClientRecord(stored, i, todayLocalYMD())),
  );
  const [followups] = React.useState<StoredFollowup[]>(initialFollowups);
  const [filter, setFilter] = React.useState<TodayFilter>(initialFilter);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [toast, setToast] = React.useState<ToastData | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((data: Omit<ToastData, "id">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...data, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, []);

  React.useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const items = React.useMemo(
    () => buildTodayItems(records, followups, todayYMD),
    [records, followups, todayYMD],
  );
  const counts = React.useMemo(() => countToday(items), [items]);
  const visible = React.useMemo(() => filterTodayItems(items, filter), [items, filter]);
  const upcoming = React.useMemo(() => upcomingFollowups(items, 3), [items]);
  const completed = React.useMemo(() => contactedToday(records, todayYMD), [records, todayYMD]);
  const greeting = React.useMemo(() => greetingFor(), []);
  const dayLabel = React.useMemo(() => displayDay(todayYMD), [todayYMD]);

  function countFor(id: TodayFilter): number | undefined {
    switch (id) {
      case "attention":
        return counts.attention;
      case "followups":
        return counts.followups;
      case "reconnect":
        return counts.reconnect;
      case "new":
        return counts.fresh;
      case "all":
        return undefined;
    }
  }

  async function handleContacted(id: string) {
    const today = todayLocalYMD();
    setTodayYMD(today);
    const target = records.find((r) => r.id === id);
    if (!target) return;
    if (!isSupabaseConfigured()) return;
    const prevLastContacted = target.lastContacted;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const supabase: SupabaseClient = createClient();
      await updateLastContacted(supabase, id, today);
      setRecords((prev) => prev.map((r) => (r.id === id ? markContacted(r, today) : r)));
      showToast({
        tone: "success",
        message: `Marked ${target.name} as contacted.`,
        actionLabel: "Undo",
        onAction: () => void undoContacted(id, prevLastContacted),
      });
    } catch (error) {
      showToast({ tone: "error", message: storeErrorMessage(error) });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function undoContacted(id: string, prevLastContacted: string | null) {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase: SupabaseClient = createClient();
      const updated = await updateLastContacted(supabase, id, prevLastContacted);
      const today = todayLocalYMD();
      setTodayYMD(today);
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id ? toClientRecord(updated, Math.max(0, r.rowNumber - 1), today) : r,
        ),
      );
    } catch (error) {
      showToast({ tone: "error", message: storeErrorMessage(error) });
    }
  }

  if (!configured || !signedIn) {
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-1" aria-labelledby="today-heading">
          <h1
            id="today-heading"
            className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl"
          >
            Today
          </h1>
          <p className="text-sm leading-relaxed text-stone-600">Who should you talk to today?</p>
        </section>
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-stone-900">Your today list lives here.</p>
            <p className="text-sm leading-relaxed text-stone-600">
              {!configured
                ? "Sign-in isn't set up yet. Your daily queue will appear here once authentication is configured."
                : "Please sign in to see who needs your attention today."}
            </p>
            {!signedIn && configured && (
              <Link
                href="/login?next=%2Fworkspace%2Ftoday"
                className={cn(buttonClasses("primary"), "mt-2 sm:self-start")}
              >
                Sign in
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-1" aria-labelledby="today-heading">
          <p className="eyebrow">{dayLabel}</p>
          <h1 id="today-heading" className="text-2xl font-semibold tracking-tight text-stone-900">
            {greeting}
          </h1>
          <p className="text-sm leading-relaxed text-stone-600">
            Your relationship radar is clear — there are no clients to review yet.
          </p>
        </section>
        <Card>
          <div className="flex flex-col items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
            >
              <CheckIcon />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-stone-900">
                Add your first client to start today&apos;s list
              </p>
              <p className="text-sm leading-relaxed text-stone-600">
                Add clients on the Clients page and they will appear here with the reason to contact
                them.
              </p>
            </div>
            <Link href="/workspace/clients" className={cn(buttonClasses("primary"), "mt-1")}>
              Go to Clients
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1.5" aria-labelledby="today-heading">
        <p className="eyebrow flex items-center gap-1.5">
          <SunIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {dayLabel}
        </p>
        <h1
          id="today-heading"
          className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl"
        >
          {greeting}
        </h1>
        <p className="tnum text-base leading-relaxed text-stone-600">
          {counts.attention === 0 ? (
            "Nothing needs your attention right now."
          ) : (
            <>
              <strong className="font-semibold text-stone-900">{counts.attention}</strong>{" "}
              {counts.attention === 1 ? "person needs you today." : "people need you today."}
            </>
          )}
        </p>
      </section>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      <section aria-label="Attention summary">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <AttentionStat
            icon={<AlertIcon />}
            label="Overdue"
            value={counts.overdue}
            iconTone="bg-red-50 text-red-800"
            valueTone="text-red-800"
            onSelect={() => setFilter("followups")}
          />
          <AttentionStat
            icon={<ClockIcon />}
            label="Due today"
            value={counts.dueToday}
            iconTone="bg-amber-100 text-amber-800"
            valueTone="text-amber-800"
            onSelect={() => setFilter("followups")}
          />
          <AttentionStat
            icon={<CalendarIcon />}
            label="Reconnect"
            value={counts.reconnect}
            pressed={filter === "reconnect"}
            iconTone="bg-emerald-50 text-emerald-900"
            valueTone="text-emerald-900"
            onSelect={() => setFilter("reconnect")}
          />
        </div>
      </section>

      <div
        role="group"
        aria-label="Filter today"
        className="scroll-x -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            selected={filter === f.id}
            count={countFor(f.id)}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-labelledby="queue-heading"
          aria-live="polite"
          className="flex min-w-0 flex-col gap-2.5"
        >
          <h2
            id="queue-heading"
            className="flex items-center gap-2 text-sm font-semibold text-stone-900"
          >
            People to contact
            <SignalBadge tone={visible.length > 0 ? "amber" : "stone"}>
              {visible.length}
            </SignalBadge>
          </h2>
          {visible.length === 0 ? (
            <EmptyState
              icon={<CheckIcon />}
              title="You're all caught up."
              hint={
                filter === "attention"
                  ? "No clients need attention right now."
                  : "Nothing in this view right now."
              }
            />
          ) : (
            visible.map((item, index) => (
              <TodayCard
                key={item.record.id}
                item={item}
                index={index}
                onContacted={handleContacted}
                pending={pendingIds.has(item.record.id)}
              />
            ))
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming-heading">
              <Card>
                <div className="flex flex-col gap-2">
                  <h2 id="upcoming-heading" className="eyebrow flex items-center gap-1.5">
                    <ClockIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    Coming up
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {upcoming.map((u) => (
                      <li key={`${u.clientId}-${u.dueDate}-${u.reason}`}>
                        <Link
                          href={`/workspace/clients/${u.clientId}`}
                          className="group flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-stone-900 group-hover:underline">
                              {u.clientName}
                            </span>
                            <span className="truncate text-xs text-stone-500">{u.reason}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="tnum text-xs font-medium text-stone-600">
                              {u.label}
                            </span>
                            <ArrowRightIcon
                              aria-hidden="true"
                              className="h-4 w-4 text-stone-400 transition-transform group-hover:translate-x-0.5"
                            />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setFilter("followups")}
                    className="inline-flex min-h-[44px] items-center self-start rounded-lg px-1 text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                  >
                    View all follow-ups
                  </button>
                </div>
              </Card>
            </section>
          )}

          {completed.length > 0 && (
            <section aria-labelledby="completed-heading">
              <details className="rounded-xl border border-stone-200 bg-white shadow-sm">
                <summary
                  id="completed-heading"
                  className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 [&::-webkit-details-marker]:hidden"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    Completed today
                    <span className="tnum font-normal text-stone-500">{completed.length}</span>
                  </span>
                  <span aria-hidden="true" className="text-xs text-stone-500">
                    ▾
                  </span>
                </summary>
                <ul className="flex flex-col gap-1 border-t border-stone-200 px-4 py-2">
                  {completed.map((record) => (
                    <li
                      key={record.id}
                      className="flex min-h-[44px] items-center gap-2 text-sm text-stone-600"
                    >
                      <CheckIcon />
                      <span className="truncate">{record.name}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function AttentionStat({
  icon,
  label,
  value,
  pressed,
  iconTone,
  valueTone,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  /**
   * Toggle state, when the stat mirrors a filter 1:1. Overdue and Due
   * today both shortcut to the shared `followups` filter, so they carry
   * no pressed state — otherwise two controls would announce the same
   * selection. The selected filter is owned by the chip rail below.
   */
  pressed?: boolean;
  iconTone: string;
  valueTone: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={pressed}
      className={cn(
        "flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-xl border border-stone-200 bg-white px-2 py-3 shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
        pressed
          ? "border-emerald-900 ring-1 ring-inset ring-emerald-900"
          : "transition-shadow hover:shadow-md",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("flex h-8 w-8 items-center justify-center rounded-full", iconTone)}
      >
        {icon}
      </span>
      <span className={cn("tnum text-2xl font-semibold tracking-tight", valueTone)}>{value}</span>
      <span className="text-xs text-stone-500">{label}</span>
    </button>
  );
}

/** Loading fallback while the server resolves clients + follow-ups. */
export function TodayLoadingFallback() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <AttentionStripSkeleton />
      <ClientCardSkeleton />
    </div>
  );
}
