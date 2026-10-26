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

function secondaryLine(record: ClientRecord): string {
  if (record.lastContacted) {
    return `${record.investmentType} · Last contacted ${formatDisplayDate(record.lastContacted)}`;
  }
  return `${record.investmentType} · Never contacted`;
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

  const visible = React.useMemo(() => filterClientsByName(records, query), [records, query]);

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                className="pl-10"
              />
            </span>
          </Field>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setSaveError(null);
            setAdding((v) => !v);
          }}
          className="sm:w-auto"
        >
          <PlusIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
          {adding ? "Close" : "Add client"}
        </Button>
      </div>

      {adding && (
        <ClientForm
          key={formKey}
          submitLabel="Add client"
          saving={saving}
          externalError={saveError}
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {records.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Your client list starts here."
          hint="Add your first client above. Bulk setup from your existing financial software arrives with CSV import in a later phase."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No clients found."
          hint="Try searching a different name."
        />
      ) : (
        <div
          className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2"
          aria-live="polite"
          aria-label="Client list"
        >
          {visible.map((record) => {
            const pill = signalPillForRecord(record);
            return (
              <Link
                key={record.id}
                href={`/workspace/clients/${record.id}`}
                className="flex min-h-[56px] items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                <ClientAvatar name={record.name} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-base font-semibold text-stone-900">
                    {record.name}
                  </span>
                  <span className="tnum truncate text-xs text-stone-500">
                    {secondaryLine(record)}
                  </span>
                </span>
                {pill && (
                  <SignalBadge tone={pill.tone}>
                    {pill.icon}
                    {pill.label}
                  </SignalBadge>
                )}
                <span aria-hidden="true" className="shrink-0 text-stone-500">
                  →
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
