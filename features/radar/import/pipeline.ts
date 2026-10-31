import { todayLocalYMD } from "@/lib/dates";
import { detectSensitiveInput } from "@/lib/sensitive";
import { formatDisplayDate } from "@/lib/dates";
import {
  LEGACY_AMOUNT_HEADER,
  MAPPABLE_HEADERS,
  type RadarHeader,
} from "@/features/radar/template";
import { amountPaiseToInput } from "@/features/radar/template";
import type { ClientInput } from "@/features/radar/repository";
import {
  validateRadarHeaders,
  validateRadarRow,
  type RadarHeaderMap,
  type ValidatedClient,
} from "@/features/radar/validation";
import { cellToText, normalizeImportDate } from "./normalize";
import {
  classifyDuplicates,
  duplicateReasonText,
  identityOf,
  matchExisting,
  type DuplicateIdentity,
} from "./duplicates";
import type {
  BookRecord,
  ColumnMapping,
  ImportRow,
  ImportSheet,
  ImportSummary,
  PreviewRow,
} from "./import-types";

let standardMap: RadarHeaderMap | null = null;

/** Canonical-position map for the owned header contract (incl. legacy Amount). */
export function standardHeaderMap(): RadarHeaderMap {
  if (!standardMap) {
    const result = validateRadarHeaders([...MAPPABLE_HEADERS]);
    if (!result.map) throw new Error("Owned radar headers failed validation.");
    standardMap = result.map;
  }
  return standardMap;
}

function coerceFor(canonical: RadarHeader, raw: string): string {
  if (canonical === "Last Invested" || canonical === "Last Contacted") {
    return normalizeImportDate(raw);
  }
  return raw;
}

export interface PreviewInput {
  sheet: ImportSheet;
  mapping: ColumnMapping;
  existing: DuplicateIdentity[];
  /**
   * Full book records parallel to `existing` (same order). When provided,
   * a book match becomes an update: blank upload cells inherit the stored
   * values, then the normal validator runs once. When absent, book matches
   * keep the legacy skipped behavior so session-only previews never invent
   * updates they cannot persist.
   */
  book?: BookRecord[];
  todayYMD?: string;
}

export interface PreviewOutput {
  rows: PreviewRow[];
  summary: ImportSummary;
}

/**
 * Builds the user-facing preview: every parsed row becomes ready /
 * attention / update / invalid / skipped with calm, specific reasons.
 * Validation reuses the exact row validator as manual entry.
 *
 * Matching (mobile-first, exact normalized name fallback, never fuzzy):
 * - file repeats: first occurrence wins, later repeats are skipped.
 * - book matches: the row becomes an update of the existing record —
 *   the same UUID is kept, only supplied fields change, blank optional
 *   cells inherit the stored values. Never a duplicate, never silent.
 */
