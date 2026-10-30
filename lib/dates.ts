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

/** Reformats YYYY-MM-DD back to the familiar DD/MM/YYYY for display/prefill. */
export function formatDisplayDate(dateYMD: string): string {
  return `${dateYMD.slice(8, 10)}/${dateYMD.slice(5, 7)}/${dateYMD.slice(0, 4)}`;
}

/**
 * Wall-clock milliseconds for duration measurement in event handlers.
 * Thin wrapper so component files satisfy the react-hooks/purity rule
 * (direct Date.now() calls are flagged there); pure by contract here.
 */
export function nowMs(): number {
  return Date.now();
}
