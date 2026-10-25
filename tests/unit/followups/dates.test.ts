import { describe, expect, it } from "vitest";
import { getFollowUpStatus } from "@/features/followups/dates";
import { normalizeFollowUpDate, todayLocalYMD } from "@/lib/dates";

describe("normalizeFollowUpDate", () => {
  it("accepts DD/MM/YYYY and normalizes to ISO", () => {
    expect(normalizeFollowUpDate("25/10/2026")).toBe("2026-10-25");
    expect(normalizeFollowUpDate("5/1/2026")).toBe("2026-01-05");
    expect(normalizeFollowUpDate(" 25/10/2026 ")).toBe("2026-10-25");
  });

  it("rejects impossible and malformed dates", () => {
    expect(normalizeFollowUpDate("31/02/2026")).toBeNull();
    expect(normalizeFollowUpDate("29/02/2023")).toBeNull();
    expect(normalizeFollowUpDate("25/13/2026")).toBeNull();
    expect(normalizeFollowUpDate("25/10/26")).toBeNull();
    expect(normalizeFollowUpDate("2026-10-25")).toBeNull();
    expect(normalizeFollowUpDate("25-10-2026")).toBeNull();
    expect(normalizeFollowUpDate("not a date")).toBeNull();
    expect(normalizeFollowUpDate("")).toBeNull();
  });

  it("accepts leap day in leap years", () => {
    expect(normalizeFollowUpDate("29/02/2024")).toBe("2024-02-29");
  });
});

describe("getFollowUpStatus", () => {
  it("classifies overdue, today, upcoming deterministically", () => {
    expect(getFollowUpStatus("2026-10-24", "2026-10-25")).toEqual({
      status: "overdue",
      daysOverdue: 1,
    });
    expect(getFollowUpStatus("2026-10-25", "2026-10-25")).toEqual({
      status: "today",
      daysOverdue: 0,
    });
    expect(getFollowUpStatus("2026-10-26", "2026-10-25")).toEqual({
      status: "upcoming",
      daysOverdue: 0,
    });
  });

  it("counts overdue days across month and year boundaries", () => {
    expect(getFollowUpStatus("2026-09-30", "2026-10-25").daysOverdue).toBe(25);
    expect(getFollowUpStatus("2025-12-31", "2026-01-02").daysOverdue).toBe(2);
  });
});

describe("todayLocalYMD", () => {
  it("formats a device date without timezone conversion", () => {
    const local = new Date(2026, 9, 25, 23, 30); // Oct 25, 11:30pm local
    expect(todayLocalYMD(local)).toBe("2026-10-25");
  });
});
