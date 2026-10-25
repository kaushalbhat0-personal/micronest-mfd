export type FollowUpStatus = "overdue" | "today" | "upcoming";

/**
 * A follow-up action record — not a client record.
 * Lives in React state only. Never persisted, never sent anywhere.
 */
export interface FollowUpRow {
  /** Deterministic content-based id (stable across re-sorts within a session). */
  id: string;
  /** 1-based spreadsheet row number (header = row 1) for "where did my client go" answers. */
  rowNumber: number;
  name: string;
  /** Phone digits exactly as typed in the CSV. */
  phone: string;
  /** False when missing or malformed — disables WhatsApp, never drops the row. */
  phoneValid: boolean;
  /** Normalized follow-up date, always YYYY-MM-DD. */
  date: string;
  reason: string;
  note: string;
  status: FollowUpStatus;
  daysOverdue: number;
  done: boolean;
}

export interface InvalidRow {
  rowNumber: number;
  reason: string;
}

export interface ImportReport {
  rows: FollowUpRow[];
  invalid: InvalidRow[];
  skippedBlank: number;
  /** Extra CSV columns that were read but never put into the model. */
  ignoredColumns: string[];
  /** File-level rejection message. When set, rows is empty. */
  fileError: string | null;
}
