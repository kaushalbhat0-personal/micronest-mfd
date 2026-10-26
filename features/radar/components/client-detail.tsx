"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { CheckIcon, EditIcon, MessageIcon, PhoneIcon, TrashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { buildCallUrl, buildWhatsAppUrl } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MessageStudioForm } from "@/features/message-studio/components/message-studio-form";
import { ClientFollowups } from "@/features/followups/components/client-followups";
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
import type { Signal } from "../types";
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

export type WhySeverity = "warning" | "reconnect" | "neutral";

/**
 * Presentation-only severity for the Why-contact box. Reads the existing
 * domain signals (computeSignals is the source of truth) — never
 * recalculated here. Actionable attention (reconnect/new) renders amber;
 * recent-only renders emerald; no signal renders neutral.
 */
export function whySeverityForSignals(signals: Signal[]): WhySeverity {
  if (signals.includes("reconnect-due") || signals.includes("new-client")) return "warning";
  if (signals.includes("recent-investor")) return "reconnect";
  return "neutral";
}

const WHY_SEVERITY_STYLE: Record<WhySeverity, { accent: string; box: string; text: string }> = {
  warning: {
    accent: "today-accent-warning",
    box: "border-amber-200 bg-amber-50",
    text: "text-amber-900",
  },
  reconnect: {
    accent: "today-accent-reconnect",
    box: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-900",
  },
  neutral: {
    accent: "today-accent",
    box: "border-stone-200 bg-stone-50",
    text: "text-stone-700",
  },
};

function identityMeta(record: Pick<StoredRadarClient, "investmentType" | "lastContacted">): string {
  if (record.lastContacted) {
    return `${record.investmentType} · Last contacted ${formatDisplayDate(record.lastContacted)}`;
  }
  return `${record.investmentType} · Never contacted`;
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
  const whySeverity = whySeverityForSignals(record.signals);
  const whyStyle = WHY_SEVERITY_STYLE[whySeverity];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="compact">
        <div className="flex items-center gap-4">
          <ClientAvatar name={record.name} className="h-14 w-14 text-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-xl font-semibold break-words tracking-tight text-stone-900">
              {record.name}
            </h2>
            <p className="tnum text-sm text-stone-500">{identityMeta(record)}</p>
          </div>
          {record.isNewClient && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
              New
            </span>
          )}
        </div>

        {!record.phoneValid && (
          <p className="mt-3 text-xs text-stone-500">
            {record.phone
              ? "Phone number needs checking — Call and WhatsApp are unavailable."
              : "No mobile number — Message is still available."}
          </p>
        )}
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

      {reasons.length > 0 && (
        <section
          aria-label="Why contact"
          className={cn("rounded-xl border p-4 shadow-sm sm:p-5", whyStyle.accent, whyStyle.box)}
        >
          <h3 className={cn("eyebrow", whyStyle.text)}>Why contact?</h3>
          <ul className="mt-2 space-y-1.5">
            {reasons.map((reason) => (
              <li key={reason} className={cn("text-base font-medium", whyStyle.text)}>
                {reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        {callUrl ? (
          <a href={callUrl} className={cn(buttonClasses("primary"), "min-h-[48px]")}>
            <PhoneIcon aria-hidden="true" className="mr-2 h-4 w-4" />
            Call
          </a>
        ) : (
          <button type="button" disabled className={cn(buttonClasses("primary"), "min-h-[48px]")}>
            <PhoneIcon aria-hidden="true" className="mr-2 h-4 w-4" />
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
            <MessageIcon aria-hidden="true" className="mr-2 h-4 w-4" />
            WhatsApp
          </a>
        ) : (
          <button type="button" disabled className={cn(buttonClasses("primary"), "min-h-[48px]")}>
            <MessageIcon aria-hidden="true" className="mr-2 h-4 w-4" />
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
          <MessageIcon aria-hidden="true" className="mr-2 h-4 w-4" />
          {messaging ? "Close message" : "Message"}
        </Button>
        <Button
          variant="secondary"
          onClick={handleContacted}
          disabled={busy}
          className="min-h-[48px] sm:flex-1"
        >
          <CheckIcon aria-hidden="true" className="mr-2 h-4 w-4" />
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ClientFollowups clientId={record.id} />

          <Card>
            <div className="flex flex-col gap-3">
              <h3 className="eyebrow">Details</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-stone-500">Mobile</dt>
                  <dd className="font-medium break-words text-stone-900">{record.phone || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-stone-500">Last invested</dt>
                  <dd className="font-medium text-stone-900">{displayDate(record.lastInvested)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-stone-500">Last contacted</dt>
                  <dd className="font-medium text-stone-900">
                    {displayDate(record.lastContacted)}
                  </dd>
                </div>
              </dl>

              {record.note.length > 0 && (
                <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{record.note}</p>
              )}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card padding="compact">
            <div className="flex flex-col gap-2">
              <h3 className="eyebrow">Maintain</h3>
              {!editing && !confirmingDelete && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    className="min-h-[44px] flex-1"
                  >
                    <EditIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmingDelete(true)}
                    className="min-h-[44px] flex-1 text-red-700 hover:bg-red-50"
                  >
                    <TrashIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />
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
          </Card>
        </div>
      </div>
    </div>
  );
}