export function buildPreview(input: PreviewInput): PreviewOutput {
  const todayYMD = input.todayYMD ?? todayLocalYMD();
  const map = standardHeaderMap();
  const sourceIndex = new Map<RadarHeader, number>();
  input.mapping.forEach((canonical, column) => {
    if (canonical !== null && !sourceIndex.has(canonical)) sourceIndex.set(canonical, column);
  });

  const candidates: Array<{
    row: ImportRow;
    fields: string[];
    display: Record<string, string>;
  }> = input.sheet.rows.map((row) => {
    const fields = MAPPABLE_HEADERS.map((canonical) => {
      const column = sourceIndex.get(canonical);
      const raw = column === undefined ? "" : cellToText(row.cells[column] ?? null);
      return coerceFor(canonical, raw);
    });
    const display: Record<string, string> = {};
    MAPPABLE_HEADERS.forEach((canonical, i) => {
      display[canonical] = fields[i];
    });
    return { row, fields, display };
  });

  const identities = candidates.map(({ display }) =>
    identityOf(display["Client Name"], display["Mobile"]),
  );
  // File-scope repeats only: book matches are handled separately below so
  // they can become updates instead of silent skips. The manual Add guard
  // shares matchExisting (book scope) from the same module so both
  // surfaces keep one matching engine.
  const classified = classifyDuplicates(
    identities,
    [],
    candidates.map(({ row }) => row.line),
  );
  const isFileRepeat = classified.map((c) => c.duplicate);
  const bookHits = identities.map((identity) => matchExisting(identity, input.existing));

  const rows: PreviewRow[] = candidates.map(({ row, fields, display }, i) => {
    const base = {
      key: `row-${row.line}`,
      line: row.line,
      fields: display,
    };
    if (isFileRepeat[i]) {
      const hit = classified[i];
      const kind = hit.kind ?? (identities[i].mobileKey ? "mobile" : "name");
      return {
        ...base,
        name: display["Client Name"] || "Unnamed client",
        mobile: display["Mobile"] || "—",
        investmentType: display["Investment Type"] || "Other",
        status: "skipped" as const,
        reasons: [duplicateReasonText("file", kind, hit.firstLine)],
        duplicate: {
          scope: "file" as const,
          matchedBy: kind,
          firstLine: hit.firstLine,
        },
      };
    }
    const bookHit = bookHits[i];
    const stored = bookHit ? input.book?.[bookHit.index] : undefined;
    if (bookHit && stored) {
      return validateUpdateRow(base, display, map, todayYMD, stored, bookHit.kind);
    }
    if (bookHit && !stored) {
      const kind = bookHit.kind;
      return {
        ...base,
        name: display["Client Name"] || "Unnamed client",
        mobile: display["Mobile"] || "—",
        investmentType: display["Investment Type"] || "Other",
        status: "skipped" as const,
        reasons: [duplicateReasonText("book", kind, null)],
        duplicate: {
          scope: "book" as const,
          matchedBy: kind,
          firstLine: null,
        },
      };
    }
    const sensitive = detectSensitiveInput("Client name", display["Client Name"]);
    if (sensitive) {
      return {
        ...base,
        name: "Unnamed client",
        mobile: display["Mobile"] || "—",
        investmentType: display["Investment Type"] || "Other",
        status: "invalid" as const,
        reasons: ["This row contains information that shouldn't be stored here."],
      };
    }
    const result = validateRadarRow(fields, map, todayYMD);
    if (!result.row) {
      return {
        ...base,
        name: display["Client Name"] || "Unnamed client",
        mobile: display["Mobile"] || "—",
        investmentType: display["Investment Type"] || "Other",
        status: "invalid" as const,
        reasons: [result.error ?? "This row needs attention."],
      };
    }
    if (result.warnings.length > 0) {
      return {
        ...base,
        name: result.row.name,
        mobile: result.row.phone || "—",
        investmentType: result.row.investmentType,
        status: "attention" as const,
        reasons: result.warnings,
        input: toClientInput(result.row),
      };
    }
    return {
      ...base,
      name: result.row.name,
      mobile: result.row.phone || "—",
      investmentType: result.row.investmentType,
      status: "ready" as const,
      reasons: [],
      input: toClientInput(result.row),
    };
  });

  for (const line of input.sheet.malformed) {
    rows.push({
      key: `malformed-${line}`,
      line,
      name: "Unreadable row",
      mobile: "—",
      investmentType: "—",
      status: "skipped" as const,
      reasons: ["This line couldn't be read (check quotes and commas)."],
      fields: {},
    });
  }
  rows.sort((a, b) => a.line - b.line);

  let ready = 0;
  let attention = 0;
  let updated = 0;
  let invalid = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status === "ready") ready += 1;
    else if (row.status === "attention") attention += 1;
    else if (row.status === "update") updated += 1;
    else if (row.status === "invalid") invalid += 1;
    else skipped += 1;
  }

  return {
    rows,
    summary: {
      fileName: "",
      sheetName: null,
      totalRows: rows.length,
      ready,
      attention,
      updated,
      invalid,
      skipped,
    },
  };
}

