import { Alert } from "@/components/ui/alert";
import type { ImportReport } from "../types";

interface ImportResultProps {
  fileName: string;
  report: ImportReport;
}

/** Import receipt: counts first, then exactly which rows were skipped and why. */
export function ImportResult({ fileName, report }: ImportResultProps) {
  const skipped = report.invalid.length;
  const warnings = report.rows.filter((r) => r.phone && !r.phoneValid).length;

  return (
    <section aria-label="Import result" aria-live="polite" className="flex flex-col gap-3">
      <Alert
        variant={report.rows.length > 0 ? "warning" : "error"}
        title={
          report.rows.length > 0
            ? `Imported ${report.rows.length} follow-up${report.rows.length === 1 ? "" : "s"} from ${fileName}`
            : `Could not import ${fileName}`
        }
      >
        <ul className="mt-1 space-y-0.5 text-xs">
          {skipped > 0 && (
            <li>
              Skipped: {skipped} row{skipped === 1 ? "" : "s"}
            </li>
          )}
          {warnings > 0 && (
            <li>
              Warnings: {warnings} phone number{warnings === 1 ? "" : "s"} need
              {warnings === 1 ? "s" : ""} checking
            </li>
          )}
          {report.skippedBlank > 0 && (
            <li>
              Ignored {report.skippedBlank} blank line{report.skippedBlank === 1 ? "" : "s"}
            </li>
          )}
          {report.ignoredColumns.length > 0 && (
            <li>Ignored columns: {report.ignoredColumns.join(", ")}</li>
          )}
        </ul>
      </Alert>

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
  );
}
