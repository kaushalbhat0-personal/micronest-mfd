import { RADAR_HEADERS } from "@/features/radar/template";
import type { PreviewRow } from "./import-types";

/** Blank canonical template — no example rows, so nothing imports by accident. */
export function buildTemplateCsv(): string {
  return `${[...RADAR_HEADERS].join(",")}\n`;
}

/** Download filename for the canonical blank template. */
export const TEMPLATE_FILENAME = "micronest-mfd-client-template.csv";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Local error export: original mapped values plus the reason, so the MFD
 * can fix their spreadsheet. Generated in the browser; never uploaded.
 */
export function buildErrorCsv(rows: PreviewRow[]): string {
  const headers = [...RADAR_HEADERS, "Issue"];
  const lines = rows
    .filter((row) => row.status === "invalid" || row.status === "skipped")
    .map((row) => {
      const cells = RADAR_HEADERS.map((header) => escapeCsvCell(row.fields[header] ?? ""));
      cells.push(escapeCsvCell(row.reasons.join(" ")));
      return cells.join(",");
    });
  return `${headers.join(",")}\n${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}

/** Triggers a browser download for locally generated text content. */
export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
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
