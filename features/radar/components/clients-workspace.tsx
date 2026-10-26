"use client";

import * as React from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/controls";
import {
  ArrowRightIcon,
  ClockIcon,
  FileTextIcon,
  NewClientIcon,
  PhoneIcon,
  PlusIcon,
  RecentIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { SignalBadge, type SignalTone } from "@/components/ui/signal-badge";
import { cn } from "@/lib/utils";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createClient as createStoredClient,
  RadarStoreError,
  toClientRecord,
  type ClientInput,
  type StoredRadarClient,
} from "../repository";
import type { ClientRecord } from "../types";
import { filterClientsByName } from "../view";
import { ClientForm } from "./client-form";

function storeErrorMessage(error: unknown): string {
  if (error instanceof RadarStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

function investmentLine(record: ClientRecord): string {
  if (record.lastInvested) {
    return `${record.investmentType} · Invested ${formatDisplayDate(record.lastInvested)}`;
  }
  return `${record.investmentType} · Never invested`;
}

function contactLine(record: ClientRecord): string {
  if (record.lastContacted) {
    return `Last contacted ${formatDisplayDate(record.lastContacted)}`;
  }
  return "Never contacted";
}

export interface ClientSignalPill {
  label: string;
  tone: SignalTone;
  icon: React.ReactNode;
}

/**
 * Presentation-only signal pill for a client row. Reads the existing
 * domain signals (computeSignals is the source of truth — new-client
 * mirrors isNewClient there) and shows at most one pill, following the
 * domain priority order in radarPriorityClass: recent, then new, then
 * reconnect. Text label carries the meaning; tint only reinforces it.
 */
export function signalPillForRecord(
  record: Pick<ClientRecord, "signals">,
): ClientSignalPill | null {
  if (record.signals.includes("recent-investor")) {
    return { label: "Recent", tone: "emerald", icon: <RecentIcon /> };
  }
  if (record.signals.includes("new-client")) {
    return { label: "New", tone: "emerald", icon: <NewClientIcon /> };
  }
  if (record.signals.includes("reconnect-due")) {
    return { label: "Reconnect", tone: "amber", icon: <PhoneIcon /> };
  }
  return null;
}

interface ClientsWorkspaceProps {
  initialClients: StoredRadarClient[];
  loadError: string | null;
  configured: boolean;
  signedIn: boolean;
}

/**
 * Clients list: search → browse → add. Reads the server-loaded list once;
 * search is local and non-destructive. Add persists via the repository and
 * the new row is projected through the same domain engine as everything else.
 */
export function ClientsWorkspace({
  initialClients,
  loadError,
  configured,
  signedIn,
}: ClientsWorkspaceProps) {
  const [todayYMD] = React.useState(() => todayLocalYMD());
  const [records, setRecords] = React.useState<ClientRecord[]>(() =>
    initialClients.map((stored, i) => toClientRecord(stored, i, todayLocalYMD())),
  );
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [formKey, setFormKey] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const wasAdding = React.useRef(false);

  const visible = React.useMemo(() => filterClientsByName(records, query), [records, query]);

  function openAdd() {
    setSaveError(null);
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
      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-stone-900">Client sync isn&apos;t available.</p>
          <p className="text-sm leading-relaxed text-stone-600">
            {!configured
              ? "Sign-in isn't set up yet. Your client list will live here once authentication is configured."
              : "Please sign in to see your client relationship list."}
          </p>
          {!signedIn && configured && (
            <Link
              href="/login?next=%2Fworkspace%2Fclients"
              className={cn(buttonClasses("primary"), "mt-2 sm:self-start")}
            >
              Sign in
            </Link>
          )}
        </div>
      </Card>
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
        <Button
          id="add-client-button"
          variant="primary"
          onClick={openAdd}
          className="sm:w-auto lg:min-w-40"
        >
          <PlusIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Add client
        </Button>
      </div>

      {adding && (
        <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close add client dialog"
            onClick={() => setAdding(false)}
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
                onClick={() => setAdding(false)}
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
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Your client book starts here"
          hint="Add your first client manually — name, mobile number, and how they invest. Your relationship queue builds itself from there."
          action={
            <Button variant="primary" onClick={openAdd}>
              <PlusIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
              Add client
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No clients found."
          hint="Try searching a different name."
        />
      ) : (
        <div
          className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4"
          aria-live="polite"
          aria-label="Client list"
        >
          {visible.map((record) => {
            const pill = signalPillForRecord(record);
            return (
              <Link
                key={record.id}
                href={`/workspace/clients/${record.id}`}
                className="group flex min-h-[56px] items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 lg:min-h-[84px] lg:px-4 lg:py-3"
              >
                <ClientAvatar name={record.name} className="lg:h-12 lg:w-12" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-base font-semibold text-stone-900">
                      {record.name}
                    </span>
                    {pill && (
                      <SignalBadge tone={pill.tone}>
                        {pill.icon}
                        {pill.label}
                      </SignalBadge>
                    )}
                  </span>
                  <span className="tnum flex items-center gap-1.5 truncate text-xs text-stone-600">
                    <FileTextIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{investmentLine(record)}</span>
                  </span>
                  <span className="tnum flex items-center gap-1.5 truncate text-xs text-stone-600">
                    <ClockIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{contactLine(record)}</span>
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5"
                >
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {records.length > 0 && (
        <p className="text-xs text-stone-600">
          {visible.length} of {records.length} client{records.length === 1 ? "" : "s"} shown.
        </p>
      )}
    </div>
  );
}
