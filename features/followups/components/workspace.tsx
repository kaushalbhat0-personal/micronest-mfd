"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageStudioForm } from "@/features/message-studio/components/message-studio-form";
import { parseAndBuildWorkspace, buildStudioHandoff } from "../model";
import type { FollowUpRow, ImportReport } from "../types";
import type { FollowUpFilter } from "./status-chips";
import { EmptyState } from "./empty-state";
import { FollowUpCard } from "./followup-card";
import { ImportPicker } from "./import-picker";
import { ImportResult } from "./import-result";
import { StatusChips } from "./status-chips";
import { TemplateDownload } from "./template-download";

const EMPTY_COUNTS = { overdue: 0, today: 0, upcoming: 0 };

/**
 * Follow-up Workspace: import → triage → message → done.
 * All state is session-local. Reload or re-import discards everything.
 */
export function Workspace() {
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<FollowUpFilter>("attention");
  const [doneIds, setDoneIds] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<FollowUpRow | null>(null);

  function reset() {
    setFileName(null);
    setReport(null);
    setFileError(null);
    setFilter("attention");
    setDoneIds(new Set());
    setSelected(null);
  }

  function handleFileText(name: string, text: string) {
    setFileError(null);
    setSelected(null);
    setFilter("attention");
    setDoneIds(new Set());
    setFileName(name);
    setReport(parseAndBuildWorkspace(text));
  }

  const rows = React.useMemo(() => {
    if (!report) return [];
    return report.rows.map((row) => (doneIds.has(row.id) ? { ...row, done: true } : row));
  }, [report, doneIds]);

  const counts = React.useMemo(() => {
    const next = { ...EMPTY_COUNTS };
    for (const row of rows) {
      if (!row.done) next[row.status] += 1;
    }
    return next;
  }, [rows]);

  const visible = rows.filter((row) => {
    if (filter === "attention")
      return !row.done && (row.status === "overdue" || row.status === "today");
    if (filter === "overdue" || filter === "today" || filter === "upcoming") {
      return row.status === filter && !row.done;
    }
    return false;
  });
  // Done rows stay visible (collapsed) in their filter so Undo is reachable.
  const doneVisible = rows.filter(
    (row) =>
      row.done && (filter === "attention" ? row.status !== "upcoming" : row.status === filter),
  );

  // Message view: prefilled studio for one row. Back returns with state intact.
  if (selected) {
    const handoff = buildStudioHandoff(selected);
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button variant="ghost" onClick={() => setSelected(null)}>
            ← Back to follow-ups
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
      {!report && (
        <Card>
          <div className="flex flex-col gap-4">
            <TemplateDownload />
            <div className="border-t border-stone-200 pt-4">
              <ImportPicker
                onFileText={handleFileText}
                onFileError={(message) => {
                  setReport(null);
                  setFileName(null);
                  setFileError(message);
                }}
              />
            </div>
            {fileError && (
              <Alert variant="error" title="Could not import file">
                <p className="mt-1 text-xs">{fileError}</p>
              </Alert>
            )}
          </div>
        </Card>
      )}

      {report && (
        <>
          <ImportResult fileName={fileName ?? "file"} report={report} />

          {report.rows.length > 0 && (
            <>
              <StatusChips counts={counts} value={filter} onChange={setFilter} />

              {filter === "attention" && counts.overdue + counts.today === 0 && (
                <EmptyState title="You're all caught up. 🎉" hint="Nothing overdue or due today." />
              )}
              {filter === "overdue" && counts.overdue === 0 && (
                <EmptyState title="Nothing overdue. 🎉" />
              )}
              {filter === "today" && counts.today === 0 && (
                <EmptyState title="No follow-ups for today." />
              )}
              {filter === "upcoming" && counts.upcoming === 0 && (
                <EmptyState title="Nothing upcoming." />
              )}

              <div className="flex flex-col gap-3" aria-live="polite">
                {visible.map((row) => (
                  <FollowUpCard
                    key={row.id}
                    row={row}
                    onMessage={setSelected}
                    onDone={(id) => setDoneIds((prev) => new Set(prev).add(id))}
                    onUndo={(id) =>
                      setDoneIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      })
                    }
                  />
                ))}
                {doneVisible.map((row) => (
                  <FollowUpCard
                    key={row.id}
                    row={row}
                    onMessage={setSelected}
                    onDone={(id) => setDoneIds((prev) => new Set(prev).add(id))}
                    onUndo={(id) =>
                      setDoneIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>

              <Button variant="secondary" onClick={reset}>
                Upload a different file
              </Button>
            </>
          )}

          {report.fileError && (
            <Alert variant="error" title="Import needs attention">
              <p className="mt-1 text-xs">{report.fileError}</p>
            </Alert>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        Privacy: your file never leaves this device. Nothing is saved — reloading clears everything.
        Do not include PAN, Aadhaar, bank, OTP or password details in your CSV.
      </p>
    </div>
  );
}
