import type { ClientInput } from "@/features/radar/repository";
import type { RadarHeader } from "@/features/radar/template";

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

export type RowStatus = "ready" | "attention" | "invalid" | "skipped";

export interface PreviewRow {
  key: string;
  line: number;
  name: string;
  mobile: string;
  investmentType: string;
  status: RowStatus;
  /** Human reasons, never echoing sensitive values. */
  reasons: string[];
  /** Validated persistence input for ready/attention rows; absent otherwise. */
  input?: ClientInput;
  /** Original mapped field values for the error-CSV export. */
  fields: Record<string, string>;
}

export interface ImportSummary {
  fileName: string;
  sheetName: string | null;
  totalRows: number;
  ready: number;
  attention: number;
  invalid: number;
  skipped: number;
}
