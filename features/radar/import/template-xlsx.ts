import { GENERAL_TEMPLATE_HEADERS, RADAR_HEADERS } from "@/features/radar/template";

export const TEMPLATE_XLSX_FILENAME = "micronest-mfd-client-template.xlsx";

/** Download filename for the generic blank XLSX template. */
export const GENERAL_TEMPLATE_XLSX_FILENAME = "micronest-general-client-template.xlsx";

/** Sheet holding the import-ready header row. No prose, no sample rows. */
export const CLIENTS_SHEET_NAME = "Clients";

/** Human-readable filling guide. Never imported as data. */
export const GUIDE_SHEET_NAME = "How to Fill";

export interface GuideRow {
  column: string;
  required: string;
  what: string;
  example: string;
}

/**
 * Canonical filling guide. Shared by the downloadable XLSX
 * "How to Fill" sheet and the in-app expandable guide, so the two can
 * never disagree. Amount semantics: SIP Amount is the monthly SIP figure,
 * Lumpsum Amount the recorded lumpsum figure; Both clients may fill both
 * independently. Older files with a single Amount column still import:
 * it reads as the monthly figure for SIP, the recorded figure for Lumpsum
 * and Other, and the monthly figure for Both (add a Lumpsum Amount column
 * for the second figure — it is never duplicated). Relationship context
 * only — never portfolio value, AUM, or returns.
 */
export const IMPORT_GUIDE_ROWS: GuideRow[] = [
  {
    column: "Client Name",
    required: "Yes",
    what: "Client's full name (max 60 characters).",
    example: "Rahul Sharma",
  },
  {
    column: "Mobile",
    required: "No",
    what: "Client's phone number with country code (e.g. +91 9876543210 for India). Blank is fine.",
    example: "+91 9876543210",
  },
  {
    column: "Investment Type",
    required: "No",
    what: "One of SIP, Lumpsum, Both, Insurance, or Other. Blank means Other.",
    example: "Both",
  },
  {
    column: "SIP Amount",
    required: "No",
    what: "Monthly SIP amount in ₹ (e.g. 10000). Fill for SIP and Both clients. Blank is fine.",
    example: "10000",
  },
  {
    column: "Lumpsum Amount",
    required: "No",
    what: "Recorded lumpsum amount in ₹ (e.g. 200000). Fill for Lumpsum and Both clients. Blank is fine.",
    example: "200000",
  },
  {
    column: "Last Invested",
    required: "No",
    what: "Date of the latest investment, as DD/MM/YYYY. Blank is fine.",
    example: "25/10/2026",
  },
  {
    column: "Last Contacted",
    required: "No",
    what: "Date you last spoke with the client, as DD/MM/YYYY. Blank means never contacted. Whether a client counts as New is calculated from this and Last Invested — no manual flag needed.",
    example: "20/10/2026",
  },
  {
    column: "Note",
    required: "No",
    what: "Short note, max 200 characters. Blank is fine.",
    example: "Interested in ELSS",
  },
];

const GUIDE_NOTES: string[] = [
  "Dates: day/month/year (DD/MM/YYYY), e.g. 25/10/2026. DD-MM-YYYY and YYYY-MM-DD uploads also work; ambiguous numeric dates always read day-first.",
  "Investment Type accepts SIP, Lumpsum, Both, Insurance, or Other — anything else imports as Other with a warning.",
  "SIP Amount and Lumpsum Amount are optional relationship context, not portfolio value, AUM, holdings, returns, or profit. Your financial software remains the system of record.",
  "Re-uploading the same file updates matching clients instead of adding duplicates: matching clients keep their record and only the filled-in fields change. Blank cells never erase existing details.",
  "Older files with a single Amount column still work: it reads as the monthly figure for SIP, the recorded figure for Lumpsum, and the monthly figure for Both (never doubled — add a Lumpsum Amount column for the second figure).",
  "Only the Clients sheet is imported. If your file has several sheets, pick Clients when uploading.",
];

/**
 * Generic-first filling guide (Phase 2/3): only the five generic columns.
 * Neutral examples — no region-specific names, numbers, or product terms.
 * The MFD guide above stays untouched for the MFD template.
 */
