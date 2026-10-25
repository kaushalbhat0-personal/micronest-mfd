import type { FollowUpStatus } from "./types";

export interface FollowUpStatusResult {
  status: FollowUpStatus;
  daysOverdue: number;
}

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
 * Date-only comparison — lexicographic on YYYY-MM-DD, chronological by
 * construction. Timezones cannot affect the result.
 */
export function getFollowUpStatus(dateYMD: string, todayYMD: string): FollowUpStatusResult {
  if (dateYMD < todayYMD) {
    const ms = Date.UTC(
      Number(todayYMD.slice(0, 4)),
      Number(todayYMD.slice(5, 7)) - 1,
      Number(todayYMD.slice(8, 10)),
    );
    const then = Date.UTC(
      Number(dateYMD.slice(0, 4)),
      Number(dateYMD.slice(5, 7)) - 1,
      Number(dateYMD.slice(8, 10)),
    );
    return { status: "overdue", daysOverdue: Math.round((ms - then) / 86_400_000) };
  }
  if (dateYMD === todayYMD) return { status: "today", daysOverdue: 0 };
  return { status: "upcoming", daysOverdue: 0 };
}
