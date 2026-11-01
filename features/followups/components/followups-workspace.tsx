"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { useResolvedLocale } from "@/lib/locale";
import { reportPerf } from "@/lib/perf/report";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { StoredRadarClient } from "@/features/radar/repository";
import { revalidateWorkspace } from "@/features/radar/actions";
import type {
  CompletedFollowupRecord,
  FollowupRecord,
  StoredFollowup,
} from "../types";
import {
  groupActiveFollowups,
  toCompletedRecord,
  type FollowupClientInfo,
  type FollowupsTab,
} from "../model";
import { FollowupStatusLine } from "./client-followups";
import {
  completeFollowup,
  FollowupStoreError,
  listCompletedFollowups,
  listOpenFollowups,
  reopenFollowup,
} from "../repository";

function workspaceErrorMessage(error: unknown): string {
  if (error instanceof FollowupStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

function completedDisplayDate(completedAt: string, locale: string): string {
  const ymd = completedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? formatDisplayDate(ymd, locale) : "—";
}

interface FollowupsWorkspaceProps {
  initialClients: StoredRadarClient[];
  initialOpen: StoredFollowup[];
  initialCompleted: StoredFollowup[];
  initialTab: FollowupsTab;
  /** Bound applied to the server's completed read (for the "most recent" hint). */
  completedLimit: number;
  loadError: string | null;
  configured: boolean;
  signedIn: boolean;
}

function ActiveRow({
  item,
  busy,
  onComplete,
}: {
  item: FollowupRecord;
  busy: boolean;
  onComplete: (id: string) => void;
}) {
  const locale = useResolvedLocale();
  const todayYMD = React.useMemo(() => todayLocalYMD(), []);
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/workspace/clients/${item.clientId}`}
          className="truncate text-sm font-semibold text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          {item.clientName}
        </Link>
        <p className="text-sm font-medium break-words text-stone-900">{item.reason}</p>
        <FollowupStatusLine dueDate={item.dueDate} todayYMD={todayYMD} />
        <p className="text-xs text-stone-500">{formatDisplayDate(item.dueDate, locale)}</p>
        {item.note.length > 0 && <p className="text-xs break-words text-stone-600">{item.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Link
          href={`/workspace/clients/${item.clientId}`}
          className={cn(buttonClasses("ghost"), "min-h-[44px] px-3")}
        >
          Open
        </Link>
        <Button
          variant="secondary"
          onClick={() => onComplete(item.id)}
          disabled={busy}
          aria-label={`Mark ${item.reason} done`}
          className="min-h-[44px] px-3"
        >
          Done
        </Button>
      </div>
    </li>
  );
}

function CompletedRow({
  item,
  busy,
  onReopen,
}: {
  item: CompletedFollowupRecord;
  busy: boolean;
  onReopen: (id: string) => void;
}) {
  const locale = useResolvedLocale();
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/workspace/clients/${item.clientId}`}
          className="truncate text-sm font-semibold text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          {item.clientName}
        </Link>
        <p className="text-sm font-medium break-words text-stone-900">{item.reason}</p>
        <p className="text-xs text-stone-500">
          Due {formatDisplayDate(item.dueDate, locale)} · Completed{" "}
          {item.completedAt ? completedDisplayDate(item.completedAt, locale) : "—"}
        </p>
        {item.note.length > 0 && <p className="text-xs break-words text-stone-600">{item.note}</p>}
      </div>
      <Button
        variant="ghost"
        onClick={() => onReopen(item.id)}
        disabled={busy}
        aria-label={`Open ${item.reason} again`}
        className="min-h-[44px] shrink-0 px-3"
      >
        Open again
      </Button>
    </li>
  );
}

/**
 * Global Follow-ups workspace (secondary route under /workspace/followups).
 * Active and Completed read the same client_followups rows as Today and
 * Client Detail — one source of truth, no parallel model. Every mutation
 * persists first, revalidates the shared workspace cache, then refreshes.
 */
