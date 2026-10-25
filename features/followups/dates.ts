import type { FollowUpStatus } from "./types";

export interface FollowUpStatusResult {
  status: FollowUpStatus;
  daysOverdue: number;
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
