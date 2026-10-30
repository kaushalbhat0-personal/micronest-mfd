export type Signal = "recent-investor" | "reconnect-due" | "new-client";

/**
 * A client relationship record — not a financial record.
 * Holds identity + two dates + a flag + an optional relationship-context
 * amount (integer paise). Everything else is computed.
 * Lives in React state only. Never persisted, never sent anywhere.
 */
export interface ClientRecord {
  /** Deterministic content-based id (stable across re-sorts within a session). */
  id: string;
  /** 1-based spreadsheet row number (header = row 1) for "where did my client go" answers. */
  rowNumber: number;
  name: string;
  /** Phone digits exactly as typed in the CSV. */
  phone: string;
  /** False when missing or malformed — disables Call/WhatsApp, never drops the record. */
  phoneValid: boolean;
  investmentType: InvestmentType;
  /**
   * Optional relationship-context amount in integer paise (null when unknown).
   * SIP/Both read as monthly; Lumpsum as the recorded amount. Never a
   * valuation, holding, return, or account balance.
   */
  amountPaise: number | null;
  /** Most recent investment date, YYYY-MM-DD or null when unknown. */
  lastInvested: string | null;
  /** Most recent meaningful contact date, YYYY-MM-DD or null when never recorded. */
  lastContacted: string | null;
  /** Explicit CSV flag only — never inferred. */
  isNewClient: boolean;
  note: string;
  signals: Signal[];
}

export type InvestmentType = "SIP" | "Lumpsum" | "Both" | "Insurance" | "Other";

export interface RadarInvalidRow {
  rowNumber: number;
  reason: string;
}

export interface RadarReport {
  records: ClientRecord[];
  invalid: RadarInvalidRow[];
  skippedBlank: number;
  /** Extra CSV columns that were read but never put into the model. */
  ignoredColumns: string[];
  /** File-level rejection message. When set, records is empty. */
  fileError: string | null;
}