export const GENERAL_GUIDE_ROWS: GuideRow[] = [
  {
    column: "Client Name",
    required: "Yes",
    what: "Client's full name (max 60 characters).",
    example: "Alex Morgan",
  },
  {
    column: "Phone",
    required: "No",
    what: "Phone number including country code (e.g. +44 7911 123456). Blank is fine.",
    example: "+44 7911 123456",
  },
  {
    column: "Last Activity",
    required: "No",
    what: "Date of the client's most recent meaningful activity or interaction, as day/month/year (DD/MM/YYYY). Blank is fine.",
    example: "20/10/2026",
  },
  {
    column: "Last Contacted",
    required: "No",
    what: "Date you last contacted or spoke with the client, as day/month/year (DD/MM/YYYY). Blank means never contacted.",
    example: "20/10/2026",
  },
  {
    column: "Note",
    required: "No",
    what: "Short note, max 200 characters. Blank is fine.",
    example: "Prefers morning calls",
  },
];

const GENERAL_GUIDE_NOTES: string[] = [
  "Dates are read day-first. For example, 20/10/2026 means 20 October 2026. YYYY-MM-DD also works. Ambiguous numeric dates always read day-first — a month-first date like 10/20/2026 is not read as October.",
  "Phone: include the country code for international numbers, e.g. +44 7911 123456, +1 555 123 4567, +61 412 345 678, +91 9876543210. A plain 10-digit Indian mobile may be entered without +91. If a number can't be recognised we flag it as Check now — the client still imports, but Call and WhatsApp may not work until it's corrected.",
  "Re-uploading the same file updates matching clients instead of adding duplicates: matching clients are updated only with the fields you filled in. Blank cells never erase existing details.",
  "Only the Clients sheet is imported. If your file has several sheets, pick Clients when uploading.",
  "Need investment fields (SIP, Lumpsum, Investment Type)? Use the MFD clients template instead.",
];

/**
 * Builds the generic two-sheet template workbook in the browser, mirroring
 * buildTemplateXlsx. Same on-demand xlsx load, same browser-only download.
 */
export async function buildGeneralTemplateXlsx(): Promise<ArrayBuffer> {
  const { utils, write } = await import("xlsx");
  const workbook = utils.book_new();

  const clientsGrid: string[][] = [[...GENERAL_TEMPLATE_HEADERS]];
  const clientsSheet = utils.aoa_to_sheet(clientsGrid);
  clientsSheet["!cols"] = GENERAL_TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(header.length + 4, 14),
  }));
  utils.book_append_sheet(workbook, clientsSheet, CLIENTS_SHEET_NAME);

  const guideGrid: string[][] = [
    ["Column", "Required?", "What to enter", "Example"],
    ...GENERAL_GUIDE_ROWS.map((row) => [row.column, row.required, row.what, row.example]),
    [],
    ...GENERAL_GUIDE_NOTES.map((note) => [note, "", "", ""]),
  ];
  const guideSheet = utils.aoa_to_sheet(guideGrid);
  guideSheet["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 80 }, { wch: 20 }];
  utils.book_append_sheet(workbook, guideSheet, GUIDE_SHEET_NAME);

  const output = write(workbook, { type: "array", bookType: "xlsx" });
  return output instanceof ArrayBuffer ? output : (new Uint8Array(output).buffer as ArrayBuffer);
}

/**
 * Builds the two-sheet template workbook in the browser. The Clients sheet
 * carries only the canonical header row (safe to fill and upload); the
 * How to Fill sheet carries the guide above. The xlsx dependency loads on
 * demand so the main bundle never carries it. Nothing is uploaded.
 */
export async function buildTemplateXlsx(): Promise<ArrayBuffer> {
  const { utils, write } = await import("xlsx");
  const workbook = utils.book_new();

  const clientsGrid: string[][] = [[...RADAR_HEADERS]];
  const clientsSheet = utils.aoa_to_sheet(clientsGrid);
  clientsSheet["!cols"] = RADAR_HEADERS.map((header) => ({ wch: Math.max(header.length + 4, 14) }));
  utils.book_append_sheet(workbook, clientsSheet, CLIENTS_SHEET_NAME);

  const guideGrid: string[][] = [
    ["Column", "Required?", "What to enter", "Example"],
    ...IMPORT_GUIDE_ROWS.map((row) => [row.column, row.required, row.what, row.example]),
    [],
    ...GUIDE_NOTES.map((note) => [note, "", "", ""]),
  ];
  const guideSheet = utils.aoa_to_sheet(guideGrid);
  guideSheet["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 80 }, { wch: 20 }];
  utils.book_append_sheet(workbook, guideSheet, GUIDE_SHEET_NAME);

  const output = write(workbook, { type: "array", bookType: "xlsx" });
  return output instanceof ArrayBuffer ? output : (new Uint8Array(output).buffer as ArrayBuffer);
}

/** Triggers a browser download for locally generated binary content. */
export function downloadBinaryFile(fileName: string, content: ArrayBuffer, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
