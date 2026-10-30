"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, TextArea, TextInput } from "@/components/ui/controls";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { dueWords } from "@/features/radar/today";
import { splitStoredFollowups } from "../model";
import { getFollowUpStatus } from "../dates";
import type { FollowUpStatus } from "../types";
import {
  completeFollowup,
  createFollowup,
  FollowupStoreError,
  listFollowupsForClient,
  reopenFollowup,
} from "../repository";
import type { StoredFollowup } from "../types";
import {
  fieldForFollowupError,
  validateFollowupInput,
  type FollowupFieldName,
} from "../validation";

type FormErrors = Partial<Record<FollowupFieldName, string>>;

function followupErrorMessage(error: unknown): string {
  if (error instanceof FollowupStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

function completedDisplayDate(completedAt: string): string {
  const ymd = completedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? formatDisplayDate(ymd) : "—";
}

/** Presentation-only tone for a follow-up status word. Text carries the meaning. */
export function followupStatusTone(status: FollowUpStatus): string {
  switch (status) {
    case "overdue":
      return "text-red-800";
    case "today":
      return "text-amber-800";
    case "upcoming":
      return "text-stone-500";
  }
}

/**
 * One-line factual status for an open follow-up: "6 days overdue",
 * "Due today". Upcoming rows show the absolute date alone (the due
 * date IS the status), so this renders nothing for them. Pure
 * presentation over getFollowUpStatus + dueWords — no new rules.
 */
export function FollowupStatusLine({
  dueDate,
  todayYMD,
}: {
  dueDate: string;
  todayYMD: string;
}): React.ReactNode {
  const { status, daysOverdue } = getFollowUpStatus(dueDate, todayYMD);
  if (status === "upcoming") return null;
  return (
    <p className={`text-xs font-medium ${followupStatusTone(status)}`}>
      {dueWords(status, daysOverdue, dueDate)}
    </p>
  );
}

/**
 * Persistent follow-ups for one client (RCCF-MFD-24, C2).
 * Single source of truth is listFollowupsForClient(); the open/completed
 * split is in-memory only and preserves repository ordering. Every mutation
 * persists first, then re-queries — no optimistic state, no second source.
 */
export function ClientFollowups({ clientId }: { clientId: string }) {
  const [rows, setRows] = React.useState<StoredFollowup[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [dueDate, setDueDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [toastId, setToastId] = React.useState<string | null>(null);
  const todayYMD = React.useMemo(() => todayLocalYMD(), []);

  function supabaseOrThrow(): SupabaseClient {
    if (!isSupabaseConfigured()) throw new Error("Authentication is not configured yet.");
    return createClient();
  }

  const refresh = React.useCallback(
    async (supabase: SupabaseClient) => {
      const next = await listFollowupsForClient(supabase, clientId);
      setRows(next);
      return next;
    },
    [clientId],
  );

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = supabaseOrThrow();
        const next = await listFollowupsForClient(supabase, clientId);
        if (!cancelled) setRows(next);
      } catch (error) {
        if (!cancelled) {
          setRows([]);
          setLoadError(followupErrorMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const { open, completed } = React.useMemo(() => splitStoredFollowups(rows ?? []), [rows]);

  function resetForm() {
    setDueDate("");
    setReason("");
    setNote("");
    setErrors({});
    setFormError(null);
    setSaveError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const today = todayLocalYMD();
    const checked = validateFollowupInput({ clientId, dueDate, reason, note }, today);
    if (!checked.row) {
      const field = fieldForFollowupError(checked.error);
      setErrors(field ? { [field]: checked.error } : {});
      setFormError(field ? null : (checked.error ?? "Please fix the highlighted field."));
      setSaveError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaveError(null);
    setSuccess(null);
    setActionError(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      await createFollowup(supabase, {
        clientId,
        dueDate: checked.row.dueDate,
        reason: checked.row.reason,
        note: checked.row.note,
      });
      await refresh(supabase);
      setFormOpen(false);
      resetForm();
      setSuccess("Follow-up added.");
      setToastId(null);
    } catch (error) {
      // Keep the form open with values intact so nothing is silently lost.
      setSaveError(followupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(id: string) {
    setActionError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      await completeFollowup(supabase, id);
      await refresh(supabase);
      setToastId(id);
    } catch (error) {
      setActionError(followupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen(id: string) {
    setActionError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const supabase = supabaseOrThrow();
      await reopenFollowup(supabase, id);
      await refresh(supabase);
      setToastId(null);
    } catch (error) {
      setActionError(followupErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = supabaseOrThrow();
      await refresh(supabase);
    } catch (error) {
      setLoadError(followupErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="followups-heading">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 id="followups-heading" className="text-sm font-semibold text-stone-900">
            Follow-ups{open.length > 0 ? ` ${open.length}` : ""}
          </h3>
          {!formOpen && (
            <Button
              variant="ghost"
              onClick={() => {
                setFormOpen(true);
                setSaveError(null);
                setFormError(null);
              }}
              className="min-h-[44px] px-3"
            >
              + Add follow-up
            </Button>
          )}
        </div>

        {loading && (
          <p className="mt-3 text-sm text-stone-500" role="status">
            Loading follow-ups…
          </p>
        )}

        {!loading && loadError && (
          <div className="mt-3">
            <Alert variant="error" title="Couldn't load follow-ups">
              <p className="mt-1 text-xs">{loadError}</p>
            </Alert>
            <div className="mt-2">
              <Button variant="secondary" onClick={handleRetry} className="min-h-[44px]">
                Retry
              </Button>
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <div className="mt-3 flex flex-col gap-3">
            {formOpen && (
              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
                <Field id="followup-due" label="Due date" error={errors.dueDate}>
                  <TextInput
                    id="followup-due"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    error={errors.dueDate}
                    min={todayYMD}
                    required
                  />
                </Field>
                <Field
                  id="followup-reason"
                  label="Reason"
                  error={errors.reason}
                  hint="Max 40 characters."
                >
                  <TextInput
                    id="followup-reason"
                    placeholder="e.g. Discuss SIP increase"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    error={errors.reason}
                    maxLength={40}
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field
                  id="followup-note"
                  label="Note (optional)"
                  error={errors.note}
                  hint="Max 200 characters."
                >
                  <TextArea
                    id="followup-note"
                    placeholder="e.g. Prefers evening calls"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    error={errors.note}
                    maxLength={200}
                  />
                </Field>
                {formError && (
                  <Alert variant="error" title="Please check this entry">
                    <p className="mt-1 text-xs">{formError}</p>
                  </Alert>
                )}
                {saveError && (
                  <Alert variant="error" title="Couldn't save">
                    <p className="mt-1 text-xs">{saveError}</p>
                  </Alert>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={busy} className="min-h-[44px] sm:flex-1">
                    {busy ? "Saving…" : "Add"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setFormOpen(false);
                      resetForm();
                    }}
                    disabled={busy}
                    className="min-h-[44px] sm:flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {success && (
              <p role="status" className="text-sm text-emerald-900">
                {success}
              </p>
            )}

            {actionError && (
              <Alert variant="error" title="Couldn't save that change">
                <p className="mt-1 text-xs">{actionError}</p>
              </Alert>
            )}

            {toastId && (
              <div
                role="status"
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
              >
                <p className="text-sm text-emerald-900">Marked done.</p>
                <Button
                  variant="ghost"
                  onClick={() => void handleReopen(toastId)}
                  disabled={busy}
                  className="min-h-[44px] px-2"
                >
                  Undo
                </Button>
              </div>
            )}

            {open.length === 0 ? (
              <p className="text-sm text-stone-500">No follow-ups yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {open.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-sm font-medium text-stone-900">{item.reason}</p>
                      <FollowupStatusLine dueDate={item.dueDate} todayYMD={todayYMD} />
                      <p className="text-xs text-stone-500">{formatDisplayDate(item.dueDate)}</p>
                      {item.note.length > 0 && (
                        <p className="text-xs text-stone-600">{item.note}</p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => void handleComplete(item.id)}
                      disabled={busy}
                      aria-label={`Mark ${item.reason} done`}
                      className="min-h-[44px] min-w-[44px] shrink-0 px-3"
                    >
                      Done
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {completed.length > 0 && (
              <details className="rounded-lg border border-stone-200">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 [&::-webkit-details-marker]:hidden">
                  <span>Completed ({completed.length})</span>
                  <span aria-hidden="true" className="text-xs text-stone-500">
                    ▾
                  </span>
                </summary>
                <ul className="flex flex-col gap-2 border-t border-stone-200 px-3 py-2">
                  {completed.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="text-sm font-medium text-stone-900">{item.reason}</p>
                        <p className="text-xs text-stone-500">
                          {item.completedAt ? completedDisplayDate(item.completedAt) : "—"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => void handleReopen(item.id)}
                        disabled={busy}
                        aria-label={`Reopen ${item.reason}`}
                        className="min-h-[44px] min-w-[44px] shrink-0 px-3"
                      >
                        Reopen
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
