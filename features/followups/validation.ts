import { normalizePhone } from "@/lib/whatsapp";
import { detectSensitiveInput } from "@/lib/sensitive";
import { normalizeFollowUpDate } from "@/lib/dates";
import { normalizeHeader } from "@/lib/csv";
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
