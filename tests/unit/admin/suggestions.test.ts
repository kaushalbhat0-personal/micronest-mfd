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
import { getSuggestionDetail, listSuggestions } from "@/lib/admin/queries";

const mockedServerSupabase = vi.mocked(createServerSupabase);
const mockedServiceClient = vi.mocked(createAdminServiceClient);

interface Canned {
  data: unknown;
  error: unknown;
  count: number | null;
}

let canned: Canned;
let ops: string[];

function makeRecordingBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = (cols: string, opts?: unknown) => {
    ops.push(`select ${cols} ${JSON.stringify(opts ?? null)}`);
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    ops.push(`eq ${col}=${val}`);
    return builder;
  };
  builder.is = (col: string, val: unknown) => {
    ops.push(`is ${col} ${val}`);
    return builder;
  };
  builder.not = (col: string, op: string, val: unknown) => {
    ops.push(`not ${col} ${op} ${val}`);
    return builder;
  };
  builder.or = (expr: string) => {
    ops.push(`or ${expr}`);
    return builder;
  };
  builder.order = (col: string, opts?: unknown) => {
    ops.push(`order ${col} ${JSON.stringify(opts ?? null)}`);
    return builder;
  };
  builder.range = (from: number, to: number) => {
    ops.push(`range ${from}-${to}`);
    return builder;
  };
  builder.limit = (n: number) => {
    ops.push(`limit ${n}`);
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve({ data: canned.data, error: canned.error });
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: canned.data, error: canned.error, count: canned.count });
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
    () => ({ from: vi.fn().mockReturnValue(makeRecordingBuilder()) }) as never,
  );
}

const BASE_FILTERS = {
  q: "",
  profession: "",
  country: "",
  countBand: "",
  priceBand: "",
  authStatus: "all" as const,
};

describe("listSuggestions query mapping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ops = [];
    canned = { data: [], error: null, count: 0 };
    mockAdminSession();
  });

  it("requests newest-first with exact count and a 25-row window on page 1", async () => {
    canned = { data: [], error: null, count: 0 };
    const result = await listSuggestions(BASE_FILTERS, 1);
    expect(ops).toContain('order created_at {"ascending":false}');
    expect(ops).toContain("range 0-24");
    expect(ops.some((op) => op.includes('"count":"exact"'))).toBe(true);
    expect(result).toMatchObject({ total: 0, page: 1, pageSize: 25, totalPages: 1 });
  });

  it("advances the range window on later pages", async () => {
    await listSuggestions(BASE_FILTERS, 3);
    expect(ops).toContain("range 50-74");
  });

  it("maps enum filters to exact column matches", async () => {
    await listSuggestions(
      { ...BASE_FILTERS, profession: "coach", country: "IN", countBand: "1-10", priceBand: "free" },
      1,
    );
    expect(ops).toContain("eq profession=coach");
    expect(ops).toContain("eq country=IN");
    expect(ops).toContain("eq client_count_band=1-10");
    expect(ops).toContain("eq price_band=free");
  });

  it("maps identified to NOT NULL and anonymous to IS NULL", async () => {
    await listSuggestions({ ...BASE_FILTERS, authStatus: "identified" }, 1);
    expect(ops).toContain("not user_id is null");
    ops = [];
    await listSuggestions({ ...BASE_FILTERS, authStatus: "anonymous" }, 1);
    expect(ops).toContain("is user_id null");
  });

  it("searches only the justified text fields with escaped patterns", async () => {
    await listSuggestions({ ...BASE_FILTERS, q: "crm" }, 1);
    const or = ops.find((op) => op.startsWith("or "));
    expect(or).toContain("email.ilike.%crm%");
    expect(or).toContain("message.ilike.%crm%");
    expect(or).toContain("other_feature.ilike.%crm%");
    expect(or).toContain("profession_other.ilike.%crm%");
    expect(or).toContain("current_solution_other.ilike.%crm%");
  });

  it("strips or-syntax characters and escapes LIKE wildcards in search", async () => {
    await listSuggestions({ ...BASE_FILTERS, q: "a,b%c(d)" }, 1);
    const or = ops.find((op) => op.startsWith("or ")) ?? "";
    const patterns = [...or.matchAll(/ilike\.([^,]+)/g)].map((m) => m[1]);
    expect(patterns.length).toBe(5);
    for (const pattern of patterns) {
      expect(pattern).toBe("%ab\\%cd%");
    }
  });

  it("computes total pages from the exact count", async () => {
    canned = { data: [], error: null, count: 51 };
    const result = await listSuggestions(BASE_FILTERS, 1);
    expect(result).toMatchObject({ total: 51, totalPages: 3 });
  });

  it("truncates long messages to excerpts in summaries", async () => {
    canned = {
      data: [
        {
          id: "00efbebd-d993-44d4-9d14-cf621f897342",
          created_at: "2026-11-01T02:15:56Z",
          user_id: null,
          email: null,
          country: "IN",
          profession: "other",
          client_count_band: "1-10",
          price_band: "not-sure",
          desired_features: [],
          message: "z".repeat(200),
        },
      ],
      error: null,
      count: 1,
    };
    const result = await listSuggestions(BASE_FILTERS, 1);
    expect(result.rows[0].messageExcerpt).toBe("z".repeat(140));
  });
});

describe("getSuggestionDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ops = [];
    canned = { data: null, error: { message: "none" }, count: null };
    mockAdminSession();
  });

  it("returns null for malformed ids without touching the service client", async () => {
    await expect(getSuggestionDetail("not-a-uuid")).resolves.toBeNull();
    expect(mockedServiceClient).not.toHaveBeenCalled();
  });

  it("queries one row by id and returns all legitimate fields", async () => {
    canned = {
      data: {
        id: "00efbebd-d993-44d4-9d14-cf621f897342",
        created_at: "2026-11-01T02:15:56Z",
        updated_at: "2026-11-01T02:15:56Z",
        user_id: "u-1",
        email: "a@example.invalid",
        country: "IN",
        profession: "coach",
        profession_other: null,
        client_count_band: "1-10",
        current_solution: ["excel"],
        current_solution_other: null,
        desired_features: ["followup-reminders"],
        other_feature: null,
        quoted_price_minor: 50000,
        quoted_currency: "INR",
        price_band: "5-10",
        message: "hello",
      },
      error: null,
      count: null,
    };
    const detail = await getSuggestionDetail("00efbebd-d993-44d4-9d14-cf621f897342");
    expect(ops.some((op) => op.includes("quoted_price_minor"))).toBe(true);
    expect(ops).toContain("eq id=00efbebd-d993-44d4-9d14-cf621f897342");
    expect(detail).toMatchObject({ priceBand: "5-10", quotedPriceMinor: 50000 });
  });

  it("returns null for unknown ids", async () => {
    canned = { data: null, error: null, count: null };
    await expect(getSuggestionDetail("11111111-2222-4333-8444-555555555555")).resolves.toBeNull();
  });
});
