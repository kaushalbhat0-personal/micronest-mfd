import type { ClientInput } from "@/features/radar/repository";
import type { InvestmentType } from "@/features/radar/types";
import type { RadarHeader } from "@/features/radar/template";
import type { DuplicateMatchKind, DuplicateScope } from "./duplicates";

/** Raw cell as read from CSV (always text) or XLSX (typed cells). */
export type CellValue = string | number | boolean | null;

/** One data record with its 1-based source line for error reporting. */
export interface ImportRow {
  line: number;
  cells: CellValue[];
}

/** One sheet of a parsed workbook. CSV files always yield a single sheet. */
export interface ImportSheet {
  name: string;
  header: string[];
  rows: ImportRow[];
  blankCount: number;
  /** 1-based lines rejected for unbalanced quotes (CSV only). */
  malformed: number[];
}

/** Source column → canonical MicroNest field, or null for "Don't import". */
export type ColumnMapping = Array<RadarHeader | null>;

export type RowStatus = "ready" | "attention" | "update" | "invalid" | "skipped";

export interface PreviewRow {
  key: string;
  line: number;
  name: string;
  mobile: string;
  investmentType: string;
  status: RowStatus;
  /** Human reasons, never echoing sensitive values. */
  reasons: string[];
  /** Validated persistence input for ready/attention/update rows; absent otherwise. */
  input?: ClientInput;
  /**
   * Present on update rows (book match): which existing record to update
   * and on what basis. Importable rows never carry `duplicate`; skipped
   * file repeats never carry `input` — so an import can never create a
   * second record for the same client.
   */
  match?: {
    existingId: string;
    matchedBy: DuplicateMatchKind;
  };
  /**
   * Present on skipped file-repeat rows: where the match came from.
   * Update rows never carry it.
   */
  duplicate?: {
    scope: DuplicateScope;
    matchedBy: DuplicateMatchKind;
    /** 1-based source line of the kept occurrence (file scope only). */
    firstLine?: number | null;
  };
  /** Original mapped field values for the error-CSV export. */
  fields: Record<string, string>;
}

/** Minimal stored-record shape the upsert prefill needs. Both the
 * persistence records and the domain records satisfy it structurally. */
export interface BookRecord {
  id: string;
  name: string;
  phone: string;
  investmentType: InvestmentType;
  sipAmountPaise: number | null;
  lumpsumAmountPaise: number | null;
  lastInvested: string | null;
  lastContacted: string | null;
  isNewClient: boolean;
  note: string;
}

export interface ImportSummary {
  fileName: string;
  sheetName: string | null;
  totalRows: number;
  ready: number;
  attention: number;
  updated: number;
  invalid: number;
  skipped: number;
}
