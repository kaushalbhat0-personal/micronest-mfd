export type FollowUpStatus = "overdue" | "today" | "upcoming";

/**
 * A follow-up action record from the legacy CSV workspace — not a client record.
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

// ---------------------------------------------------------------------------
// Persistent follow-ups (RCCF-MFD-22, C1). The CSV types above describe the
// retired import path; the types below describe the live database-backed
// domain. Status is derived, never stored; completed rows carry no status.
// ---------------------------------------------------------------------------

/** Row shape as persisted in client_followups (no derived data, no user_id). */
export interface StoredFollowup {
  id: string;
  clientId: string;
  /** Due date, always YYYY-MM-DD. Calendar date, no time, no timezone. */
  dueDate: string;
  reason: string;
  note: string;
  /** ISO timestamptz when completed, null while open. */
  completedAt: string | null;
  createdAt: string;
}

/** Normalized input for creating a follow-up. No id, no user_id, no timestamps. */
export interface FollowupInput {
  clientId: string;
  /** YYYY-MM-DD, must be today or later at creation. */
  dueDate: string;
  reason: string;
  note: string;
}

/**
 * Domain record for rendering: an OPEN stored follow-up plus derived status
 * and client display fields joined at read time (never stored, never sent
 * to the repository). Completed rows are never projected — they carry no
 * active status by design.
 */
export interface FollowupRecord extends StoredFollowup {
  status: FollowUpStatus;
  daysOverdue: number;
  clientName: string;
  clientPhone: string;
  clientPhoneValid: boolean;
}
