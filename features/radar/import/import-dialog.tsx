"use client";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/controls";
import { SignalBadge } from "@/components/ui/signal-badge";
import { DownloadIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { nowMs } from "@/lib/dates";
import { reportPerf } from "@/lib/perf/report";
import {
  createClient as createStoredClient,
  type StoredRadarClient,
} from "@/features/radar/repository";
import { MAX_DATA_ROWS, validateRadarFileMeta } from "@/features/radar/validation";
import { RADAR_HEADERS, type RadarHeader } from "@/features/radar/template";
import { autoMapColumns } from "./aliases";
import type { DuplicateIdentity } from "./duplicates";
import { buildPreview, importableRows } from "./pipeline";
import {
  buildErrorCsv,
  buildTemplateCsv,
  TEMPLATE_FILENAME,
  downloadTextFile,
} from "./template-csv";
import {
  buildTemplateXlsx,
  CLIENTS_SHEET_NAME,
  downloadBinaryFile,
  IMPORT_GUIDE_ROWS,
  TEMPLATE_XLSX_FILENAME,
} from "./template-xlsx";
import { parseCsvSheet, parseXlsxWorkbook } from "./workbook";
import type { ColumnMapping, ImportSheet, PreviewRow } from "./import-types";

type Step = "file" | "sheet" | "mapping" | "preview" | "importing" | "receipt";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  configured: boolean;
  existing: DuplicateIdentity[];
  onImported: (stored: StoredRadarClient[]) => void;
}

function statusTone(status: PreviewRow["status"]): "emerald" | "amber" | "stone" | "red" {
  if (status === "ready") return "emerald";
  if (status === "attention") return "amber";
  if (status === "invalid") return "red";
  return "stone";
}

