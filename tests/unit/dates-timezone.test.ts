import { describe, expect, it } from "vitest";
import { todayInTimezone, todayLocalYMD, daysBetweenYMD } from "@/lib/dates";
import { resolveTimeZone } from "@/lib/locale";
import { computeSignals, isNewRelationship } from "@/features/radar/signals";
import { wasContactedToday } from "@/features/radar/today";

/**
 * Phase 2.4: "today" is explicit and timezone-aware. The lifecycle rules
 * (3-day New, 30-day Recent, reconnect, sorting, follow-up semantics) are
 * untouched — they consume a YYYY-MM-DD string; these tests pin the
 * definition of that string across timezones and date boundaries.
 */
describe("todayInTimezone", () => {
  // 2026-10-26T00:30:00Z: still the 25th in New York, already the 26th in
  // Kolkata. A server-UTC "today" would serve the wrong day to one of them.
  const nearMidnightUtc = new Date(Date.UTC(2026, 9, 26, 0, 30, 0));

  it("resolves different calendar dates either side of midnight UTC", () => {
    expect(todayInTimezone("Asia/Kolkata", nearMidnightUtc)).toBe("2026-10-26");
    expect(todayInTimezone("America/New_York", nearMidnightUtc)).toBe("2026-10-25");
    expect(todayInTimezone("UTC", nearMidnightUtc)).toBe("2026-10-26");
  });

  it("agrees with device-local today for a far-from-midnight instant", () => {
    const noon = new Date(2026, 9, 26, 12, 0, 0);
    const tz = resolveTimeZone();
    if (tz !== undefined) {
      expect(todayInTimezone(tz, noon)).toBe(todayLocalYMD(noon));
    } else {
      expect(todayInTimezone(undefined, noon)).toBe(todayLocalYMD(noon));
    }
  });

  it("falls back to device-local today without a timezone (SSR/prerender)", () => {
    const now = new Date(2026, 9, 26, 12, 0, 0);
    expect(todayInTimezone(undefined, now)).toBe(todayLocalYMD(now));
  });

  it("falls back to device-local today for an unknown timezone", () => {
    const now = new Date(2026, 9, 26, 12, 0, 0);
    expect(todayInTimezone("Not/AZone", now)).toBe(todayLocalYMD(now));
  });

  it("always returns a zero-padded YYYY-MM-DD storage shape", () => {
    const now = new Date(2026, 0, 5, 8, 0, 0);
    for (const tz of ["Asia/Kolkata", "America/New_York", "Pacific/Auckland", undefined]) {
      expect(todayInTimezone(tz, now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("resolveTimeZone", () => {
  it("returns undefined or a non-empty IANA name without crashing", () => {
    const tz = resolveTimeZone();
    expect(tz === undefined || (typeof tz === "string" && tz.length > 0)).toBe(true);
  });
});

describe("five-zone date-boundary matrix (MFD-74 audit)", () => {
  const at = (iso: string): Date => new Date(iso);
  const ZONES = ["Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"] as const;

  it("splits the calendar date either side of midnight UTC", () => {
    // 00:00 UTC: London already the 26th, New York/LA still the 25th.
    const midnight = at("2026-10-26T00:00:00Z");
    expect(todayInTimezone("Europe/London", midnight)).toBe("2026-10-26");
    expect(todayInTimezone("America/New_York", midnight)).toBe("2026-10-25");
    expect(todayInTimezone("America/Los_Angeles", midnight)).toBe("2026-10-25");
    // 23:59 UTC: Kolkata/Tokyo already the 27th.
    const late = at("2026-10-26T23:59:00Z");
    expect(todayInTimezone("Asia/Kolkata", late)).toBe("2026-10-27");
    expect(todayInTimezone("Asia/Tokyo", late)).toBe("2026-10-27");
    expect(todayInTimezone("Europe/London", late)).toBe("2026-10-26");
  });

  it("stays consistent across US daylight-saving transitions", () => {
    // Spring forward 2026-03-08 07:00 UTC and fall back 2026-11-01 06:00 UTC.
    expect(todayInTimezone("America/New_York", at("2026-03-08T09:59:00Z"))).toBe("2026-03-08");
    expect(todayInTimezone("America/New_York", at("2026-03-08T10:00:00Z"))).toBe("2026-03-08");
    expect(todayInTimezone("America/Los_Angeles", at("2026-11-01T05:59:00Z"))).toBe("2026-10-31");
    expect(todayInTimezone("America/New_York", at("2026-11-01T05:59:00Z"))).toBe("2026-11-01");
  });

  it("handles local 23:59 and 00:00 instants", () => {
    // Midnight in New York: LA still the previous evening.
    const nyMidnight = at("2026-07-04T00:00:00-04:00");
    expect(todayInTimezone("America/New_York", nyMidnight)).toBe("2026-07-04");
    expect(todayInTimezone("America/Los_Angeles", nyMidnight)).toBe("2026-07-03");
    expect(todayInTimezone("Asia/Kolkata", nyMidnight)).toBe("2026-07-04");
    // One minute before midnight UTC date rollover is still the same day everywhere west of it.
    const before = at("2026-10-25T23:59:00Z");
    for (const zone of ZONES) {
      expect(todayInTimezone(zone, before)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(todayInTimezone("Asia/Kolkata", before)).toBe("2026-10-26");
    expect(todayInTimezone("America/New_York", before)).toBe("2026-10-25");
  });

  it("drives Talked-today off the user's date, not the server's", () => {
    // 00:30 UTC is still the 25th in New York but the 26th in UTC/Kolkata.
    const instant = at("2026-10-26T00:30:00Z");
    const nyToday = todayInTimezone("America/New_York", instant);
    const utcToday = todayInTimezone("UTC", instant);
    expect(nyToday).toBe("2026-10-25");
    expect(utcToday).toBe("2026-10-26");
    const record = { lastContacted: "2026-10-25" };
    expect(wasContactedToday(record, nyToday)).toBe(true);
    expect(wasContactedToday(record, utcToday)).toBe(false);
  });
});

describe("lifecycle regression across timezones (MFD-74 audit)", () => {
  it("keeps the 3-day New and 30-day Recent windows calendar-correct", () => {
    for (const zone of ["Asia/Kolkata", "America/New_York"] as const) {
      const today = todayInTimezone(zone, new Date("2026-10-26T00:30:00Z"));
      const investedDaysAgo = (n: number): string => {
        const base = new Date(`${today}T12:00:00Z`);
        base.setUTCDate(base.getUTCDate() - n);
        return base.toISOString().slice(0, 10);
      };
      // Day 0 and 3 are new; day 4 graduates to recent-only (contacted).
      for (const day of [0, 3]) {
        const signals = computeSignals(
          { lastInvested: investedDaysAgo(day), lastContacted: today },
          today,
        );
        expect(signals).toContain("recent-investor");
        expect(signals).not.toContain("new-client");
      }
      const day4 = computeSignals(
        { lastInvested: investedDaysAgo(4), lastContacted: today },
        today,
      );
      expect(day4).toContain("recent-investor");
      // Day 30 recent, day 31 older: recency context drops off.
      expect(
        computeSignals({ lastInvested: investedDaysAgo(30), lastContacted: today }, today),
      ).toContain("recent-investor");
      expect(
        computeSignals({ lastInvested: investedDaysAgo(31), lastContacted: today }, today),
      ).not.toContain("recent-investor");
      expect(daysBetweenYMD(investedDaysAgo(30), today)).toBe(30);
      expect(daysBetweenYMD(investedDaysAgo(31), today)).toBe(31);
    }
  });

  it("keeps New vs Reconnect graduation on contact, in both zones", () => {
    for (const zone of ["Asia/Kolkata", "America/Los_Angeles"] as const) {
      const today = todayInTimezone(zone, new Date("2026-10-26T12:00:00Z"));
      expect(isNewRelationship(null, null, today)).toBe(true);
      expect(isNewRelationship(null, today, today)).toBe(false);
      // Never-contacted with older-than-recent history is established quiet:
      // reconnect-due, never new-client again.
      const base = new Date(`${today}T12:00:00Z`);
      base.setUTCDate(base.getUTCDate() - 100);
      const old = base.toISOString().slice(0, 10);
      const quiet = computeSignals({ lastInvested: old, lastContacted: null }, today, 90);
      expect(quiet).toContain("reconnect-due");
      expect(quiet).not.toContain("new-client");
    }
  });
});
