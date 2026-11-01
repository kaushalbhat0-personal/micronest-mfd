import { GENERAL_TEMPLATE_HEADERS, RADAR_HEADERS } from "@/features/radar/template";
import type { PreviewRow } from "./import-types";
import { isNative } from "@/lib/native/runtime";

/** Blank canonical template — no example rows, so nothing imports by accident. */
export function buildTemplateCsv(): string {
  return `${[...RADAR_HEADERS].join(",")}\n`;
}

/** Download filename for the canonical blank template. */
export const TEMPLATE_FILENAME = "micronest-mfd-client-template.csv";

/** Blank generic template — no example rows, so nothing imports by accident. */
export function buildGeneralTemplateCsv(): string {
  return `${[...GENERAL_TEMPLATE_HEADERS].join(",")}\n`;
}

/** Download filename for the generic blank template. */
export const GENERAL_TEMPLATE_FILENAME = "micronest-general-client-template.csv";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Which template family produced the rows — decides the error-CSV schema. */
export type ErrorCsvKind = "generic" | "mfd";

/**
 * Generic error-CSV columns: the generic template headers (presentation)
 * each mapped to the canonical field their values live under. "Phone" reads
 * from Mobile and "Last Activity" from Last Invested — same stored data,
 * generic labels.
 */
const GENERIC_ERROR_COLUMNS: ReadonlyArray<{ header: string; key: string }> = [
  { header: "Client Name", key: "Client Name" },
  { header: "Phone", key: "Mobile" },
  { header: "Last Activity", key: "Last Invested" },
  { header: "Last Contacted", key: "Last Contacted" },
  { header: "Note", key: "Note" },
];

/**
 * Local error export: original mapped values plus the reason, so the user
 * can fix their spreadsheet. Generic sources export the generic schema;
 * MFD sources keep the full canonical schema. Generated in the browser;
 * never uploaded.
 */
export function buildErrorCsv(rows: PreviewRow[], kind: ErrorCsvKind = "mfd"): string {
  const columns: ReadonlyArray<{ header: string; key: string }> =
    kind === "generic"
      ? GENERIC_ERROR_COLUMNS
      : RADAR_HEADERS.map((header) => ({ header, key: header }));
  const headers = [...columns.map((c) => c.header), "Issue"];
  const lines = rows
    .filter((row) => row.status === "invalid" || row.status === "skipped")
    .map((row) => {
      const cells = columns.map((c) => escapeCsvCell(row.fields[c.key] ?? ""));
      cells.push(escapeCsvCell(row.reasons.join(" ")));
      return cells.join(",");
    });
  return `${headers.join(",")}\n${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}

/** Browser download transport. Used on web and as the native fallback. */
function browserDownloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Native-aware download for locally generated text content.
 * Web: normal browser download (unchanged). Native: Filesystem cache +
 * Share sheet via downloadFileNativeAware (lib/native/files.ts).
 * Content is identical either way.
 */
export async function downloadTextFile(
  fileName: string,
  content: string,
  mimeType: string,
): Promise<void> {
  if (isNative()) {
    try {
      const { downloadFileNativeAware } = await import("@/lib/native/files");
      await downloadFileNativeAware(fileName, content, mimeType, () =>
        browserDownloadTextFile(fileName, content, mimeType),
      );
      return;
    } catch {
      // Fall through to the browser transport below.
    }
  }
  browserDownloadTextFile(fileName, content, mimeType);
}
