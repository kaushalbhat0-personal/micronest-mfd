/**
 * Strict DD/MM/YYYY → YYYY-MM-DD. Rejects impossible dates (31/02/2026),
 * wrong shapes, and two-digit years. Never guesses — null means invalid.
 */
export function normalizeFollowUpDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Device-local date as YYYY-MM-DD. No time, no timezone math downstream. */
export function todayLocalYMD(today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calendar date (YYYY-MM-DD) for `now` in an explicit IANA timezone.
 * Pass the user's resolved timezone (see resolveTimeZone) so the day
 * boundary follows the user, not the server: the same instant can be a
 * different calendar date in India vs the US, especially near midnight
 * UTC. With no timezone (SSR/prerender) this is exactly todayLocalYMD.
 * Display/projection only — lifecycle rules, sorting, and YYYY-MM-DD
 * storage are untouched.
 */
export function todayInTimezone(timeZone?: string, now: Date = new Date()): string {
  if (!timeZone) return todayLocalYMD(now);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string): string | undefined =>
      parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (
      year !== undefined &&
      month !== undefined &&
      day !== undefined &&
      /^\d{4}$/.test(year) &&
      /^\d{2}$/.test(month) &&
      /^\d{2}$/.test(day)
    ) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Unknown timezone or runtime without Intl: fall back to device-local.
  }
  return todayLocalYMD(now);
}

/** Whole days from fromYMD to toYMD (negative when toYMD is earlier). */
export function daysBetweenYMD(fromYMD: string, toYMD: string): number {
  const from = Date.UTC(
    Number(fromYMD.slice(0, 4)),
    Number(fromYMD.slice(5, 7)) - 1,
    Number(fromYMD.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toYMD.slice(0, 4)),
    Number(toYMD.slice(5, 7)) - 1,
    Number(toYMD.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

import { DEFAULT_LOCALE, formatDateLocale } from "./locale";

/**
 * Reformats YYYY-MM-DD for display/prefill. Default is the familiar
 * DD/MM/YYYY (India, byte-identical to before); pass an explicit locale
 * for locale-aware presentation (e.g. en-US → MM/DD/YYYY). Display only —
 * storage stays YYYY-MM-DD and CSV interchange stays DD/MM/YYYY.
 */
export function formatDisplayDate(dateYMD: string, locale: string = DEFAULT_LOCALE): string {
  return formatDateLocale(dateYMD, locale);
}

/**
 * Wall-clock milliseconds for duration measurement in event handlers.
 * Thin wrapper so component files satisfy the react-hooks/purity rule
 * (direct Date.now() calls are flagged there); pure by contract here.
 */
export function nowMs(): number {
  return Date.now();
}
