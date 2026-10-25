"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { buildCallUrl, buildWhatsAppUrl } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MessageStudioForm } from "@/features/message-studio/components/message-studio-form";
import { buildRadarHandoff, markContacted } from "../model";
import {
  deleteClient,
  RadarStoreError,
  toClientRecord,
  updateClient,
  updateLastContacted,
  type ClientInput,
  type StoredRadarClient,
} from "../repository";
import { reasonsFor } from "../signals";
import { radarWhatsAppText } from "../view";
import { ClientForm, type ClientFormInitial } from "./client-form";

function storeErrorMessage(error: unknown): string {
  if (error instanceof RadarStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

function toFormInitial(stored: StoredRadarClient): ClientFormInitial {
  return {
    name: stored.name,
    phone: stored.phone,
    investmentType: stored.investmentType,
    lastInvested: stored.lastInvested ?? "",
    lastContacted: stored.lastContacted ?? "",
    isNewClient: stored.isNewClient,
    note: stored.note,
  };
}

function displayDate(value: string | null): string {
  return value ? formatDisplayDate(value) : "—";
}

/**
 * Client detail: the primary relationship action surface.
 * One stored client in, domain record out — signals recompute locally after
 * every mutation, and every mutation persists through the repository (RLS
 * final). Message reuses the existing studio form via the radar handoff;
 * Phase D will promote this inline composer into a proper workspace sheet.
 */
export function ClientDetail({ stored }: { stored: StoredRadarClient }) {
  const router = useRouter();
  const [todayYMD, setTodayYMD] = React.useState(() => todayLocalYMD());
  const [record, setRecord] = React.useState(() => toClientRecord(stored, 0, todayLocalYMD()));
  const [messaging, setMessaging] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [storeError, setStoreError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [formKey, setFormKey] = React.useState(0);
  const [lastContact, setLastContact] = React.useState<{
    prevLastContacted: string | null;
  } | null>(null);

  const reasons = reasonsFor(record, record.signals, todayYMD);
  const callUrl = buildCallUrl(record.phone);
  const waUrl = record.phoneValid
    ? buildWhatsAppUrl(radarWhatsAppText(record.name), record.phone)
    : null;

  function supabaseOrThrow(): SupabaseClient {
    if (!isSupabaseConfigured()) throw new Error("Authentication is not configured yet.");
    return createClient();
  }

  async function handleContacted() {
    const today = todayLocalYMD();
    setTodayYMD(today);
    setStoreError(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      // Persist first: the local transition below only runs on success, so
      // the UI can never disagree with the database.
      await updateLastContacted(supabase, record.id, today);
      setLastContact({ prevLastContacted: record.lastContacted });
      setRecord((prev) => markContacted(prev, today));
    } catch (error) {
      setStoreError(storeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    if (!lastContact) return;
    const prevLastContacted = lastContact.prevLastContacted;
    setStoreError(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      const updated = await updateLastContacted(supabase, record.id, prevLastContacted);
      const today = todayLocalYMD();
      setTodayYMD(today);
      setRecord(toClientRecord(updated, 0, today));
      setLastContact(null);
    } catch (error) {
      setStoreError(storeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(input: ClientInput) {
    setSaveError(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      const updated = await updateClient(supabase, record.id, input);
      const today = todayLocalYMD();
      setTodayYMD(today);
      setRecord(toClientRecord(updated, 0, today));
      setEditing(false);
      setFormKey((k) => k + 1);
    } catch (error) {
      setSaveError(storeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setStoreError(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      await deleteClient(supabase, record.id);
      router.push("/workspace/clients");
    } catch (error) {
      setStoreError(storeErrorMessage(error));
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  const handoff = React.useMemo(() => buildRadarHandoff(record), [record]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold text-stone-900">{record.name}</h2>
            <span className="flex shrink-0 items-center gap-1.5">
              {record.isNewClient && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
                  New
                </span>
              )}
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                {record.investmentType}
              </span>
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-stone-500">Mobile</dt>
              <dd className="font-medium text-stone-900">{record.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-stone-500">Last invested</dt>
              <dd className="font-medium text-stone-900">{displayDate(record.lastInvested)}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-stone-500">Last contacted</dt>
              <dd className="font-medium text-stone-900">{displayDate(record.lastContacted)}</dd>
            </div>
          </dl>

          {record.note.length > 0 && (
            <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{record.note}</p>
          )}

          {reasons.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-900">Why this client is surfaced</p>
              <ul className="mt-1.5 space-y-1">
                {reasons.map((reason) => (
                  <li key={reason} className="text-sm text-emerald-900">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!record.phoneValid && (
            <p className="text-xs text-stone-500">
              {record.phone
                ? "Phone number needs checking — Call and WhatsApp are unavailable."
                : "No mobile number — Message is still available."}
            </p>
          )}
        </div>
      </Card>

      {storeError && (
        <Alert variant="error" title="Couldn't save that change">
          <p className="mt-1 text-xs">{storeError}</p>
        </Alert>
      )}

      {lastContact && (
        <div
          role="status"
          className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
        >
          <p className="text-sm text-emerald-900">Marked {record.name} as contacted.</p>
          <Button variant="ghost" onClick={handleUndo} disabled={busy} className="px-2">
            Undo
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {callUrl ? (
          <a href={callUrl} className={cn(buttonClasses("primary"), "min-h-[48px]")}>
            Call
          </a>
        ) : (
          <button type="button" disabled className={cn(buttonClasses("primary"), "min-h-[48px]")}>
            Call
          </button>
        )}
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonClasses("primary"), "min-h-[48px]")}
          >
            WhatsApp
          </a>
        ) : (
          <button type="button" disabled className={cn(buttonClasses("primary"), "min-h-[48px]")}>
            WhatsApp
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          onClick={() => setMessaging((v) => !v)}
          className="min-h-[48px] sm:flex-1"
        >
          {messaging ? "Close message" : "Message"}
        </Button>
        <Button
          variant="secondary"
          onClick={handleContacted}
          disabled={busy}
          className="min-h-[48px] sm:flex-1"
        >
          {busy ? "Saving…" : "Mark contacted"}
        </Button>
      </div>

      {messaging && (
        <MessageStudioForm
          key={record.id}
          initialPurpose={handoff.purpose}
          initialFields={handoff.fields}
          initialPhone={handoff.phone}
        />
      )}

      <div className="border-t border-stone-200 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-900">Maintain</h3>
          {!editing && !confirmingDelete && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(true)} className="px-3">
                Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                className="px-3 text-red-700 hover:bg-red-50"
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        {editing && (
          <div className="mt-3">
            <ClientForm
              key={formKey}
              initial={toFormInitial(record)}
              submitLabel="Save changes"
              saving={busy}
              externalError={saveError}
              onSubmit={handleSaveEdit}
              onCancel={() => {
                setEditing(false);
                setSaveError(null);
              }}
            />
          </div>
        )}

        {confirmingDelete && (
          <div
            role="alertdialog"
            aria-label="Confirm delete"
            aria-describedby="delete-desc"
            className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <p className="text-sm font-medium text-stone-900">
              Delete {record.name} from your workspace?
            </p>
            <p id="delete-desc" className="mt-1 text-xs leading-relaxed text-stone-600">
              This permanently removes the client. This cannot be undone.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="primary"
                onClick={handleDelete}
                disabled={busy}
                className="bg-red-700 hover:bg-red-800 focus-visible:ring-red-700 sm:flex-1"
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="sm:flex-1"
              >
                Keep client
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
