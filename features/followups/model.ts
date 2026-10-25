import type { MessagePurpose } from "../message-studio/templates";
import type { MessageFields } from "../message-studio/templates";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { hashString } from "@/lib/hash";
import { getFollowUpStatus } from "./dates";
import { parseCsv, type ParsedCsv } from "@/lib/csv";
import type { FollowUpRow, ImportReport } from "./types";
import { MAX_DATA_ROWS, validateFileHeaders, validateRow } from "./validation";

/**
 * Small deterministic keyword map from free-text reason to a studio purpose.
 * Deliberately dumb — the MFD edits the resulting message.
 */
export function inferPurpose(reason: string): MessagePurpose {
  const text = reason.toLowerCase();
  if (/(^|\W)(sip|mandate)(\W|$)/.test(text)) return "sip-confirmation";
  if (/(^|\W)(kyc|document|nominee|bank|pan|aadhaar|cheque)(\W|$)/.test(text)) {
    return "document-request";
  }
  if (/(^|\W)(review|meet|meeting)(\W|$)/.test(text)) return "review-invite";
  return "kyc-reminder";
}

export interface StudioHandoff {
  purpose: MessagePurpose;
  fields: Partial<MessageFields>;
  phone: string;
}

/** Builds Message Studio prefill from a row. Studio validation still applies. */
export function buildStudioHandoff(row: FollowUpRow): StudioHandoff {
  const purpose = inferPurpose(row.reason);
  const detail = [row.reason, row.note].filter((part) => part.length > 0).join(" — ");
  const fields: Partial<MessageFields> = { clientName: row.name };
  switch (purpose) {
    case "document-request":
      fields.documents = detail;
      break;
    case "sip-confirmation":
      fields.sipDate = formatDisplayDate(row.date);
      break;
    case "review-invite":
      fields.meetingDate = formatDisplayDate(row.date);
      break;
    case "kyc-reminder":
      fields.action = detail;
      break;
  }
  return { purpose, fields, phone: row.phone };
}

/** Direct WhatsApp text: fixed safe wording, name + reason only. */
export function buildDirectMessage(row: FollowUpRow): string {
  const topic = row.reason.length > 0 ? row.reason : "your investment paperwork";
  return `Hi ${row.name}, following up regarding ${topic}.`;
}

/**
 * Explicit pipeline: records → validate → project → screen → normalize →
 * status → ids → sort → rows. No business rules live in the UI.
 */
export function buildWorkspace(
  parsed: ParsedCsv,
  todayYMD: string = todayLocalYMD(),
): ImportReport {
  const empty: ImportReport = {
    rows: [],
    invalid: [],
    skippedBlank: parsed.blankCount,
    ignoredColumns: [],
    fileError: null,
  };

  const headerCheck = validateFileHeaders(parsed.header);
  if (headerCheck.error || !headerCheck.map) {
    return { ...empty, fileError: headerCheck.error ?? "Invalid file headers." };
  }
  if (parsed.rows.length > MAX_DATA_ROWS) {
    return {
      ...empty,
      ignoredColumns: headerCheck.ignored,
      fileError: `Too many rows (${parsed.rows.length}). Maximum ${MAX_DATA_ROWS} clients per file — split it and upload separately.`,
    };
  }

  const rows: FollowUpRow[] = [];
  const invalid: ImportReport["invalid"] = [];

  for (const record of parsed.rows) {
    const result = validateRow(record.fields, headerCheck.map);
    if (!result.row) {
      invalid.push({ rowNumber: record.line, reason: result.error ?? "Invalid row." });
      continue;
    }
    const { status, daysOverdue } = getFollowUpStatus(result.row.date, todayYMD);
    rows.push({
      id: hashString(`${result.row.name}|${result.row.phone}|${result.row.date}|${record.line}`),
      rowNumber: record.line,
      name: result.row.name,
      phone: result.row.phone,
      phoneValid: result.row.phoneValid,
      date: result.row.date,
      reason: result.row.reason,
      note: result.row.note,
      status,
      daysOverdue,
      done: false,
    });
  }

  if (rows.length === 0) {
    return {
      ...empty,
      invalid,
      ignoredColumns: headerCheck.ignored,
      fileError: "No valid follow-up rows found. Fix the rows listed below and re-upload.",
    };
  }

  // Overdue (most overdue first) → today (file order) → upcoming (earliest first).
  rows.sort((a, b) => {
    const rank = { overdue: 0, today: 1, upcoming: 2 } as const;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === "overdue") return b.daysOverdue - a.daysOverdue || a.rowNumber - b.rowNumber;
    if (a.status === "upcoming")
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.rowNumber - b.rowNumber;
    return a.rowNumber - b.rowNumber;
  });

  return {
    rows,
    invalid,
    skippedBlank: parsed.blankCount,
    ignoredColumns: headerCheck.ignored,
    fileError: null,
  };
}

export function parseAndBuildWorkspace(
  text: string,
  todayYMD: string = todayLocalYMD(),
): ImportReport {
  const parsed = parseCsv(text);
  const base = buildWorkspace(parsed, todayYMD);
  if (parsed.malformed.length === 0) return base;
  // Malformed lines are reported as invalid rows alongside validation errors.
  const malformed = parsed.malformed.map((line) => ({
    rowNumber: line,
    reason: "Could not read this row — check commas and quotes.",
  }));
  return { ...base, invalid: [...malformed, ...base.invalid] };
}