function statusLabel(status: PreviewRow["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "attention") return "Check now";
  if (status === "invalid") return "Needs fixing";
  return "Not added";
}

/** Duplicate rows keep the "skipped" status but render as already added. */
function rowBadgeLabel(row: PreviewRow): string {
  if (row.duplicate) return "Already added";
  return statusLabel(row.status);
}

/**
 * Bulk client import (RCCF-MFD-44). Pure client-side flow: parse → sheet →
 * map → preview → validate → import → receipt. Files never leave the
 * device and are never stored; created rows persist through the same
 * repository (RLS final) as manual entry.
 */
export function ImportDialog({
  open,
  onClose,
  configured,
  existing,
  onImported,
}: ImportDialogProps) {
  const [step, setStep] = React.useState<Step>("file");
  const [fileName, setFileName] = React.useState("");
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [sheets, setSheets] = React.useState<ImportSheet[]>([]);
  const [sheetIndex, setSheetIndex] = React.useState(0);
  const [mapping, setMapping] = React.useState<ColumnMapping>([]);
  const [rows, setRows] = React.useState<PreviewRow[]>([]);
  const [fatal, setFatal] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [receipt, setReceipt] = React.useState<{
    added: number;
    failed: number;
    skipped: number;
    timestamp: string;
  } | null>(null);
  const [parsing, setParsing] = React.useState(false);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const sheet: ImportSheet | null = sheets.length > 0 ? sheets[sheetIndex] : null;
  const importable = importableRows(rows);
  const ready = rows.filter((r) => r.status === "ready").length;
  const attention = rows.filter((r) => r.status === "attention").length;
  const invalid = rows.filter((r) => r.status === "invalid").length;
  const skipped = rows.filter((r) => r.status === "skipped").length;
  const duplicates = rows.filter((r) => r.duplicate).length;
  const otherSkipped = skipped - duplicates;
  const nameMapped = mapping.some((m) => m === "Client Name");

  const reset = React.useCallback(() => {
    setStep("file");
    setFileName("");
    setFileError(null);
    setSheets([]);
    setSheetIndex(0);
    setMapping([]);
    setRows([]);
    setFatal(null);
    setProgress({ done: 0, total: 0 });
    setReceipt(null);
    setParsing(false);
  }, []);

  const handleClose = React.useCallback(() => {
    if (step === "importing") return;
    reset();
    onClose();
  }, [step, reset, onClose]);

  // Dialog focus management: into the panel on open, back to the trigger
  // on close. Escape closes (except mid-import). Mirrors the Add dialog.
  React.useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.getElementById("import-clients-button")?.focus();
    };
  }, [open, handleClose]);

  async function handleFile(file: File) {
    setFileError(null);
    setFatal(null);
    const metaError = validateRadarFileMeta(file.name, file.size);
    if (metaError) {
      setFileError(metaError);
      return;
    }
    setParsing(true);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const parsed = parseCsvSheet(file.name, text);
        beginMapping(file.name, [parsed]);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = await parseXlsxWorkbook(buffer);
        beginMapping(file.name, workbook.sheets);
      }
    } catch {
      setFileError("We couldn't read this file. Check the format and try again.");
    } finally {
      setParsing(false);
    }
  }

  function beginMapping(name: string, parsedSheets: ImportSheet[]) {
    const usable = parsedSheets.filter((s) => s.header.length > 0);
    if (usable.length === 0) {
      setFatal("We couldn't identify the column headers. Check the file has a header row.");
      setFileName(name);
      return;
    }
    setFileName(name);
    setSheets(usable);
    // Prefer the template's Clients sheet (a downloaded template also
    // carries a How to Fill guide sheet that must never be imported).
    const clientsIndex = usable.findIndex(
      (s) => s.name.trim().toLowerCase() === CLIENTS_SHEET_NAME.toLowerCase(),
    );
    const preferred = clientsIndex === -1 ? 0 : clientsIndex;
    if (usable.length === 1) {
      applySheet(usable, 0);
    } else {
      setSheetIndex(preferred);
      setStep("sheet");
    }
  }

  function applySheet(allSheets: ImportSheet[], index: number) {
    const selected = allSheets[index];
    if (selected.rows.length > MAX_DATA_ROWS) {
      setFatal(
        `This sheet has ${selected.rows.length} rows — imports are limited to ${MAX_DATA_ROWS} rows per file. Split it and upload separately.`,
      );
      setSheetIndex(index);
      return;
    }
    setSheetIndex(index);
    setMapping(autoMapColumns(selected.header));
    setStep("mapping");
  }

  function updateMapping(column: number, value: string) {
    const canonical = value === "" ? null : (value as RadarHeader);
    setMapping((prev) => {
      const next = [...prev];
      // One source column per canonical field: clear any previous claim.
      if (canonical !== null) {
        const claimed = next.indexOf(canonical);
        if (claimed !== -1 && claimed !== column) next[claimed] = null;
      }
      next[column] = canonical;
      return next;
    });
  }

  function handlePreview() {
    if (!sheet) return;
    const preview = buildPreview({ sheet, mapping, existing });
    setRows(preview.rows);
    setStep("preview");
  }

  /**
   * "Remove" only drops the row from the pending import — the existing
   * Client Book record is never touched. Duplicates are already excluded
   * from the import set; removing them just clears the review list.
   */
  function handleRemoveRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function handleRemoveDuplicates() {
    setRows((prev) => prev.filter((r) => !r.duplicate));
  }

  async function handleImport() {
    if (!isSupabaseConfigured()) return;
    const targets = importableRows(rows);
    if (targets.length === 0) return;
    // Aggregate import observability (counts + durations only — no client
    // data, filenames, or file contents). Fire-and-forget; never blocks.
    const started = nowMs();
    setStep("importing");
    setProgress({ done: 0, total: targets.length });
    const writeStarted = nowMs();
    const supabase: SupabaseClient = createClient();
    const created: StoredRadarClient[] = [];
    let failed = 0;
    for (const target of targets) {
      if (!target.input) {
        failed += 1;
        continue;
      }
      try {
        const stored = await createStoredClient(supabase, target.input);
        created.push(stored);
      } catch {
        failed += 1;
      }
      setProgress({ done: created.length + failed, total: targets.length });
    }
    const writeMs = nowMs() - writeStarted;
    reportPerf({
      op: "import.session",
      attempted: targets.length,
      ready,
      skipped,
      invalid,
      duplicate: duplicates,
      added: created.length,
      failed,
      writeMs,
      durationMs: nowMs() - started,
    });
    onImported(created);
    setReceipt({
      added: created.length,
      failed,
      skipped: skipped + invalid,
      timestamp: new Date().toLocaleString(),
    });
    setStep("receipt");
  }

  function handleDownloadErrors() {
    downloadTextFile("import-needs-attention.csv", buildErrorCsv(rows), "text/csv");
  }

  if (!open) return null;

  const usedCanonicals = new Set(mapping.filter((m): m is RadarHeader => m !== null));

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close import dialog"
        onClick={handleClose}
        disabled={step === "importing"}
        className="absolute inset-0 cursor-default bg-stone-900/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-heading"
        tabIndex={-1}
        className="today-enter relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-stone-200 bg-white p-5 shadow-xl focus-visible:outline-none sm:max-w-2xl sm:rounded-3xl sm:p-6 lg:max-w-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="import-heading" className="text-lg font-semibold text-stone-900">
              Add clients from a file
            </h2>
            <p className="text-sm text-stone-600">
              {step === "receipt"
                ? "Here's what was added."
                : step === "file"
                  ? "Download the template, fill in your clients, then upload it here."
                  : "Bring your existing client list from Excel or CSV."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={step === "importing"}
            aria-label="Close import dialog"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {step === "file" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-stone-600">
              The easiest way is to download our template, fill in your client details, then upload
              it here. Already have a client list? Upload your CSV or XLSX directly.
            </p>
            <ol className="flex list-none flex-col gap-3 p-0">
              <li className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <span
                    aria-hidden="true"
                    className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-xs font-bold text-white"
                  >
                    1
                  </span>
                  Download the template
                </p>
                <p className="text-sm leading-relaxed text-stone-600">
                  Use our ready-made columns so your clients are added correctly. You can edit it
                  in Excel or Google Sheets.
                </p>
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      variant="primary"
                      onClick={() =>
                        downloadTextFile(TEMPLATE_FILENAME, buildTemplateCsv(), "text/csv")
                      }
                    >
                      <DownloadIcon aria-hidden="true" className="mr-2 h-4 w-4" />
                      Download CSV template
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void (async () => {
                          const buffer = await buildTemplateXlsx();
                          downloadBinaryFile(
                            TEMPLATE_XLSX_FILENAME,
                            buffer,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          );
                        })();
                      }}
                    >
                      <DownloadIcon aria-hidden="true" className="mr-2 h-4 w-4" />
                      Download Excel template
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">
                    Excel includes a “How to Fill” guide sheet; CSV stays machine-clean.
                  </p>
                </div>
              </li>
              <li className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <span
                    aria-hidden="true"
                    className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-xs font-bold text-white"
                  >
                    2
                  </span>
                  Fill your client data
                </p>
                <div className="flex flex-col gap-1 text-sm leading-relaxed text-stone-600">
                  <p>
                    <strong className="font-semibold text-stone-900">Required:</strong> Client Name
                  </p>
                  <p>
                    <strong className="font-semibold text-stone-900">Optional:</strong> Mobile,
                    Investment Type, Amount, Last Invested, Last Contacted, New Client, Note
                  </p>
                  <p className="text-xs">
                    Dates: DD/MM/YYYY · Investment Type: SIP, Lumpsum, Both, Insurance, or Other ·
                    Amount: ₹ number, e.g. 5000 (monthly SIP for SIP) · Notes up to 200 characters ·
                    Blank optional fields are fine.
                  </p>
                </div>
                <details className="rounded-lg border border-stone-200 bg-white">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900">
                    <span>How to fill your template</span>
                    <span aria-hidden="true" className="text-xs text-stone-500">
                      8 fields · Client Name is required
                    </span>
                  </summary>
                  <dl className="flex flex-col gap-2 border-t border-stone-200 px-3 py-3">
                    {IMPORT_GUIDE_ROWS.map((row) => (
                      <div key={row.column} className="flex flex-col gap-0.5">
                        <dt className="text-sm font-semibold text-stone-900">
                          {row.column}{" "}
                          <span className="font-normal text-stone-500">
                            ({row.required === "Yes" ? "required" : "optional"})
                          </span>
                        </dt>
                        <dd className="text-sm leading-relaxed text-stone-600">{row.what}</dd>
                        <dd className="tnum text-xs text-stone-500">Example: {row.example}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </li>
              <li className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <span
                    aria-hidden="true"
                    className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-xs font-bold text-white"
                  >
                    3
                  </span>
                  Upload your completed file
                </p>
                <p className="text-sm leading-relaxed text-stone-600">
                  Upload the template you filled in, or an existing CSV/XLSX client list. Workbooks
                  with multiple sheets let you choose one before importing.
                </p>
                <Field id="import-file" label="Choose a CSV or XLSX file">
                  <input
                    ref={fileInputRef}
                    id="import-file"
                    type="file"
                    accept=".csv,.xlsx"
                    aria-describedby="import-file-hint"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFile(file);
                      e.target.value = "";
                    }}
                    className="block w-full min-h-[44px] rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-800 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                  />
                  <p id="import-file-hint" className="mt-1 text-xs text-stone-500">
                    Up to 5 MB and 500 rows.
                  </p>
                </Field>
              </li>
            </ol>
            <p className="text-xs leading-relaxed text-stone-500">
              Your existing financial software remains your main record — only add the client
              details you need for relationship management. Your file stays on this device while it
              is being prepared; it is never uploaded to MicroNest.
            </p>
            {parsing && (
              <p role="status" className="text-sm text-stone-600">
                Reading file…
              </p>
            )}
            {fileError && (
              <Alert variant="error" title="Couldn't use that file">
                <p className="mt-1 text-xs">{fileError}</p>
              </Alert>
            )}
            {fatal && (
              <Alert variant="error" title="Couldn't identify the columns">
                <p className="mt-1 text-xs">{fatal}</p>
              </Alert>
            )}
          </div>
        )}

        {step === "sheet" && sheet && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-stone-600">
              <strong className="font-semibold text-stone-900">{fileName}</strong> has{" "}
              {sheets.length} sheets. Import one sheet at a time.
            </p>
            <div role="radiogroup" aria-label="Choose a sheet" className="flex flex-col gap-2">
              {sheets.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  role="radio"
                  aria-checked={i === sheetIndex}
                  onClick={() => setSheetIndex(i)}
                  className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 ${
                    i === sheetIndex
                      ? "border-emerald-900 bg-emerald-50 font-semibold text-stone-900"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="tnum shrink-0 text-xs text-stone-500">{s.rows.length} rows</span>
                </button>
              ))}
            </div>
            {fatal && (
              <Alert variant="error" title="Too many rows">
                <p className="mt-1 text-xs">{fatal}</p>
              </Alert>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setStep("file")}>
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setFatal(null);
                  applySheet(sheets, sheetIndex);
                  if (sheets[sheetIndex].rows.length <= MAX_DATA_ROWS) setStep("mapping");
                }}
              >
                Continue with this sheet
              </Button>
            </div>
          </div>
        )}

        {step === "mapping" && sheet && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-600">
              <strong className="font-semibold text-stone-900">{fileName}</strong> ·{" "}
              {sheet.rows.length} rows found. Check each column maps to the right field, or choose
              Don&apos;t import.
            </p>
            <div className="flex flex-col gap-2">
              {sheet.header.map((source, column) => (
                <div
                  key={`${source}-${column}`}
                  className="grid grid-cols-1 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3"
                >
                  <span className="truncate text-sm font-medium text-stone-900" title={source}>
                    {source.trim().length === 0 ? "(blank header)" : source}
                  </span>
                  <span aria-hidden="true" className="hidden text-stone-400 sm:block">
                    →
                  </span>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="sr-only">Map column {source} to</span>
                    <select
                      value={mapping[column] ?? ""}
                      onChange={(e) => updateMapping(column, e.target.value)}
                      className="min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-2 text-sm text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                    >
                      <option value="">Don&apos;t import</option>
                      {RADAR_HEADERS.map((canonical) => (
                        <option
                          key={canonical}
                          value={canonical}
                          disabled={usedCanonicals.has(canonical) && mapping[column] !== canonical}
                        >
                          {canonical}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
            {!nameMapped && (
              <Alert variant="error" title="Client name is required">
                <p className="mt-1 text-xs">
                  Map one column to Client Name — rows without a name can&apos;t be imported.
                </p>
              </Alert>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setStep(sheets.length > 1 ? "sheet" : "file")}>
                Back
              </Button>
              <Button variant="primary" onClick={handlePreview} disabled={!nameMapped}>
                Review {sheet.rows.length} rows
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <PreviewStep
            fileName={fileName}
            total={rows.length}
            ready={ready}
            attention={attention}
            invalid={invalid}
            duplicates={duplicates}
            otherSkipped={otherSkipped}
            blankSkipped={sheet?.blankCount ?? 0}
            rows={rows}
            importableCount={importable.length}
            configured={configured}
            onBack={() => setStep("mapping")}
            onImport={handleImport}
            onDownloadErrors={handleDownloadErrors}
            onRemoveRow={handleRemoveRow}
            onRemoveDuplicates={handleRemoveDuplicates}
          />
        )}

        {step === "importing" && (
          <div className="flex flex-col items-start gap-3 py-6" role="status">
            <p className="text-sm font-medium text-stone-900">
              Adding {progress.done} of {progress.total}…
            </p>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
              role="progressbar"
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-label="Upload progress"
            >
              <div
                className="h-full rounded-full bg-emerald-900 transition-[width]"
                style={{
                  width: progress.total === 0 ? "0%" : `${(progress.done / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {step === "receipt" && receipt && (
          <div className="flex flex-col gap-4">
            <Card padding="compact" className="border-emerald-200 bg-emerald-50">
              <dl className="tnum flex flex-col gap-1 text-sm text-emerald-900">
                <div className="flex justify-between gap-2">
                  <dt>Clients added</dt>
                  <dd className="font-semibold">{receipt.added}</dd>
                </div>
                {receipt.failed > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt>Couldn&apos;t be saved</dt>
                    <dd className="font-semibold">{receipt.failed}</dd>
                  </div>
                )}
                {duplicates > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt>Already in your list</dt>
                    <dd className="font-semibold">{duplicates}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt>Need fixing or not added</dt>
                  <dd className="font-semibold">{receipt.skipped}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-emerald-900/80">
                {fileName} · {receipt.timestamp}
              </p>
              <p className="mt-1 text-xs text-emerald-900/80">
                Nothing already in your clients was overwritten.
              </p>
            </Card>
            {(invalid > 0 || skipped > 0) && (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" onClick={handleDownloadErrors} className="self-start">
                  <DownloadIcon aria-hidden="true" className="mr-2 h-4 w-4" />
                  Download rows to fix
                </Button>
                <ul
                  className="flex max-h-48 flex-col gap-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                  aria-label="Rows to review"
                  tabIndex={0}
                >
                  {rows
                    .filter((r) => r.status === "invalid" || r.status === "skipped")
                    .map((r) => (
                      <li
                        key={r.key}
                        className="flex items-baseline justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-700"
                      >
                        <span className="tnum shrink-0 font-medium">Row {r.line}</span>
                        <span className="min-w-0 flex-1 truncate">{r.reasons.join(" ")}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={handleClose}>
                Add another file
              </Button>
              <Button variant="primary" onClick={handleClose}>
                View clients
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewStep({
  fileName,
  total,
  ready,
  attention,
  invalid,
  duplicates,
  otherSkipped,
  blankSkipped,
  rows,
  importableCount,
  configured,
  onBack,
  onImport,
  onDownloadErrors,
  onRemoveRow,
  onRemoveDuplicates,
}: {
  fileName: string;
  total: number;
  ready: number;
  attention: number;
  invalid: number;
  duplicates: number;
  otherSkipped: number;
  blankSkipped: number;
  rows: PreviewRow[];
  importableCount: number;
  configured: boolean;
  onBack: () => void;
  onImport: () => void;
  onDownloadErrors: () => void;
  onRemoveRow: (key: string) => void;
  onRemoveDuplicates: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-stone-900">Ready to add</p>
        <p
          className="tnum mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600"
          role="status"
        >
          <span>
            <strong className="font-semibold text-stone-900">{total}</strong> rows found
          </span>
          <span>
            <strong className="font-semibold text-emerald-900">{ready}</strong> ready to add
          </span>
          {attention > 0 && (
            <span>
              <strong className="font-semibold text-amber-800">{attention}</strong> need fixing
            </span>
          )}
          {duplicates > 0 && (
            <span>
              <strong className="font-semibold text-stone-900">{duplicates}</strong> already added
            </span>
          )}
          {invalid > 0 && (
            <span>
              <strong className="font-semibold text-red-700">{invalid}</strong> need fixing
            </span>
          )}
          {otherSkipped > 0 && (
            <span>
              <strong className="font-semibold text-stone-900">{otherSkipped}</strong> not added
            </span>
          )}
          {blankSkipped > 0 && (
            <span>
              <strong className="font-semibold text-stone-900">{blankSkipped}</strong> empty rows
            </span>
          )}
        </p>
        <p className="mt-1 truncate text-xs text-stone-500" title={fileName}>
          {fileName}
        </p>
        {duplicates > 0 && (
          <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <p className="text-sm font-semibold text-stone-900">
              {duplicates} already in your list{duplicates === 1 ? "" : "s"} found
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
              These rows are already in your clients or appear more than once in this file. They
              won&apos;t be added, and nothing already in your clients will be overwritten.
            </p>
            <Button variant="secondary" onClick={onRemoveDuplicates} className="mt-2">
              Remove these rows
            </Button>
          </div>
        )}
      </div>

      <ul
        className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        aria-label="Row preview"
        tabIndex={0}
      >
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="tnum text-xs text-stone-500">Row {row.line}</span>
              <span className="truncate text-sm font-semibold text-stone-900">{row.name}</span>
            </span>
            <span className="tnum truncate text-xs text-stone-600">{row.mobile}</span>
            <span className="truncate text-xs text-stone-600">{row.investmentType}</span>
            <span className="flex flex-col items-start gap-1">
              <SignalBadge tone={statusTone(row.status)}>{rowBadgeLabel(row)}</SignalBadge>
              {row.reasons.length > 0 && (
                <span className="text-xs leading-snug text-stone-600">{row.reasons.join(" ")}</span>
              )}
              {row.duplicate && (
                <button
                  type="button"
                  onClick={() => onRemoveRow(row.key)}
                  aria-label={`Remove row ${row.line} from this upload`}
                  className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-stone-700 underline-offset-2 hover:bg-stone-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                >
                  Remove row
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {!configured && (
        <Alert variant="error" title="Sign-in required">
          <p className="mt-1 text-xs">
            Sign in to save imported clients. Your file was read on this device only.
          </p>
        </Alert>
      )}
      <p className="text-xs leading-relaxed text-stone-500">
        Only ready rows and rows to check will be added. Nothing already in your
        clients will be overwritten.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {(invalid > 0 || duplicates > 0 || otherSkipped > 0) && (
          <Button variant="ghost" onClick={onDownloadErrors} className="sm:mr-auto">
            <DownloadIcon aria-hidden="true" className="mr-2 h-4 w-4" />
            Download rows to fix
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onImport}
          disabled={importableCount === 0 || !configured}
        >
          {importableCount === 0 ? "Nothing to add" : `Add ${importableCount} clients`}
        </Button>
      </div>
    </div>
  );
}
