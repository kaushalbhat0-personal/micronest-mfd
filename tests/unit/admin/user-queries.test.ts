import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside React Server Components; stub it so the
// query glue stays unit-testable in Node.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/admin/service", () => ({
  createAdminServiceClient: vi.fn(),
}));

import { createAdminServiceClient } from "@/lib/admin/service";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUserDetail, listUsersPage } from "@/lib/admin/queries";

const mockedServerSupabase = vi.mocked(createServerSupabase);
const mockedServiceClient = vi.mocked(createAdminServiceClient);

interface Canned {
  users: Array<{
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
    created_at: string;
    last_sign_in_at?: string | null;
  }>;
  usersError: unknown;
  tables: Record<string, Array<Record<string, unknown>>>;
  tablesError: unknown;
  userById: Record<string, unknown> | null;
  userByIdError: unknown;
}

let canned: Canned;
let ops: string[];

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  builder.select = (cols: string, opts?: unknown) => {
    ops.push(`${table} select ${cols} ${JSON.stringify(opts ?? null)}`);
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    ops.push(`${table} eq ${col}=${val}`);
    return builder;
  };
  builder.is = (col: string, val: unknown) => {
    ops.push(`${table} is ${col} ${val}`);
    return builder;
  };
  builder.not = (col: string, op: string, val: unknown) => {
    ops.push(`${table} not ${col} ${op} ${val}`);
    return builder;
  };
  builder.in = (col: string, vals: unknown) => {
    ops.push(`${table} in ${col}(${(vals as unknown[]).length})`);
    return builder;
  };
  builder.order = (col: string, opts?: unknown) => {
    ops.push(`${table} order ${col} ${JSON.stringify(opts ?? null)}`);
    return builder;
  };
  builder.range = (from: number, to: number) => {
    ops.push(`${table} range ${from}-${to}`);
    return builder;
  };
  builder.limit = (n: number) => {
    ops.push(`${table} limit ${n}`);
    return builder;
  };
  builder.maybeSingle = () =>
    Promise.resolve({ data: canned.tables[table]?.[0] ?? null, error: canned.tablesError });
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: canned.tables[table] ?? [], error: canned.tablesError, count: null });
  return builder;
}

function mockAdminSession() {
  mockedServerSupabase.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-admin" } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [{ user_id: "u-admin" }], error: null }),
          }),
        }),
      }),
    }),
  } as never);
  mockedServiceClient.mockImplementation(
    () =>
      ({
        auth: {
          admin: {
            listUsers: vi.fn().mockImplementation(({ page }: { page: number }) => {
              ops.push(`listUsers page=${page}`);
              return Promise.resolve({
                data: { users: page === 1 ? canned.users : [], total: canned.users.length },
                error: canned.usersError,
              });
            }),
            getUserById: vi.fn().mockImplementation((id: string) => {
              ops.push(`getUserById ${id}`);
              return Promise.resolve({
                data: { user: canned.userById },
                error: canned.userByIdError,
              });
            }),
          },
        },
        from: vi.fn().mockImplementation((table: string) => makeBuilder(table)),
      }) as never,
  );
}

function apiUser(id: string, email: string, fullName: string | null) {
  return {
    id,
    email,
    user_metadata: fullName ? { full_name: fullName } : {},
    created_at: "2026-01-01T00:00:00Z",
    last_sign_in_at: "2026-02-01T00:00:00Z",
  };
}