export function FollowupsWorkspace({
  initialClients,
  initialOpen,
  initialCompleted,
  initialTab,
  completedLimit,
  loadError: initialLoadError,
  configured,
  signedIn,
}: FollowupsWorkspaceProps) {
  const router = useRouter();
  const [clients] = React.useState<StoredRadarClient[]>(initialClients);
  const [openRows, setOpenRows] = React.useState<StoredFollowup[]>(initialOpen);
  const [completedRows, setCompletedRows] = React.useState<StoredFollowup[]>(initialCompleted);
  const [tab, setTab] = React.useState<FollowupsTab>(initialTab);
  const [tabSeed, setTabSeed] = React.useState<FollowupsTab>(initialTab);
  // The tab lives in the URL (?tab=completed), so back/forward navigation
  // re-renders with a new seed — adopt it like a fresh server snapshot.
  if (tabSeed !== initialTab) {
    setTabSeed(initialTab);
    setTab(initialTab);
  }
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ message: string; linkTab: FollowupsTab } | null>(
    null,
  );
  const [loadError, setLoadError] = React.useState<string | null>(initialLoadError);
  const [loading, setLoading] = React.useState(false);
  const todayYMD = React.useMemo(() => todayLocalYMD(), []);

  const clientInfo = React.useMemo(() => {
    const map = new Map<string, FollowupClientInfo>();
    for (const client of clients) {
      map.set(client.id, { name: client.name, phone: client.phone });
    }
    return map;
  }, [clients]);

  function supabaseOrThrow(): SupabaseClient {
    if (!isSupabaseConfigured()) throw new Error("Sign-in isn't set up yet.");
    return createClient();
  }

  async function refresh(supabase: SupabaseClient) {
    const [nextOpen, nextCompleted] = await Promise.all([
      listOpenFollowups(supabase),
      listCompletedFollowups(supabase, completedLimit),
    ]);
    setOpenRows(nextOpen);
    setCompletedRows(nextCompleted);
    return { open: nextOpen.length, completed: nextCompleted.length };
  }

  async function handleRetry() {
    setLoading(true);
    setLoadError(null);
    try {
      await refresh(supabaseOrThrow());
    } catch (error) {
      setLoadError(workspaceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(id: string) {
    setActionError(null);
    setStatus(null);
    setBusy(true);
    const mutationStarted = Date.now();
    try {
      const supabase = supabaseOrThrow();
      await completeFollowup(supabase, id);
      const writeMs = Date.now() - mutationStarted;
      const counts = await refresh(supabase);
      reportPerf({
        op: "followup.mutation",
        kind: "complete",
        ok: true,
        writeMs,
        requeryMs: Date.now() - mutationStarted - writeMs,
        rows: counts.open + counts.completed,
      });
      // Invalidate the shared workspace cache BEFORE refreshing, so Today,
      // Clients, and Client Detail cannot serve the pre-mutation payload.
      await revalidateWorkspace().catch(() => undefined);
      router.refresh();
      setStatus({ message: "Follow-up marked done.", linkTab: "completed" });
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen(id: string) {
    setActionError(null);
    setStatus(null);
    setBusy(true);
    const mutationStarted = Date.now();
    try {
      const supabase = supabaseOrThrow();
      await reopenFollowup(supabase, id);
      const writeMs = Date.now() - mutationStarted;
      const counts = await refresh(supabase);
      reportPerf({
        op: "followup.mutation",
        kind: "reopen",
        ok: true,
        writeMs,
        requeryMs: Date.now() - mutationStarted - writeMs,
        rows: counts.open + counts.completed,
      });
      await revalidateWorkspace().catch(() => undefined);
      router.refresh();
      setStatus({ message: "Follow-up reopened.", linkTab: "active" });
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!configured || !signedIn) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-stone-900">Your follow-ups aren&apos;t available.</p>
          <p className="text-sm leading-relaxed text-stone-600">
            {!configured
              ? "Sign-in isn't set up yet. Your follow-ups will appear here once it is."
              : "Please sign in to see your follow-ups."}
          </p>
          {!signedIn && configured && (
            <Link
              href="/login?next=%2Fworkspace%2Ffollowups"
              className={cn(buttonClasses("primary"), "mt-2 sm:self-start")}
            >
              Sign in
            </Link>
          )}
        </div>
      </Card>
    );
  }

  const groups = groupActiveFollowups(openRows, clientInfo, todayYMD);
  const completed: CompletedFollowupRecord[] = [];
  for (const stored of completedRows) {
    const client = clientInfo.get(stored.clientId);
    if (!client) continue;
    const record = toCompletedRecord(stored, client);
    if (record) completed.push(record);
  }
  const activeCount = groups.overdue.length + groups.today.length + groups.upcoming.length;
  const showingRecentHint = completedRows.length >= completedLimit;

  const tabLink = (id: FollowupsTab, label: string, count: number | undefined) =>
    id === tab ? (
      <span
        aria-current="page"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-900 px-4 text-sm font-semibold text-white"
      >
        {label}
        {count !== undefined && <span className="tnum text-xs font-medium opacity-80">{count}</span>}
      </span>
    ) : (
      <Link
        href={id === "active" ? "/workspace/followups" : "/workspace/followups?tab=completed"}
        onClick={() => setTab(id)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
      >
        {label}
        {count !== undefined && (
          <span className="tnum text-xs font-medium text-stone-500">{count}</span>
        )}
      </Link>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Follow-ups</h1>
        <p className="text-sm leading-relaxed text-stone-600">
          What you need to handle, and what you already handled.
        </p>
      </div>

      <nav aria-label="Follow-ups" className="flex flex-wrap gap-2">
        {tabLink("active", "Active", activeCount)}
        {tabLink("completed", "Completed", completed.length > 0 ? completed.length : undefined)}
      </nav>

      {actionError && (
        <Alert variant="error" title="Couldn't save that change">
          <p className="mt-1 text-xs">{actionError}</p>
        </Alert>
      )}

      {status && (
        <div
          role="status"
          className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
        >
          <p className="text-sm text-emerald-900">{status.message}</p>
          <Link
            href={
              status.linkTab === "completed"
                ? "/workspace/followups?tab=completed"
                : "/workspace/followups"
            }
            onClick={() => setTab(status.linkTab)}
            className="inline-flex min-h-[44px] items-center font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
          >
            {status.linkTab === "completed" ? "View in Completed" : "View in Active"}
          </Link>
        </div>
      )}

      {loading && (
        <p className="text-sm text-stone-500" role="status">
          Loading follow-ups…
        </p>
      )}

      {!loading && loadError && (
        <Card>
          <Alert variant="error" title="Couldn't load follow-ups">
            <p className="mt-1 text-xs">{loadError}</p>
          </Alert>
          <div className="mt-2">
            <Button variant="secondary" onClick={handleRetry} className="min-h-[44px]">
              Retry
            </Button>
          </div>
        </Card>
      )}

      {!loading && !loadError && tab === "active" && (
        <div className="flex flex-col gap-4">
          {activeCount === 0 ? (
            <Card>
              <p className="text-sm text-stone-500">You&apos;re all caught up.</p>
              <Link
                href="/workspace/clients"
                className="mt-2 inline-flex min-h-[44px] items-center font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Open your clients
              </Link>
            </Card>
          ) : (
            (
              [
                { id: "overdue", label: "Overdue", items: groups.overdue },
                { id: "today", label: "Due today", items: groups.today },
                { id: "upcoming", label: "Upcoming", items: groups.upcoming },
              ] as const
            ).map(
              (group) =>
                group.items.length > 0 && (
                  <section key={group.id} aria-labelledby={`followups-${group.id}-heading`}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <h2
                        id={`followups-${group.id}-heading`}
                        className="eyebrow flex items-center gap-1.5"
                      >
                        {group.label}
                      </h2>
                      <span className="tnum rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                        {group.items.length}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {group.items.map((item) => (
                        <ActiveRow
                          key={item.id}
                          item={item}
                          busy={busy}
                          onComplete={(rowId) => void handleComplete(rowId)}
                        />
                      ))}
                    </ul>
                  </section>
                ),
            )
          )}
        </div>
      )}

      {!loading && !loadError && tab === "completed" && (
        <div className="flex flex-col gap-2">
          {completed.length === 0 ? (
            <Card>
              <p className="text-sm text-stone-500">
                Nothing completed yet. Completed follow-ups will appear here.
              </p>
            </Card>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {completed.map((item) => (
                  <CompletedRow
                    key={item.id}
                    item={item}
                    busy={busy}
                    onReopen={(rowId) => void handleReopen(rowId)}
                  />
                ))}
              </ul>
              {showingRecentHint && (
                <p className="text-xs text-stone-500">
                  Showing the {completedLimit} most recent completions.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
