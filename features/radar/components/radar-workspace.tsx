"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/controls";
import { MessageStudioForm } from "@/features/message-studio/components/message-studio-form";
import { todayLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { RADAR_HEADERS } from "../template";
import {
  DEFAULT_RECONNECT_INTERVAL_DAYS,
  RECONNECT_INTERVAL_OPTIONS,
  sortRadarRecords,
} from "../signals";
import type { ClientRecord, RadarReport } from "../types";
import { buildRadarHandoff, markContacted, parseAndBuildRadar, serializeRadarCsv } from "../model";
import {
  listClients,
  RadarStoreError,
  toClientRecord,
  updateLastContacted,
  type StoredRadarClient,
} from "../repository";
import { validateRadarFileMeta } from "../validation";
import {
  filterRadarRecords,
  summarizeRadar,
  withReconnectInterval,
  type RadarFilter,
} from "../view";
import { RadarClientCard } from "./radar-client-card";
import { RadarFilters } from "./radar-filters";

const EMPTY_FILTER_COPY: Record<Exclude<RadarFilter, "all">, { title: string; hint: string }> = {
  attention: {
    title: "You're all caught up.",
    hint: "No clients need attention right now.",
  },
  "recent-investor": {
    title: "No recent investors.",
    hint: "No clients invested in the last 30 days.",
  },
  "reconnect-due": {
    title: "No reconnects due.",
    hint: "You're caught up on reconnects.",
  },
  "new-client": {
    title: "No new clients.",
    hint: "No clients are marked as new.",
  },
};

type StoreStatus = "idle" | "loading" | "ready" | "error";
type ViewSource = "cloud" | "import" | null;

function storeErrorMessage(error: unknown): string {
  if (error instanceof RadarStoreError) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * Client Radar workspace: import → triage → reach out → mark contacted → export.
 *
 * Two data modes, one UI:
 * - Cloud (Supabase configured + signed in): records load from the user's
 *   database on open, refresh on focus/manual refresh, and Mark Contacted
 *   persists. CSV import still works session-locally for bulk review.
 * - Session-local (otherwise): the original import → work → export flow,
 *   byte-for-byte unchanged behavior.
 */
export function RadarWorkspace() {
  // Session date only — read on mount and at each interaction, never during
  // prerender. Records only exist after an import or cloud load
  // (post-hydration), so the fallback is never displayed.
  const [todayYMD, setTodayYMD] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<RadarReport | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<ClientRecord[]>([]);
  const [filter, setFilter] = React.useState<RadarFilter>("attention");
  const [intervalDays, setIntervalDays] = React.useState<number>(DEFAULT_RECONNECT_INTERVAL_DAYS);
  const [selected, setSelected] = React.useState<ClientRecord | null>(null);
  const [lastContact, setLastContact] = React.useState<{
    id: string;
    name: string;
    prev: ClientRecord;
  } | null>(null);

  // Persistence state. Untouched when Supabase isn't configured.
  const [persistenceOn, setPersistenceOn] = React.useState(false);
  const [storeStatus, setStoreStatus] = React.useState<StoreStatus>("idle");
  const [storeError, setStoreError] = React.useState<string | null>(null);
  const [viewSource, setViewSource] = React.useState<ViewSource>(null);
  const [hasCloudData, setHasCloudData] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const supabaseRef = React.useRef<SupabaseClient | null>(null);
  const persistedIdsRef = React.useRef<Set<string>>(new Set());
  const loadInFlight = React.useRef(false);
  const viewSourceRef = React.useRef<ViewSource>(null);
  const intervalDaysRef = React.useRef(intervalDays);
  React.useEffect(() => {
    viewSourceRef.current = viewSource;
    intervalDaysRef.current = intervalDays;
  });

  const applyCloudRecords = React.useCallback(
    (stored: StoredRadarClient[], today: string, interval: number) => {
      const mapped = stored.map((s, i) => toClientRecord(s, i, today, interval));
      const sorted = sortRadarRecords(mapped, today);
      persistedIdsRef.current = new Set(sorted.map((r) => r.id));
      setHasCloudData(sorted.length > 0);
      setRecords(sorted);
    },
    [],
  );

  const loadCloud = React.useCallback(
    async (client: SupabaseClient, opts?: { silent?: boolean; resetView?: boolean }) => {
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setStoreStatus("loading");
      }
      setStoreError(null);
      try {
        const today = todayLocalYMD();
        const stored = await listClients(client);
        if (opts?.resetView !== false) {
          setFilter("attention");
          setLastContact(null);
          setSelected(null);
        }
        setTodayYMD(today);
        applyCloudRecords(stored, today, intervalDaysRef.current);
        setViewSource("cloud");
        setStoreStatus("ready");
      } catch (error) {
        setStoreError(storeErrorMessage(error));
        setStoreStatus((prev) => (prev === "ready" ? prev : "error"));
      } finally {
        loadInFlight.current = false;
        setRefreshing(false);
      }
    },
    [applyCloudRecords],
  );

  // Initial cloud load + focus refresh. No-op without Supabase configured.
  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const client = createClient();
      supabaseRef.current = client;
      const { data } = await client.auth.getUser();
      if (cancelled) return;
      if (!data.user) return;
      setPersistenceOn(true);
      await loadCloud(client);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCloud]);

  // Cross-device refresh: refetch when the page becomes active again.
  // Only while viewing the cloud dataset — never yanks an import away.
  React.useEffect(() => {
    if (!persistenceOn) return;
    const onActive = () => {
      if (document.hidden) return;
      if (viewSourceRef.current !== "cloud") return;
      const client = supabaseRef.current;
      if (!client) return;
      void loadCloud(client, { silent: true });
    };
    const onVisibility = () => {
      if (!document.hidden) onActive();
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistenceOn, loadCloud]);

  function reset() {
    setFileName(null);
    setReport(null);
    setFileError(null);
    setFilter("attention");
    setIntervalDays(DEFAULT_RECONNECT_INTERVAL_DAYS);
    setSelected(null);
    setLastContact(null);
    setStoreError(null);
    if (persistenceOn) {
      // Back to the import screen; saved Radar stays one tap away.
      setViewSource(null);
      setRecords([]);
      persistedIdsRef.current = new Set();
    } else {
      setRecords([]);
    }
  }

  function backToCloud() {
    const client = supabaseRef.current;
    if (!client) return;
    void loadCloud(client);
  }

  function handleFileText(name: string, text: string) {
    const today = todayLocalYMD();
    setTodayYMD(today);
    setFileError(null);
    setSelected(null);
    setLastContact(null);
    setFilter("attention");
    setFileName(name);
    const next = parseAndBuildRadar(text, today, intervalDays);
    setReport(next);
    setRecords(next.records);
    persistedIdsRef.current = new Set();
    setViewSource("import");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const metaError = validateRadarFileMeta(file.name, file.size);
    if (metaError) {
      setReport(null);
      setRecords([]);
      setFileName(null);
      setFileError(metaError);
      return;
    }
    try {
      const text = await file.text();
      handleFileText(file.name, text);
    } catch {
      setFileError("Could not read this file. Try saving it as CSV and uploading again.");
    }
  }

  function handleIntervalChange(days: number) {
    const today = todayLocalYMD();
    setTodayYMD(today);
    setIntervalDays(days);
    setLastContact(null);
    setRecords((prev) => withReconnectInterval(prev, today, days));
  }

  async function handleContacted(id: string) {
    const today = todayLocalYMD();
    setTodayYMD(today);
    const target = records.find((r) => r.id === id);
    if (!target) return;
    const client = supabaseRef.current;
    if (!persistenceOn || !client || !persistedIdsRef.current.has(id)) {
      setLastContact({ id, name: target.name, prev: target });
      setRecords((prev) =>
        sortRadarRecords(
          prev.map((r) => (r.id === id ? markContacted(r, today, intervalDays) : r)),
          today,
        ),
      );
      return;
    }
    setPendingIds((prev) => new Set(prev).add(id));
    setStoreError(null);
    try {
      await updateLastContacted(client, id, today);
      setRecords((prev) =>
        sortRadarRecords(
          prev.map((r) => (r.id === id ? markContacted(r, today, intervalDays) : r)),
          today,
        ),
      );
      setLastContact({ id, name: target.name, prev: target });
    } catch (error) {
      setStoreError(storeErrorMessage(error));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleUndo() {
    if (!lastContact) return;
    const { prev } = lastContact;
    const today = todayYMD ?? todayLocalYMD();
    const client = supabaseRef.current;
    if (!persistenceOn || !client || !persistedIdsRef.current.has(prev.id)) {
      setRecords((current) =>
        sortRadarRecords(
          current.map((r) => (r.id === prev.id ? prev : r)),
          today,
        ),
      );
      setLastContact(null);
      return;
    }
    setPendingIds((ids) => new Set(ids).add(prev.id));
    try {
      await updateLastContacted(client, prev.id, prev.lastContacted);
      setRecords((current) =>
        sortRadarRecords(
          current.map((r) => (r.id === prev.id ? prev : r)),
          today,
        ),
      );
      setLastContact(null);
    } catch (error) {
      setStoreError(storeErrorMessage(error));
    } finally {
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(prev.id);
        return next;
      });
    }
  }

  function handleExport() {
    const csv = serializeRadarCsv(records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "client-radar-updated.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const summary = React.useMemo(() => summarizeRadar(records), [records]);
  const visible = React.useMemo(() => filterRadarRecords(records, filter), [records, filter]);
  const showImportScreen = persistenceOn
    ? storeStatus === "ready" && records.length === 0 && viewSource !== "import"
    : !report;

  // Message view: prefilled studio for one client. Back returns with state intact.
  if (selected) {
    const handoff = buildRadarHandoff(selected);
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button variant="ghost" onClick={() => setSelected(null)}>
            ← Back to Client Radar
          </Button>
        </div>
        <MessageStudioForm
          initialPurpose={handoff.purpose}
          initialFields={handoff.fields}
          initialPhone={handoff.phone}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {persistenceOn && storeStatus === "loading" && (
        <Card>
          <p role="status" className="text-sm text-stone-600">
            Loading your Client Radar…
          </p>
        </Card>
      )}

      {persistenceOn && storeStatus === "error" && records.length === 0 && (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-stone-900">
              We couldn&apos;t load your Client Radar.
            </p>
            {storeError && <p className="text-xs text-stone-600">{storeError}</p>}
            <Button variant="primary" onClick={backToCloud} className="sm:self-start">
              Try again
            </Button>
          </div>
        </Card>
      )}

      {showImportScreen && !(persistenceOn && storeStatus !== "ready") && (
        <Card>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-600">
              Know which clients are worth talking to this week — and why.
            </p>

            <a
              href="/client-radar-template.csv"
              download="client-radar-template.csv"
              className={cn(buttonClasses("primary"), "sm:self-start")}
            >
              Download CSV Template
            </a>

            <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
              <li>Download the template.</li>
              <li>Fill in your client list.</li>
              <li>Save as CSV and upload it here.</li>
            </ol>

            <div
              role="region"
              aria-label="Expected CSV columns"
              className="rounded-lg border border-stone-200 bg-stone-50 p-3"
            >
              <p className="text-xs font-medium text-stone-700">Your CSV needs these columns:</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {RADAR_HEADERS.map((h) => (
                  <li
                    key={h}
                    className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700"
                  >
                    {h}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-500">
                Dates use DD/MM/YYYY (e.g. 25/10/2026). Maximum 500 clients per file. Nothing leaves
                your device.
              </p>
            </div>

            <div className="border-t border-stone-200 pt-4">
              <Field
                id="radar-file"
                label="Upload Client CSV"
                hint="Only .csv files up to 2 MB. Everything is processed on this device."
              >
                <input
                  id="radar-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                />
              </Field>
            </div>

            {persistenceOn && hasCloudData && (
              <Button variant="secondary" onClick={backToCloud}>
                ← Back to saved Radar
              </Button>
            )}

            {fileError && (
              <Alert variant="error" title="Could not import file">
                <p className="mt-1 text-xs">{fileError}</p>
              </Alert>
            )}
          </div>
        </Card>
      )}

      {report && viewSource === "import" && (
        <>
          <section aria-label="Import result" aria-live="polite" className="flex flex-col gap-3">
            {report.records.length > 0 ? (
              <Alert
                variant="warning"
                title={`Imported ${report.records.length} client${report.records.length === 1 ? "" : "s"}${fileName ? ` from ${fileName}` : ""}`}
              >
                <ul className="mt-1 space-y-0.5 text-xs">
                  {report.invalid.length > 0 && (
                    <li>
                      Skipped: {report.invalid.length} row
                      {report.invalid.length === 1 ? "" : "s"}
                    </li>
                  )}
                  {report.skippedBlank > 0 && (
                    <li>
                      Ignored {report.skippedBlank} blank line
                      {report.skippedBlank === 1 ? "" : "s"}
                    </li>
                  )}
                  {report.ignoredColumns.length > 0 && (
                    <li>Ignored columns: {report.ignoredColumns.join(", ")}</li>
                  )}
                </ul>
              </Alert>
            ) : (
              <Alert variant="error" title="Could not import clients">
                <p className="mt-1 text-xs">{report.fileError}</p>
              </Alert>
            )}

            {report.invalid.length > 0 && (
              <details className="rounded-lg border border-stone-200 bg-white p-3">
                <summary className="min-h-[44px] cursor-pointer text-sm font-medium text-stone-800">
                  Skipped rows ({report.invalid.length}) — tap to see why
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-stone-600">
                  {report.invalid.map((item) => (
                    <li key={item.rowNumber}>
                      <span className="font-medium">Row {item.rowNumber}:</span> {item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}

      {records.length > 0 && (
        <>
          {storeError && (
            <Alert variant="error" title="Couldn't save that change">
              <p className="mt-1 text-xs">{storeError}</p>
            </Alert>
          )}
          <Card>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                <div className="rounded-lg bg-stone-50 px-2 py-2">
                  <p className="text-lg font-semibold text-stone-900">{summary.total}</p>
                  <p className="text-xs text-stone-500">Clients</p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2">
                  <p className="text-lg font-semibold text-stone-900">{summary.attention}</p>
                  <p className="text-xs text-stone-500">Need Attention</p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2">
                  <p className="text-lg font-semibold text-stone-900">{summary.recentInvestors}</p>
                  <p className="text-xs text-stone-500">Recent Investors</p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2">
                  <p className="text-lg font-semibold text-stone-900">{summary.newClients}</p>
                  <p className="text-xs text-stone-500">New Clients</p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2">
                  <p className="text-lg font-semibold text-stone-900">{summary.reconnectDue}</p>
                  <p className="text-xs text-stone-500">Reconnect Due</p>
                </div>
              </div>

              <Field id="radar-interval" label="Reconnect every">
                <Select
                  id="radar-interval"
                  value={String(intervalDays)}
                  onChange={(e) => handleIntervalChange(Number(e.target.value))}
                >
                  {RECONNECT_INTERVAL_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} days
                    </option>
                  ))}
                </Select>
              </Field>

              {persistenceOn && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    const client = supabaseRef.current;
                    if (client) void loadCloud(client, { silent: true });
                  }}
                  disabled={refreshing}
                  className="self-start px-2"
                >
                  {refreshing ? "Refreshing…" : "Refresh Radar"}
                </Button>
              )}
            </div>
          </Card>

          <RadarFilters
            counts={{
              attention: summary.attention,
              recent: summary.recentInvestors,
              reconnect: summary.reconnectDue,
              fresh: summary.newClients,
              all: summary.total,
            }}
            value={filter}
            onChange={setFilter}
          />

          {lastContact && (
            <div
              role="status"
              className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
            >
              <p className="text-sm text-emerald-900">Marked {lastContact.name} as contacted.</p>
              <Button
                variant="ghost"
                onClick={handleUndo}
                disabled={pendingIds.has(lastContact.id)}
                className="px-2"
              >
                Undo
              </Button>
            </div>
          )}

          {visible.length === 0 && filter !== "all" ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
              <p className="text-sm font-medium text-stone-800">
                {EMPTY_FILTER_COPY[filter].title}
              </p>
              <p className="mt-1 text-xs text-stone-500">{EMPTY_FILTER_COPY[filter].hint}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3" aria-live="polite">
              {visible.map((record) => (
                <RadarClientCard
                  key={record.id}
                  record={record}
                  // Records only exist after an import or cloud load, which
                  // always sets todayYMD first. The fallback never renders.
                  todayYMD={todayYMD ?? "1970-01-01"}
                  onMessage={setSelected}
                  onContacted={handleContacted}
                  pending={pendingIds.has(record.id)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" onClick={handleExport} className="sm:flex-1">
              Download Updated CSV
            </Button>
            <Button variant="secondary" onClick={reset} className="sm:flex-1">
              Upload a different file
            </Button>
          </div>
        </>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        {persistenceOn ? (
          <>
            Contact updates save to your account and appear on all your devices. CSV imports stay in
            this session. Do not include PAN, Aadhaar, bank, OTP or password details in your CSV.
          </>
        ) : (
          <>
            Your changes stay in this session. Download the updated CSV when you&apos;re done.
            Nothing is saved — reloading clears everything. Do not include PAN, Aadhaar, bank, OTP
            or password details in your CSV.
          </>
        )}
      </p>
    </div>
  );
}
