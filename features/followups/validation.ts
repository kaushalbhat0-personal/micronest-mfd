import { normalizePhone } from "@/lib/whatsapp";
import { detectSensitiveInput } from "@/lib/sensitive";
import { normalizeFollowUpDate } from "@/lib/dates";
import { normalizeHeader } from "@/lib/csv";
import { isValidClientId } from "@/lib/workspace/params";
import { REQUIRED_HEADERS, TEMPLATE_HEADERS, type TemplateHeader } from "./template";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_DATA_ROWS = 500;

export const MAX_NAME_LENGTH = 60;
export const MAX_REASON_LENGTH = 40;
export const MAX_NOTE_LENGTH = 200;

export type HeaderMap = Record<TemplateHeader, number>;

export interface HeaderValidation {
  map: HeaderMap | null;
  ignored: string[];
  error: string | null;
}

/**
 * Matches CSV headers against the owned template contract.
 * Order-independent. Extra columns are ignored (and reported).
 * No aliases, no fuzzy matching — the user downloaded our template.
 */
export function validateFileHeaders(header: string[]): HeaderValidation {
  if (header.length === 0) {
    return { map: null, ignored: [], error: "The file appears to be empty." };
  }
  const normalized = header.map(normalizeHeader);
  const map = {} as HeaderMap;
  const used = new Set<number>();

  for (const canonical of TEMPLATE_HEADERS) {
    const matches: number[] = [];
    normalized.forEach((h, i) => {
      if (h === canonical.toLowerCase()) matches.push(i);
    });
    if (matches.length > 1) {
      return {
        map: null,
        ignored: [],
        error: `Column "${canonical}" appears ${matches.length} times. Keep it exactly once.`,
      };
    }
    map[canonical] = matches.length === 1 ? matches[0] : -1;
    if (matches.length === 1) used.add(matches[0]);
  }

  for (const required of REQUIRED_HEADERS) {
    if (map[required] === -1) {
      return {
        map: null,
        ignored: [],
        error: `Missing required column "${required}". Download the template and keep all five headers.`,
      };
    }
  }

  const ignored = header.filter((h, i) => !used.has(i) && h.trim().length > 0);
  return { map, ignored, error: null };
}

export interface ValidatedRow {
  name: string;
  phone: string;
  phoneValid: boolean;
  phoneWarning: boolean;
  date: string;
  reason: string;
  note: string;
}

export interface RowValidation {
  row: ValidatedRow | null;
  error: string | null;
  warning: string | null;
}

/** Validates one data record. Phone problems warn; everything else rejects the row. */
export function validateRow(fields: string[], map: HeaderMap): RowValidation {
  const pick = (key: TemplateHeader): string => {
    const index = map[key];
    if (index === -1) return "";
    return (fields[index] ?? "").trim();
  };

  const name = pick("Client Name");
  if (name.length === 0) return { row: null, error: "Client name is missing.", warning: null };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      row: null,
      error: `Client name must be under ${MAX_NAME_LENGTH} characters.`,
      warning: null,
    };
  }

  const rawDate = pick("Next Follow-up");
  if (rawDate.length === 0) {
    return {
      row: null,
      error: "Next follow-up date is missing (use DD/MM/YYYY).",
      warning: null,
    };
  }
  const date = normalizeFollowUpDate(rawDate);
  if (!date) {
    const shown = rawDate.length > 30 ? `${rawDate.slice(0, 30)}…` : rawDate;
    return {
      row: null,
      error: `Next follow-up date "${shown}" is not a valid DD/MM/YYYY date.`,
      warning: null,
    };
  }

  const reason = pick("Reason");
  if (reason.length > MAX_REASON_LENGTH) {
    return {
      row: null,
      error: `Reason must be under ${MAX_REASON_LENGTH} characters.`,
      warning: null,
    };
  }
  const note = pick("Note");
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      row: null,
      error: `Note must be under ${MAX_NOTE_LENGTH} characters.`,
      warning: null,
    };
  }

  for (const [field, value] of [
    ["Reason", reason],
    ["Note", note],
  ] as const) {
    if (value && detectSensitiveInput(field, value)) {
      return {
        row: null,
        error: `${field} looks like sensitive information — remove it and re-upload.`,
        warning: null,
      };
    }
  }

  const phone = pick("Mobile");
  let phoneValid = false;
  let warning: string | null = null;
  if (phone.length > 0) {
    if (normalizePhone(phone).ok) {
      phoneValid = true;
    } else {
      warning = "Phone number needs checking — WhatsApp is disabled for this row.";
    }
  }

  return {
    row: { name, phone, phoneValid, phoneWarning: warning !== null, date, reason, note },
    error: null,
    warning,
  };
}