describe("listUsersPage query mapping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ops = [];
    canned = {
      users: [
        apiUser("u-1", "a@example.invalid", "Asha"),
        apiUser("u-2", "b@example.invalid", null),
      ],
      usersError: null,
      tables: { radar_clients: [], client_followups: [], wtp_interest: [] },
      tablesError: null,
      userById: null,
      userByIdError: null,
    };
    mockAdminSession();
  });

  it("fetches one auth window and aggregates counts without N+1", async () => {
    canned.tables = {
      radar_clients: [{ user_id: "u-1" }, { user_id: "u-1" }],
      client_followups: [{ user_id: "u-1", completed_at: null }],
      wtp_interest: [{ user_id: "u-2" }],
    };
    const result = await listUsersPage({ q: "", usage: "all", page: 1 }, 1);
    expect(ops).toContain("listUsers page=1");
    expect(ops).not.toContain("listUsers page=2");
    expect(ops).toContain("radar_clients in user_id(2)");
    expect(result.total).toBe(2);
    expect(result.pageSize).toBe(25);
    expect(result.totalPages).toBe(1);
    expect(result.rows.find((r) => r.id === "u-1")).toMatchObject({
      displayName: "Asha",
      clientCount: 2,
      openFollowupCount: 1,
      submissionCount: 0,
    });
    expect(result.rows.find((r) => r.id === "u-2")).toMatchObject({
      displayName: null,
      submissionCount: 1,
    });
  });

  it("stops paginating the auth window at the safety ceiling", async () => {
    canned.users = Array.from({ length: 1000 }, (_, i) =>
      apiUser(`u-${i}`, `${i}@x.invalid`, null),
    );
    await listUsersPage({ q: "", usage: "all", page: 1 }, 1);
    const pages = ops.filter((op) => op.startsWith("listUsers"));
    expect(pages.length).toBeLessThanOrEqual(6);
  });

  it("narrows by search before aggregating", async () => {
    const result = await listUsersPage({ q: "asha", usage: "all", page: 1 }, 1);
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe("u-1");
    expect(ops).toContain("radar_clients in user_id(1)");
  });

  it("applies the usage filter after counting", async () => {
    canned.tables = { radar_clients: [{ user_id: "u-1" }], client_followups: [], wtp_interest: [] };
    const result = await listUsersPage({ q: "", usage: "has-clients", page: 1 }, 1);
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe("u-1");
  });

  it("slices pages of 25 in code", async () => {
    canned.users = Array.from({ length: 30 }, (_, i) => apiUser(`u-${i}`, `${i}@x.invalid`, null));
    const first = await listUsersPage({ q: "", usage: "all", page: 1 }, 1);
    expect(first.rows).toHaveLength(25);
    expect(first.totalPages).toBe(2);
    const second = await listUsersPage({ q: "", usage: "all", page: 2 }, 2);
    expect(second.rows).toHaveLength(5);
    expect(second.rows[0].id).toBe("u-25");
  });
});

describe("getUserDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ops = [];
    canned = {
      users: [],
      usersError: null,
      tables: { radar_clients: [], client_followups: [], wtp_interest: [] },
      tablesError: null,
      userById: null,
      userByIdError: null,
    };
    mockAdminSession();
  });

  it("returns null for malformed ids without touching the service client", async () => {
    await expect(getUserDetail("not-a-uuid")).resolves.toBeNull();
    expect(mockedServiceClient).not.toHaveBeenCalled();
  });

  it("composes identity, counts, and submissions by user id", async () => {
    canned.userById = {
      id: "11111111-2222-4333-8444-555555555555",
      email: "a@example.invalid",
      user_metadata: { full_name: "Asha" },
      created_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: null,
    };
    canned.tables = {
      radar_clients: [],
      client_followups: [
        { user_id: "x", completed_at: null },
        { user_id: "x", completed_at: "2026-01-02T00:00:00Z" },
      ],
      wtp_interest: [
        {
          id: "00efbebd-d993-44d4-9d14-cf621f897342",
          created_at: "2026-11-01T02:15:56Z",
          user_id: "11111111-2222-4333-8444-555555555555",
          email: "other@example.invalid",
          country: "IN",
          profession: "coach",
          client_count_band: "1-10",
          price_band: "free",
          desired_features: [],
          message: "hi",
        },
      ],
    };
    const detail = await getUserDetail("11111111-2222-4333-8444-555555555555");
    expect(ops).toContain("getUserById 11111111-2222-4333-8444-555555555555");
    expect(ops).toContain("wtp_interest eq user_id=11111111-2222-4333-8444-555555555555");
    expect(detail?.user).toMatchObject({ email: "a@example.invalid", displayName: "Asha" });
    expect(detail?.counts).toMatchObject({
      openFollowupCount: 1,
      completedFollowupCount: 1,
      submissionCount: 1,
    });
    expect(detail?.submissions[0]).toMatchObject({ email: "other@example.invalid" });
  });

  it("returns null for unknown ids", async () => {
    canned.userById = null;
    canned.userByIdError = { message: "User not found" };
    await expect(getUserDetail("11111111-2222-4333-8444-555555555555")).resolves.toBeNull();
  });
});
