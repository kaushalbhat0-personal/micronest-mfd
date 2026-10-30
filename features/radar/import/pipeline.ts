import { todayLocalYMD } from "@/lib/dates";
import { detectSensitiveInput } from "@/lib/sensitive";
import { RADAR_HEADERS, type RadarHeader } from "@/features/radar/template";
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
  type DuplicateIdentity,
} from "./duplicates";
import type {
  ColumnMapping,
  ImportRow,
  ImportSheet,
  ImportSummary,
  PreviewRow,
} from "./import-types";

let standardMap: RadarHeaderMap | null = null;

/** Canonical-position map for the owned header contract. */
export function standardHeaderMap(): RadarHeaderMap {
  if (!standardMap) {
    const result = validateRadarHeaders([...RADAR_HEADERS]);
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
  todayYMD?: string;
}

export interface PreviewOutput {
  rows: PreviewRow[];
  summary: ImportSummary;
}

/**
 * Builds the user-facing preview: every parsed row becomes ready /
 * attention / invalid / skipped with calm, specific reasons. Validation
 * reuses the exact row validator as manual entry; duplicates never import.
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
    const fields = RADAR_HEADERS.map((canonical) => {
      const column = sourceIndex.get(canonical);
      const raw = column === undefined ? "" : cellToText(row.cells[column] ?? null);
      return coerceFor(canonical, raw);
    });
    const display: Record<string, string> = {};
    RADAR_HEADERS.forEach((canonical, i) => {
      display[canonical] = fields[i];
    });
    return { row, fields, display };
  });

  const identities = candidates.map(({ display }) =>
    identityOf(display["Client Name"], display["Mobile"]),
  );
  // Shared engine with the manual Add guard: book matches win, otherwise
  // the first occurrence in the file wins. Later repeats and book matches
  // never receive persistence input, so they can never overwrite anything.
  const classified = classifyDuplicates(
    identities,
    input.existing,
    candidates.map(({ row }) => row.line),
  );
  const isDuplicate = classified.map((c) => c.duplicate);

  const rows: PreviewRow[] = candidates.map(({ row, fields, display }, i) => {
    const base = {
      key: `row-${row.line}`,
      line: row.line,
      fields: display,
    };
    if (isDuplicate[i]) {
      const hit = classified[i];
      const scope = hit.scope ?? "book";
      const kind = hit.kind ?? (identities[i].mobileKey ? "mobile" : "name");
      return {
        ...base,
        name: display["Client Name"] || "Unnamed row",
        mobile: display["Mobile"] || "—",
        investmentType: display["Investment Type"] || "Other",
        status: "skipped" as const,
        reasons: [duplicateReasonText(scope, kind, hit.firstLine)],
        duplicate: {
          scope,
          matchedBy: kind,
          firstLine: hit.firstLine,
        },
      };
    }
    const sensitive = detectSensitiveInput("Client name", display["Client Name"]);
    if (sensitive) {
      return {
        ...base,
        name: "Unnamed row",
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
        name: display["Client Name"] || "Unnamed row",
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
  let invalid = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status === "ready") ready += 1;
    else if (row.status === "attention") attention += 1;
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
      invalid,
      skipped,
    },
  };
}

/** Counts rows that will actually be created (ready + attention). */
export function importableRows(rows: PreviewRow[]): PreviewRow[] {
  return rows.filter((row) => row.status === "ready" || row.status === "attention");
}

function toClientInput(validated: ValidatedClient): ClientInput {
  return {
    name: validated.name,
    phone: validated.phone,
    investmentType: validated.investmentType,
    amountPaise: validated.amountPaise,
    lastInvested: validated.lastInvested,
    lastContacted: validated.lastContacted,
    isNewClient: validated.isNewClient,
    note: validated.note,
  };
}