/** File-level guards: extension and size. Content checks happen after parsing. */
export function validateFileMeta(fileName: string, fileSize: number): string | null {
  if (!fileName.toLowerCase().endsWith(".csv")) {
    return "Please upload a .csv file. Download the template to get the right format.";
  }
  if (fileSize > MAX_FILE_BYTES) {
    return "This file is larger than 2 MB. Split it into smaller files and upload separately.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Interactive follow-up validation (RCCF-MFD-22, C1). Unlike the CSV path
// above — which must tolerate historical rows from an export — interactive
// creation rejects past dates: a follow-up due yesterday created today is
// nonsense. Due dates arrive as YYYY-MM-DD from native date inputs.
// ---------------------------------------------------------------------------

/** Raw interactive input before validation. Dates are YYYY-MM-DD or empty. */
export interface FollowupFieldInput {
  clientId: string;
  dueDate: string;
  reason: string;
  note: string;
}

export interface ValidatedFollowup {
  clientId: string;
  dueDate: string;
  reason: string;
  note: string;
}

export interface FollowupValidation {
  row: ValidatedFollowup | null;
  error: string | null;
}

export type FollowupFieldName = "clientId" | "dueDate" | "reason" | "note";

/**
 * Presentation mapping only — rule ownership stays in validateFollowupInput.
 * Mirrors fieldForClientError so form error associations stay consistent.
 */
export function fieldForFollowupError(error: string | null): FollowupFieldName | null {
  if (!error) return null;
  if (error.startsWith("Client") || error.startsWith("Please choose a")) return "clientId";
  if (
    error.startsWith("Due date") ||
    error.startsWith("Please choose when") ||
    error.startsWith("Please choose today") ||
    error.startsWith("That date")
  )
    return "dueDate";
  if (error.startsWith("Reason") || error.startsWith("Please say why")) return "reason";
  if (error.startsWith("Note")) return "note";
  return null;
}

/**
 * Strict YYYY-MM-DD → YYYY-MM-DD. Rejects wrong shapes and impossible dates
 * (2026-02-30). Never guesses — null means invalid.
 */
function parseDueDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Single source of truth for interactive Add Follow-up input. */
export function validateFollowupInput(
  input: FollowupFieldInput,
  todayYMD: string,
): FollowupValidation {
  const clientId = input.clientId.trim();
  if (clientId.length === 0) return { row: null, error: "Please choose a client." };
  if (!isValidClientId(clientId)) return { row: null, error: "Please choose a valid client." };

  const rawDue = input.dueDate.trim();
  if (rawDue.length === 0) return { row: null, error: "Please choose when to follow up." };
  const dueDate = parseDueDate(rawDue);
  if (!dueDate) {
    const shown = rawDue.length > 30 ? `${rawDue.slice(0, 30)}…` : rawDue;
    return { row: null, error: `That date doesn't look right — please use YYYY-MM-DD (got "${shown}").` };
  }
  if (dueDate < todayYMD) {
    return { row: null, error: "Please choose today or a future date." };
  }

  const reason = input.reason.trim();
  if (reason.length === 0) return { row: null, error: "Please say why you're following up." };
  if (reason.length > MAX_REASON_LENGTH) {
    return {
      row: null,
      error: `Reason must be under ${MAX_REASON_LENGTH} characters.`,
    };
  }
  if (detectSensitiveInput("Reason", reason)) {
    return {
      row: null,
      error: "Reason looks like sensitive information — please remove it.",
    };
  }

  const note = input.note.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      row: null,
      error: `Note must be under ${MAX_NOTE_LENGTH} characters.`,
    };
  }
  if (note && detectSensitiveInput("Note", note)) {
    return {
      row: null,
      error: "Note looks like sensitive information — please remove it.",
    };
  }

  return { row: { clientId, dueDate, reason, note }, error: null };
}
