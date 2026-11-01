import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";

// `server-only` throws outside React Server Components; stub it so the
// authorization logic itself stays unit-testable in Node.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}));

import type { createServerSupabase } from "@/lib/supabase/server";

// The gate memoizes session + membership per request (React `cache`), so
// each test gets a fresh module registry — otherwise one test's membership
// rows would leak into the next.
let AdminUnauthorized: typeof import("@/lib/admin/auth").AdminUnauthorized;
let isAdmin: typeof import("@/lib/admin/auth").isAdmin;
let requireAdmin: typeof import("@/lib/admin/auth").requireAdmin;
let mockedServerSupabase: MockedFunction<typeof createServerSupabase>;

function mockSession(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  };
}

function mockMembership(rows: Array<{ user_id: string }>) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-admin" } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

describe("admin auth gate", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    const auth = await import("@/lib/admin/auth");
    AdminUnauthorized = auth.AdminUnauthorized;
    isAdmin = auth.isAdmin;
    requireAdmin = auth.requireAdmin;
    const server = await import("@/lib/supabase/server");
    mockedServerSupabase = vi.mocked(server.createServerSupabase);
  });

  it("isAdmin returns true for an active member", async () => {
    mockedServerSupabase.mockResolvedValue(mockMembership([{ user_id: "u-admin" }]) as never);
    await expect(isAdmin("u-admin")).resolves.toBe(true);
  });

  it("isAdmin returns false when no membership row exists", async () => {
    mockedServerSupabase.mockResolvedValue(mockMembership([]) as never);
    await expect(isAdmin("u-stranger")).resolves.toBe(false);
  });

  it("isAdmin returns false for null, undefined, and empty ids without querying", async () => {
    mockedServerSupabase.mockResolvedValue(mockMembership([{ user_id: "x" }]) as never);
    await expect(isAdmin(null)).resolves.toBe(false);
    await expect(isAdmin(undefined)).resolves.toBe(false);
    await expect(isAdmin("")).resolves.toBe(false);
    expect(mockedServerSupabase).not.toHaveBeenCalled();
  });

  it("requireAdmin rejects signed-out callers", async () => {
    mockedServerSupabase.mockResolvedValue(mockSession(null) as never);
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminUnauthorized);
  });

  it("requireAdmin rejects authenticated non-admins", async () => {
    mockedServerSupabase.mockResolvedValue(mockMembership([]) as never);
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminUnauthorized);
  });

  it("requireAdmin resolves the user id for active admins", async () => {
    mockedServerSupabase.mockResolvedValue(mockMembership([{ user_id: "u-admin" }]) as never);
    await expect(requireAdmin()).resolves.toBe("u-admin");
  });

  it("serves repeated gates in one request from the memoized session", async () => {
    // React `cache()` dedupes per request in the server runtime (in plain
    // Node it passes through, so this asserts functional repeatability
    // while production collapses the repeated Supabase lookups).
    mockedServerSupabase.mockResolvedValue(mockMembership([{ user_id: "u-admin" }]) as never);
    await expect(requireAdmin()).resolves.toBe("u-admin");
    await expect(requireAdmin()).resolves.toBe("u-admin");
  });
});
