import type { MessageFields, MessagePurpose } from "../message-studio/templates";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import { hashString } from "@/lib/hash";
import { parseCsv, type ParsedCsv } from "@/lib/csv";
import { computeSignals, DEFAULT_RECONNECT_INTERVAL_DAYS, sortRadarRecords } from "./signals";
import type { ClientRecord, RadarReport } from "./types";
import { amountPaiseToInput, RADAR_HEADERS } from "./template";
import { MAX_DATA_ROWS, validateRadarHeaders, validateRadarRow } from "./validation";

/**
 * Explicit pipeline: records → validate → project → screen → normalize →
 * signals → ids → sort → records. No business rules live in the UI.
 * No dedupe: every valid row is preserved with a stable id.
 */
export function buildRadarReport(
  parsed: ParsedCsv,
  todayYMD: string = todayLocalYMD(),
  reconnectIntervalDays: number = DEFAULT_RECONNECT_INTERVAL_DAYS,
): RadarReport {
  const empty: RadarReport = {
    records: [],
    invalid: [],
    skippedBlank: parsed.blankCount,
    ignoredColumns: [],
    fileError: null,
  };

  const headerCheck = validateRadarHeaders(parsed.header);
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

  const records: ClientRecord[] = [];
  const invalid: RadarReport["invalid"] = [];

  for (const record of parsed.rows) {
    const result = validateRadarRow(record.fields, headerCheck.map, todayYMD);
    if (!result.row) {
      invalid.push({ rowNumber: record.line, reason: result.error ?? "Invalid row." });
      continue;
    }
    const input = {
      lastInvested: result.row.lastInvested,
      lastContacted: result.row.lastContacted,
      isNewClient: result.row.isNewClient,
    };
    records.push({
      id: hashString(
        `${result.row.name}|${result.row.phone}|${result.row.lastInvested ?? ""}|${result.row.lastContacted ?? ""}|${record.line}`,
      ),
      rowNumber: record.line,
      name: result.row.name,
      phone: result.row.phone,
      phoneValid: result.row.phoneValid,
      investmentType: result.row.investmentType,
      amountPaise: result.row.amountPaise,
      lastInvested: result.row.lastInvested,
      lastContacted: result.row.lastContacted,
      isNewClient: result.row.isNewClient,
      note: result.row.note,
      signals: computeSignals(input, todayYMD, reconnectIntervalDays),
    });
  }

  if (records.length === 0) {
    return {
      ...empty,
      invalid,
      ignoredColumns: headerCheck.ignored,
      fileError: "No valid client rows found. Fix the rows listed below and re-upload.",
    };
  }

  return {
    records: sortRadarRecords(records, todayYMD),
    invalid,
    skippedBlank: parsed.blankCount,
    ignoredColumns: headerCheck.ignored,
    fileError: null,
  };
}

export function parseAndBuildRadar(
  text: string,
  todayYMD: string = todayLocalYMD(),
  reconnectIntervalDays: number = DEFAULT_RECONNECT_INTERVAL_DAYS,
): RadarReport {
  const parsed = parseCsv(text);
  const base = buildRadarReport(parsed, todayYMD, reconnectIntervalDays);
  if (parsed.malformed.length === 0) return base;
  const malformed = parsed.malformed.map((line) => ({
    rowNumber: line,
    reason: "Could not read this row — check commas and quotes.",
  }));
  return { ...base, invalid: [...malformed, ...base.invalid] };
}

/**
 * Pure Mark Contacted transition: sets Last Contacted to today and
 * recomputes signals. The MFD asserts the contact occurred — nothing here
 * claims a call was detected. Session update only; no persistence.
 */
export function markContacted(
  record: ClientRecord,
  todayYMD: string,
  reconnectIntervalDays: number = DEFAULT_RECONNECT_INTERVAL_DAYS,
): ClientRecord {
  const lastContacted = todayYMD;
  const signals = computeSignals(
    { lastInvested: record.lastInvested, lastContacted, isNewClient: record.isNewClient },
    todayYMD,
    reconnectIntervalDays,
  );
  return { ...record, lastContacted, signals };
}

export interface RadarStudioHandoff {
  purpose: MessagePurpose;
  fields: Partial<MessageFields>;
  phone: string;
}

/** Small deterministic mapping from radar context to a studio starting point. */
export function inferRadarPurpose(
  record: Pick<ClientRecord, "investmentType" | "signals">,
): MessagePurpose {
  const sipLike = record.investmentType === "SIP" || record.investmentType === "Both";
  if (record.signals.includes("recent-investor") && sipLike) return "sip-confirmation";
  if (record.signals.includes("reconnect-due")) return "review-invite";
  return "kyc-reminder";
}

/** Builds Message Studio prefill from a radar record. Studio validation still applies. */
export function buildRadarHandoff(record: ClientRecord): RadarStudioHandoff {
  const purpose = inferRadarPurpose(record);
  const fields: Partial<MessageFields> = { clientName: record.name };
  if (purpose === "sip-confirmation" && record.lastInvested) {
    fields.sipDate = formatDisplayDate(record.lastInvested);
  }
  if (purpose === "kyc-reminder" && record.note.length > 0) {
    fields.action = record.note;
  }
  return { purpose, fields, phone: record.phone };
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serializes records back to the owned template format for the CSV
 * round-trip (Download updated CSV). Invariant: re-importing the output
 * yields the same normalized values — not byte-identical input.
 */
export function serializeRadarCsv(records: ClientRecord[]): string {
  const header = [...RADAR_HEADERS].join(",");
  const lines = records.map((r) =>
    [
      r.name,
      r.phone,
      r.investmentType,
      r.amountPaise === null ? "" : amountPaiseToInput(r.amountPaise),
      r.lastInvested ? formatDisplayDate(r.lastInvested) : "",
      r.lastContacted ? formatDisplayDate(r.lastContacted) : "",
      r.isNewClient ? "Y" : "",
      r.note,
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
