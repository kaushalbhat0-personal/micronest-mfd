import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside React Server Components; stub it so the
// authorization logic itself stays unit-testable in Node.
vi.mock("server-only", () => ({}));

import { AdminUnauthorized, isAdmin, requireAdmin } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}));

const mockedServerSupabase = vi.mocked(createServerSupabase);

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
  beforeEach(() => {
    vi.resetAllMocks();
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
});
