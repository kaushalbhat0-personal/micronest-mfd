"use client";

import * as React from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/controls";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  NewClientIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { SignalBadge } from "@/components/ui/signal-badge";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { todayLocalYMD } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { StoredFollowup } from "@/features/followups/types";
import {
  createClient as createStoredClient,
  RadarStoreError,
  toClientRecord,
  type ClientInput,
  type StoredRadarClient,
} from "../repository";
import type { ClientRecord } from "../types";
import { BOOK_FILTERS, countToday, filterBookItems, type BookFilter } from "../book";
import { buildTodayItems, upcomingFollowups } from "../today";
import { ClientForm } from "./client-form";
import { ClientBookCard } from "./client-book-card";
import { ImportDialog, ImportTriggerIcon } from "../import/import-dialog";
import { downloadTextFile, buildTemplateCsv, TEMPLATE_FILENAME } from "../import/template-csv";
import { identityOf, manualDuplicateCopy, matchExisting } from "../import/duplicates";

function storeErrorMessage(error: unknown): string {
  if (error instanceof RadarStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

interface ClientsWorkspaceProps {
  initialClients: StoredRadarClient[];
  /** Open follow-ups, joined to clients in the view-model. No editing here. */
  initialFollowups: StoredFollowup[];
  loadError: string | null;
  configured: boolean;
  signedIn: boolean;
}

/**
 * Client Book: attention summary → search → browse → act. Reads the
 * server-loaded client list plus open follow-ups once; ranking, counts,
 * and display copy come from the shared domain view-model (book.ts over
 * today.ts), so the book and the Today queue can never disagree.
 */
export function ClientsWorkspace({
  initialClients,
  initialFollowups,
  loadError,
  configured,
  signedIn,
}: ClientsWorkspaceProps) {
  const [todayYMD] = React.useState(() => todayLocalYMD());
  const [records, setRecords] = React.useState<ClientRecord[]>(() =>
    initialClients.map((stored, i) => toClientRecord(stored, i, todayLocalYMD())),
  );
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<BookFilter>("all");
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [duplicate, setDuplicate] = React.useState<{
    existingId: string;
    existingName: string;
    kind: "mobile" | "name";
  } | null>(null);
  const [formKey, setFormKey] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const wasAdding = React.useRef(false);

  // Domain view-model: per-client follow-ups + why + priority, same
  // source as the Today queue. Newly added/imported rows re-project
  // through the same engine; follow-up edits live in Client Detail.
  const items = React.useMemo(
    () => buildTodayItems(records, initialFollowups, todayYMD),
    [records, initialFollowups, todayYMD],
  );
  const counts = React.useMemo(() => countToday(items), [items]);
  const upcoming = React.useMemo(() => upcomingFollowups(items), [items]);

  const visible = React.useMemo(
    () => filterBookItems(items, filter, query),
    [items, filter, query],
  );

  function countFor(id: BookFilter): number {
    switch (id) {
      case "attention":
        return counts.attention;
      case "followups":
        return counts.followups;
      case "new":
        return counts.fresh;
      case "all":
      default:
        return items.length;
    }
  }

  function openAdd() {
    setSaveError(null);
    setDuplicate(null);
    setAdding(true);
  }

  // Dialog focus management: move focus into the panel on open, return it
  // to the trigger on close. Escape and backdrop clicks also close.
  React.useEffect(() => {
    if (adding) {
      wasAdding.current = true;
      panelRef.current?.focus();
      function onKey(event: KeyboardEvent) {
        if (event.key === "Escape") setAdding(false);
      }
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    if (wasAdding.current) {
      wasAdding.current = false;
      document.getElementById("add-client-button")?.focus();
    }
    return undefined;
  }, [adding]);

  async function handleAdd(input: ClientInput) {
    if (!isSupabaseConfigured()) return;
    // Manual-Add duplicate guard: same shared engine as import (mobile
    // first, exact name only when mobile is unavailable). Scoped to this
    // user's RLS-loaded records — never a cross-user lookup. A match
    // blocks creation; the existing record is never overwritten or deleted.
    const candidate = identityOf(input.name, input.phone);
    const owned = records.map((r) => identityOf(r.name, r.phone));
    const hit = matchExisting(candidate, owned);
    if (hit) {
      const matched = records[hit.index];
      setDuplicate({
        existingId: matched.id,
        existingName: matched.name,
        kind: hit.kind,
      });
      setSaveError(null);
      return;
    }
    setDuplicate(null);
    setSaving(true);
    setSaveError(null);
    try {
      const supabase: SupabaseClient = createClient();
      const stored = await createStoredClient(supabase, input);
      setRecords((prev) => {
        const next = [
          ...prev.map((r) => ({ ...r })),
          toClientRecord(stored, prev.length, todayYMD),
        ];
        return next;
      });
      setAdding(false);
      setFormKey((k) => k + 1);
    } catch (error) {
      setSaveError(storeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!configured || !signedIn) {
    return (
      <>
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-stone-900">Client sync isn&apos;t available.</p>
            <p className="text-sm leading-relaxed text-stone-600">
              {!configured
                ? "Sign-in isn't set up yet. Your client list will live here once authentication is configured."
                : "Please sign in to see your client relationship list."}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              {!signedIn && configured && (
                <Link
                  href="/login?next=%2Fworkspace%2Fclients"
                  className={cn(buttonClasses("primary"), "sm:self-start")}
                >
                  Sign in
                </Link>
              )}
              <Button
                id="import-clients-button"
                variant="secondary"
                onClick={() => setImporting(true)}
                className="sm:self-start"
              >
                <ImportTriggerIcon />
                Try import preview
              </Button>
            </div>
          </div>
        </Card>
        {importing && (
          <ImportDialog
            open={importing}
            onClose={() => setImporting(false)}
            configured={false}
            existing={[]}
            onImported={() => {}}
          />
        )}
      </>
    );
  }

  if (loadError) {
    return (
      <Card>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-stone-900">We couldn&apos;t load your clients.</p>
          <p className="text-xs text-stone-600">{loadError}</p>
          <Button
            variant="primary"
            onClick={() => window.location.reload()}
            className="sm:self-start"
          >
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:gap-6">
      {records.length > 0 && (
        <section aria-label="Attention summary">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:gap-4">
            <StatCard
              icon={<AlertIcon aria-hidden="true" />}
              label="Attention"
              value={counts.attention}
              pressed={filter === "attention"}
              iconTone="bg-red-50 text-red-800"
              valueTone="text-red-800"
              onSelect={() => setFilter("attention")}
            />
            <StatCard
              icon={<NewClientIcon aria-hidden="true" />}
              label="New"
              value={counts.fresh}
              pressed={filter === "new"}
              iconTone="bg-emerald-50 text-emerald-900"
              valueTone="text-emerald-900"
              onSelect={() => setFilter("new")}
            />
            <StatCard
              icon={<ClockIcon aria-hidden="true" />}
              label="Follow-ups"
              value={counts.followups}
              pressed={filter === "followups"}
              iconTone="bg-amber-100 text-amber-800"
              valueTone="text-amber-800"
              onSelect={() => setFilter("followups")}
            />
            <StatCard
              icon={<CalendarIcon aria-hidden="true" />}
              label="Upcoming"
              value={upcoming.length}
              iconTone="bg-stone-200 text-stone-700"
              valueTone="text-stone-900"
              onSelect={() => setFilter("followups")}
            />
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-6">
        <div className="sm:flex-1">
          <Field id="client-search" label="Search clients">
            <span className="relative block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
              <TextInput
                id="client-search"
                type="search"
                placeholder="Search by client name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                className="pl-10 lg:max-w-md"
              />
            </span>
          </Field>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            id="add-client-button"
            variant="primary"
            onClick={openAdd}
            className="w-full sm:w-auto lg:min-w-40"
          >
            <PlusIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Add client
          </Button>
          <Button
            id="import-clients-button"
            variant="secondary"
            onClick={() => setImporting(true)}
            className="w-full sm:w-auto lg:min-w-40"
          >
            <ImportTriggerIcon />
            Import
          </Button>
        </div>
      </div>

      {importing && (
        <ImportDialog
          open={importing}
          onClose={() => setImporting(false)}
          configured={configured}
          existing={records.map((r) => identityOf(r.name, r.phone))}
          onImported={(stored) => {
            setRecords((prev) => {
              const next = [...prev.map((r) => ({ ...r }))];
              for (const s of stored) {
                next.push(toClientRecord(s, next.length, todayYMD));
              }
              return next;
            });
          }}
        />
      )}

      {records.length > 0 && (
        <div
          role="group"
          aria-label="Filter client book"
          className="scroll-x -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {BOOK_FILTERS.map((f) => (
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
      )}

      {adding && (
        <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close add client dialog"
            onClick={() => {
              setDuplicate(null);
              setAdding(false);
            }}
            className="absolute inset-0 cursor-default bg-stone-900/40"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-client-heading"
            tabIndex={-1}
            className="today-enter relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-stone-200 bg-white p-5 shadow-xl focus-visible:outline-none sm:max-w-md sm:rounded-3xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 id="add-client-heading" className="text-lg font-semibold text-stone-900">
                  Add client
                </h2>
                <p className="text-sm text-stone-600">
                  They join your relationship book immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDuplicate(null);
                  setAdding(false);
                }}
                aria-label="Close add client dialog"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                ×
              </button>
            </div>
            <ClientForm
              key={formKey}
              submitLabel="Add client"
              saving={saving}
              externalError={saveError}
              onSubmit={handleAdd}
              onCancel={() => {
                setDuplicate(null);
                setAdding(false);
              }}
            />
            {duplicate &&
              (() => {
                const copy = manualDuplicateCopy(duplicate.kind, duplicate.existingName);
                return (
                  <div className="mt-3">
                    <Alert variant="warning" title={copy.title}>
                      <p className="mt-1 text-xs">
                        {copy.body} {copy.matchedBy}
                      </p>
                      <p className="mt-1 text-xs">
                        No second record was created and nothing was overwritten.
                      </p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <Link
                          href={`/workspace/clients/${duplicate.existingId}`}
                          className={cn(buttonClasses("secondary"), "sm:self-start")}
                        >
                          View existing client
                        </Link>
                        <Button variant="ghost" onClick={() => setDuplicate(null)}>
                          Go back and edit
                        </Button>
                      </div>
                    </Alert>
                  </div>
                );
              })()}
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Bring your client book with you"
          hint="Download the template and fill in your clients, import an existing CSV or XLSX list, or add your first client manually."
          action={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
              <Button variant="primary" onClick={openAdd}>
                <PlusIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
                Add your first client
              </Button>
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <ImportTriggerIcon />
                Import client list
              </Button>
              <Button
                variant="ghost"
                onClick={() => downloadTextFile(TEMPLATE_FILENAME, buildTemplateCsv(), "text/csv")}
              >
                <DownloadIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
                Download template
              </Button>
            </div>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={filter === "all" ? <SearchIcon /> : <CheckIcon />}
          title={
            filter === "all"
              ? "No clients found."
              : filter === "attention"
                ? "Nothing needs attention."
                : filter === "followups"
                  ? "No open follow-ups."
                  : "No new clients."
          }
          hint={
            filter === "all"
              ? "Try searching a different name."
              : filter === "attention"
                ? "Every client in your book is looked after."
                : filter === "followups"
                  ? "Follow-ups you add in Client Detail will appear here."
                  : "Clients you mark as new will appear here."
          }
        />
      ) : (
        <section
          aria-labelledby="client-book-list-heading"
          className="flex flex-col gap-2.5 lg:gap-4"
        >
          <h2
            id="client-book-list-heading"
            className="flex items-center gap-2 text-base font-semibold text-stone-900 lg:text-lg"
          >
            Clients
            <SignalBadge tone={visible.length > 0 ? "emerald" : "stone"}>
              {visible.length}
            </SignalBadge>
          </h2>
          <div
            className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3"
            aria-live="polite"
            aria-label="Client list"
          >
            {visible.map((item) => (
              <ClientBookCard key={item.record.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {records.length > 0 && (
        <p className="text-xs text-stone-600">
          {visible.length} of {records.length} client{records.length === 1 ? "" : "s"} shown.
        </p>
      )}
    </div>
  );
}
