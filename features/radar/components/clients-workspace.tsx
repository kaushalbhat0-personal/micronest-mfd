"use client";

import * as React from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/controls";
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
    return `Last contacted ${formatDisplayDate(record.lastContacted)}`;
  }
  return "Never contacted";
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
            <TextInput
              id="client-search"
              type="search"
              placeholder="Search by client name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
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
          {adding ? "Close" : "+ Add client"}
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
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-stone-900">No clients yet.</p>
            <p className="text-sm leading-relaxed text-stone-600">
              Add your first client above. Bulk setup from your existing financial software arrives
              with CSV import in a later phase.
            </p>
          </div>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-600">No clients found.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5" aria-live="polite" aria-label="Client list">
          {visible.map((record) => (
            <Link
              key={record.id}
              href={`/workspace/clients/${record.id}`}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold text-stone-900">
                    {record.name}
                  </span>
                  {record.isNewClient && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">
                      New
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-stone-500">
                  {record.investmentType} · {secondaryLine(record)}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-stone-400">
                →
              </span>
            </Link>
          ))}
        </div>
      )}

      {records.length > 0 && (
        <p className="text-xs text-stone-500">
          {visible.length} of {records.length} client{records.length === 1 ? "" : "s"} shown.
        </p>
      )}
    </div>
  );
}
