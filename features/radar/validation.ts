import { normalizePhone } from "@/lib/whatsapp";
import { detectSensitiveInput } from "@/lib/sensitive";
import { normalizeFollowUpDate } from "@/lib/dates";
import { normalizeHeader } from "@/lib/csv";
import { RADAR_HEADERS, RADAR_REQUIRED_HEADERS, type RadarHeader } from "./template";
import { normalizeInvestmentType, parseNewClientFlag } from "./template";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_DATA_ROWS = 500;

export const MAX_NAME_LENGTH = 60;
export const MAX_NOTE_LENGTH = 200;

export type RadarHeaderMap = Record<RadarHeader, number>;

export interface RadarHeaderValidation {
  map: RadarHeaderMap | null;
  ignored: string[];
  error: string | null;
}

/**
 * Matches CSV headers against the owned radar contract.
 * Order-independent. Extra columns are ignored (and reported).
 * No aliases, no fuzzy matching — the user downloads our template.
 */
export function validateRadarHeaders(header: string[]): RadarHeaderValidation {
  if (header.length === 0) {
    return { map: null, ignored: [], error: "The file appears to be empty." };
  }
  const normalized = header.map(normalizeHeader);
  const map = {} as RadarHeaderMap;
  const used = new Set<number>();

  for (const canonical of RADAR_HEADERS) {
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

  for (const required of RADAR_REQUIRED_HEADERS) {
    if (map[required] === -1) {
      return {
        map: null,
        ignored: [],
        error: `Missing required column "${required}". Download the template and keep all seven headers.`,
      };
    }
  }

  const ignored = header.filter((h, i) => !used.has(i) && h.trim().length > 0);
  return { map, ignored, error: null };
}

export interface ValidatedClient {
  name: string;
  phone: string;
  phoneValid: boolean;
  phoneWarning: boolean;
  investmentType: import("./types").InvestmentType;
  investmentWarning: string | null;
  lastInvested: string | null;
  lastContacted: string | null;
  isNewClient: boolean;
  newClientWarning: string | null;
  note: string;
}

export interface RadarRowValidation {
  row: ValidatedClient | null;
  error: string | null;
  warnings: string[];
}

/**
 * Raw client field values before validation. Dates are display strings
 * (DD/MM/YYYY) or empty; the New Client flag is already an explicit boolean.
 * Both the CSV pipeline and the Add/Edit form build this shape, so the rules
 * below run exactly once.
 */
export interface ClientFieldInput {
  name: string;
  phone: string;
  investmentType: string;
  lastInvested: string;
  lastContacted: string;
  isNewClient: boolean;
  note: string;
}

export type ClientInputContext = "csv" | "form";

/**
 * Form field that produced a validator error. Presentation mapping only —
 * rule ownership stays in validateClientFields. Covered by unit tests
 * alongside the validator so message drift breaks loudly.
 */
export type ClientFieldName =
  "name" | "phone" | "investmentType" | "lastInvested" | "lastContacted" | "isNewClient" | "note";

export function fieldForClientError(error: string | null): ClientFieldName | null {
  if (!error) return null;
  if (error.startsWith("Client name")) return "name";
  if (error.startsWith("Last Invested")) return "lastInvested";
  if (error.startsWith("Last Contacted")) return "lastContacted";
  if (error.startsWith("Note")) return "note";
  return null;
}

/** Single source of truth for the seven relationship fields. */
export function validateClientFields(
  input: ClientFieldInput,
  todayYMD: string,
  context: ClientInputContext = "csv",
): RadarRowValidation {
  const name = input.name.trim();
  if (name.length === 0) return { row: null, error: "Client name is missing.", warnings: [] };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      row: null,
      error: `Client name must be under ${MAX_NAME_LENGTH} characters.`,
      warnings: [],
    };
  }

  const investment = normalizeInvestmentType(input.investmentType);
  const isNewClient = input.isNewClient;

  const lastInvested = parseOptionalDate(input.lastInvested, "Last Invested", todayYMD);
  if (lastInvested.error) return { row: null, error: lastInvested.error, warnings: [] };
  const lastContacted = parseOptionalDate(input.lastContacted, "Last Contacted", todayYMD);
  if (lastContacted.error) return { row: null, error: lastContacted.error, warnings: [] };

  const note = input.note.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      row: null,
      error: `Note must be under ${MAX_NOTE_LENGTH} characters.`,
      warnings: [],
    };
  }
  if (note && detectSensitiveInput("Note", note)) {
    return {
      row: null,
      error:
        context === "form"
          ? "Note looks like sensitive information — please remove it."
          : "Note looks like sensitive information — remove it and re-upload.",
      warnings: [],
    };
  }

  const phone = input.phone.trim();
  let phoneValid = false;
  const warnings: string[] = [];
  if (phone.length > 0) {
    if (normalizePhone(phone).ok) {
      phoneValid = true;
    } else {
      warnings.push("Phone number needs checking — Call and WhatsApp are disabled for this row.");
    }
  }
  if (investment.warning) warnings.push(investment.warning);

  return {
    row: {
      name,
      phone,
      phoneValid,
      phoneWarning: warnings.some((w) => w.startsWith("Phone number")),
      investmentType: investment.value,
      investmentWarning: investment.warning,
      lastInvested: lastInvested.date,
      lastContacted: lastContacted.date,
      isNewClient,
      newClientWarning: null,
      note,
    },
    error: null,
    warnings,
  };
}

/** Validates one data record. Phone/type/flag problems warn; the rest rejects the row. */
export function validateRadarRow(
  fields: string[],
  map: RadarHeaderMap,
  todayYMD: string,
): RadarRowValidation {
  const pick = (key: RadarHeader): string => {
    const index = map[key];
    if (index === -1) return "";
    return (fields[index] ?? "").trim();
  };

  // CSV-only concern: the free-text flag column. The form owns a real checkbox.
  const flag = parseNewClientFlag(pick("New Client"));
  const result = validateClientFields(
    {
      name: pick("Client Name"),
      phone: pick("Mobile"),
      investmentType: pick("Investment Type"),
      lastInvested: pick("Last Invested"),
      lastContacted: pick("Last Contacted"),
      isNewClient: flag.value,
      note: pick("Note"),
    },
    todayYMD,
    "csv",
  );
  if (!result.row) return result;
  const warnings = [...result.warnings];
  if (flag.warning) warnings.push(flag.warning);
  return {
    row: { ...result.row, newClientWarning: flag.warning },
    error: null,
    warnings,
  };
}

function parseOptionalDate(
  raw: string,
  label: string,
  todayYMD: string,
): { date: string | null; error: string | null } {
  if (raw.length === 0) return { date: null, error: null };
  const date = normalizeFollowUpDate(raw);
  if (!date) {
    const shown = raw.length > 30 ? `${raw.slice(0, 30)}…` : raw;
    return { date: null, error: `${label} "${shown}" is not a valid DD/MM/YYYY date.` };
  }
  if (date > todayYMD) {
    return { date: null, error: `${label} "${raw.trim()}" is in the future.` };
  }
  return { date, error: null };
}

/** File-level guards: extension and size. Content checks happen after parsing. */
export function validateRadarFileMeta(fileName: string, fileSize: number): string | null {
  if (!/\.csv$|\.xlsx$/i.test(fileName)) {
    return "Please upload a .csv or .xlsx file. Download the template to get the right format.";
  }
  if (fileSize > MAX_FILE_BYTES) {
    return "This file is larger than 5 MB. Split it into smaller files and upload separately.";
  }
  return null;
}
