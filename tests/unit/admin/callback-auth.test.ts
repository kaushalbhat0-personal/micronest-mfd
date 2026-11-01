import { afterEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside React Server Components; stub it so the
// membership helper stays unit-testable in Node.
vi.mock("server-only", () => ({}));

import { isAdminWithToken } from "@/lib/admin/auth";

const supabaseUrl = "https://example.supabase.co";
const anonKey = "example-anon-key";

function mockEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "should-never-be-used-here");
}

describe("isAdminWithToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns true when the membership row exists", async () => {
    mockEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ user_id: "u-1" }]),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(isAdminWithToken({ userId: "u-1", accessToken: "user-jwt" })).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/v1/admin_users");
    expect(url).toContain("revoked_at=is.null");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(anonKey);
    expect(headers.Authorization).toBe("Bearer user-jwt");
    expect(JSON.stringify(init)).not.toContain("should-never-be-used-here");
  });

  it("returns false when no membership row exists", async () => {
    mockEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }),
    );
    await expect(isAdminWithToken({ userId: "u-2", accessToken: "user-jwt" })).resolves.toBe(false);
  });

  it("fails closed on request errors and missing inputs", async () => {
    mockEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve([]) }),
    );
    await expect(isAdminWithToken({ userId: "u-3", accessToken: "user-jwt" })).resolves.toBe(false);
    await expect(isAdminWithToken({ userId: "", accessToken: "user-jwt" })).resolves.toBe(false);
    await expect(isAdminWithToken({ userId: "u-3", accessToken: "" })).resolves.toBe(false);
  });
});
