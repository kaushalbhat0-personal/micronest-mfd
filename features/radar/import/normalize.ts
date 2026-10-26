import type { CellValue } from "./import-types";

/**
 * Import date normalization (RCCF-MFD-44). Accepts the representations an
 * MFD spreadsheet plausibly holds and returns a DD/MM/YYYY display string
 * for the shared strict validator — which still rejects impossible and
 * future dates downstream. Anything unrecognized passes through as text so
 * the validator reports it instead of this module guessing.
 *
 * Ambiguous numeric dates (01/02/2026) read as DD/MM/YYYY (India-first);
 * the import UI documents this.
 */

const DISPLAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DASHED_DMY = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Excel serial range 1970-01-01 .. 2100-12-31; outside is not a date. */
const MIN_SERIAL = 25569;
const MAX_SERIAL = 73050;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function fromSerial(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < MIN_SERIAL || whole > MAX_SERIAL) return null;
  const ms = Date.UTC(1899, 11, 30) + whole * 86_400_000;
  const date = new Date(ms);
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function fromDateObject(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Raw cell → DD/MM/YYYY display text (or "" for blank). */
export function normalizeImportDate(value: CellValue | Date): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "";
  if (typeof value === "number") {
    const serial = fromSerial(value);
    return serial ?? String(value);
  }
  if (value instanceof Date) {
    return fromDateObject(value) ?? "";
  }
  const text = value.trim();
  if (text.length === 0) return "";
  const dashed = text.match(DASHED_DMY);
  if (dashed) return `${dashed[1]}/${dashed[2]}/${dashed[3]}`;
  const iso = text.match(ISO);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const display = text.match(DISPLAY);
  if (display) return `${display[1]}/${display[2]}/${display[3]}`;
  const numeric = Number(text);
  if (text !== "" && Number.isFinite(numeric) && !/[^0-9.]/.test(text)) {
    const serial = fromSerial(numeric);
    if (serial) return serial;
  }
  return text;
}

/** Plain string coercion for non-date columns. */
export function cellToText(value: CellValue): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return value.trim();
}
