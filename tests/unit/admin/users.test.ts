import { describe, expect, it } from "vitest";
import {
  applyUserSearch,
  applyUserUsageFilter,
  countByUserId,
  displayNameFromMetadata,
  formatJoinedDate,
  formatLastSignIn,
  parseUserSearchParams,
  splitFollowupsByUser,
  userFiltersToQuery,
  type UserSummary,
} from "@/features/admin/users";

function summary(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: "u-1",
    email: "a@example.invalid",
    displayName: "Asha",
    createdAt: "2026-01-01T00:00:00Z",
    lastSignInAt: "2026-02-01T00:00:00Z",
    clientCount: 0,
    openFollowupCount: 0,
    completedFollowupCount: 0,
    submissionCount: 0,
    ...overrides,
  };
}

describe("user search params", () => {
  it("parses valid filters and trims whitespace", () => {
    expect(parseUserSearchParams({ q: "  Asha  ", usage: "has-clients", page: "2" })).toEqual({
      q: "Asha",
      usage: "has-clients",
      page: 2,
    });
  });

  it("defaults empty params to the unfiltered first page", () => {
    expect(parseUserSearchParams({})).toEqual({ q: "", usage: "all", page: 1 });
  });

  it("drops unknown usage filters and normalizes bad pages", () => {
    expect(parseUserSearchParams({ usage: "super-admin", page: "0" })).toEqual({
      q: "",
      usage: "all",
      page: 1,
    });
    expect(parseUserSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseUserSearchParams({ page: "99999" }).page).toBe(1000);
  });

  it("caps the query length", () => {
    expect(parseUserSearchParams({ q: "x".repeat(500) }).q).toBe("x".repeat(120));
  });

  it("serializes only non-default filters", () => {
    expect(userFiltersToQuery({ q: "", usage: "all", page: 1 })).toBe("");
    expect(userFiltersToQuery({ q: "a@b.c", usage: "has-submissions", page: 3 })).toBe(
      "?q=a%40b.c&usage=has-submissions&page=3",
    );
  });
});

describe("display name fallback", () => {
  it("reads full_name and trims it", () => {
    expect(displayNameFromMetadata({ full_name: "  Asha K  " })).toBe("Asha K");
  });

  it("returns null for missing, blank, or non-string names", () => {
    expect(displayNameFromMetadata({})).toBeNull();
    expect(displayNameFromMetadata({ full_name: "   " })).toBeNull();
    expect(displayNameFromMetadata({ full_name: 42 })).toBeNull();
    expect(displayNameFromMetadata(null)).toBeNull();
    expect(displayNameFromMetadata(undefined)).toBeNull();
  });
});

describe("usage aggregation helpers", () => {
  it("counts rows per user and skips null user ids", () => {
    expect(
      countByUserId([{ user_id: "a" }, { user_id: "a" }, { user_id: "b" }, { user_id: null }]),
    ).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ]),
    );
  });

  it("splits follow-ups into open vs completed per user", () => {
    expect(
      splitFollowupsByUser([
        { user_id: "a", completed_at: null },
        { user_id: "a", completed_at: "2026-01-02T00:00:00Z" },
        { user_id: null, completed_at: null },
      ]),
    ).toEqual({
      open: new Map([["a", 1]]),
      completed: new Map([["a", 1]]),
    });
  });
});

describe("user search and usage filters", () => {
  const rows = [
    summary({ id: "u-1", email: "asha@example.invalid", displayName: "Asha", clientCount: 2 }),
    summary({
      id: "u-2",
      email: "ben@example.invalid",
      displayName: null,
      openFollowupCount: 1,
    }),
    summary({ id: "u-3", email: null, displayName: "Cara", submissionCount: 3 }),
  ];

  it("matches email or display name case-insensitively", () => {
    expect(applyUserSearch(rows, "ASHA").map((r) => r.id)).toEqual(["u-1"]);
    expect(applyUserSearch(rows, "ben@").map((r) => r.id)).toEqual(["u-2"]);
    expect(applyUserSearch(rows, "car").map((r) => r.id)).toEqual(["u-3"]);
    expect(applyUserSearch(rows, "nope")).toEqual([]);
  });

  it("returns everything on blank queries", () => {
    expect(applyUserSearch(rows, "   ")).toEqual(rows);
  });

  it("filters by usage counts", () => {
    expect(applyUserUsageFilter(rows, "all")).toEqual(rows);
    expect(applyUserUsageFilter(rows, "has-clients").map((r) => r.id)).toEqual(["u-1"]);
    expect(applyUserUsageFilter(rows, "has-followups").map((r) => r.id)).toEqual(["u-2"]);
    expect(applyUserUsageFilter(rows, "has-submissions").map((r) => r.id)).toEqual(["u-3"]);
  });
});

describe("account date display", () => {
  it("formats valid dates and falls back honestly", () => {
    expect(formatJoinedDate("2026-01-02T00:00:00Z")).toBe("2 Jan 2026");
    expect(formatJoinedDate(null)).toBe("—");
    expect(formatJoinedDate("garbage")).toBe("—");
    expect(formatLastSignIn("2026-01-02T00:00:00Z")).toBe("2 Jan 2026");
    expect(formatLastSignIn(null)).toBe("Never");
    expect(formatLastSignIn(undefined)).toBe("Never");
  });
});