/**
 * Prefills blank optional cells of an update row from the stored record,
 * then runs the exact same validator as new rows. Conversions mirror the
 * export format (rupee text, DD/MM/YYYY, Y/blank) so a prefilled row
 * re-validates to identical values. Supplied cells always win; blank cells
 * preserve the stored values — an empty spreadsheet cell can never wipe
 * existing data.
 */
function prefillUpdateDisplay(
  display: Record<string, string>,
  stored: BookRecord,
): Record<string, string> {
  const filled = { ...display };
  const blank = (key: string): boolean => (filled[key] ?? "").trim().length === 0;
  if (blank("Mobile")) filled["Mobile"] = stored.phone;
  if (blank("Investment Type")) filled["Investment Type"] = stored.investmentType;
  if (blank("SIP Amount") && blank(LEGACY_AMOUNT_HEADER)) {
    filled["SIP Amount"] =
      stored.sipAmountPaise === null ? "" : amountPaiseToInput(stored.sipAmountPaise);
  }
  if (blank("Lumpsum Amount") && blank(LEGACY_AMOUNT_HEADER)) {
    filled["Lumpsum Amount"] =
      stored.lumpsumAmountPaise === null ? "" : amountPaiseToInput(stored.lumpsumAmountPaise);
  }
  if (blank("Last Invested")) {
    filled["Last Invested"] = stored.lastInvested ? formatDisplayDate(stored.lastInvested) : "";
  }
  if (blank("Last Contacted")) {
    filled["Last Contacted"] = stored.lastContacted
      ? formatDisplayDate(stored.lastContacted)
      : "";
  }
  if (blank("Note")) filled["Note"] = stored.note;
  return filled;
}

function validateUpdateRow(
  base: { key: string; line: number; fields: Record<string, string> },
  display: Record<string, string>,
  map: RadarHeaderMap,
  todayYMD: string,
  stored: BookRecord,
  matchedBy: "mobile" | "name",
): PreviewRow {
  const filled = prefillUpdateDisplay(display, stored);
  const sensitive = detectSensitiveInput("Client name", filled["Client Name"]);
  if (sensitive) {
    return {
      ...base,
      name: "Unnamed client",
      mobile: filled["Mobile"] || "—",
      investmentType: filled["Investment Type"] || "Other",
      status: "invalid" as const,
      reasons: ["This row contains information that shouldn't be stored here."],
    };
  }
  // Canonical positional shape (same as new rows): one cell per
  // canonical header, so the shared validator (including legacy Amount
  // directing) runs unchanged. The mapping already landed in `filled`.
  const fields = MAPPABLE_HEADERS.map((canonical) => filled[canonical] ?? "");
  const result = validateRadarRow(fields, map, todayYMD);
  if (!result.row) {
    return {
      ...base,
      name: filled["Client Name"] || "Unnamed client",
      mobile: filled["Mobile"] || "—",
      investmentType: filled["Investment Type"] || "Other",
      status: "invalid" as const,
      reasons: [result.error ?? "This row needs attention."],
    };
  }
  const via = matchedBy === "mobile" ? "Matched by mobile number." : "Matched by client name.";
  return {
    ...base,
    name: result.row.name,
    mobile: result.row.phone || "—",
    investmentType: result.row.investmentType,
    status: "update" as const,
    reasons: [`Will update the existing client. ${via}`, ...result.warnings],
    input: toClientInput(result.row),
    match: { existingId: stored.id, matchedBy },
  };
}

/** Counts rows that will actually be written (new inserts + book updates). */
export function importableRows(rows: PreviewRow[]): PreviewRow[] {
  return rows.filter(
    (row) => row.status === "ready" || row.status === "attention" || row.status === "update",
  );
}

function toClientInput(validated: ValidatedClient): ClientInput {
  return {
    name: validated.name,
    phone: validated.phone,
    investmentType: validated.investmentType,
    sipAmountPaise: validated.sipAmountPaise,
    lumpsumAmountPaise: validated.lumpsumAmountPaise,
    lastInvested: validated.lastInvested,
    lastContacted: validated.lastContacted,
    note: validated.note,
  };
}
