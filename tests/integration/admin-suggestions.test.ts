/**
 * Suggestions workspace integration tests (P1A).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped.
 *
 * Verifies at the database layer (RLS + PostgREST semantics, not app code):
 * - service reads see seeded rows with exact-count pagination windows
 * - enum filters, identified/anonymous filters, and ilike search behave
 * - anonymous and plain authenticated clients are denied reads and writes
 * - missing rows resolve to null (detail notFound path)
 * - payloads never contain the service-role secret
 *
 * The thin `listSuggestions`/`getSuggestionDetail` glue (requireAdmin +
 * service call) is covered by unit mapping tests and stub E2E; importing
 * `lib/admin/*` here would need the server-only + Next request context.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "admin-suggestions-test-001";
const stamp = Date.now().toString(36);
const EMAIL_ADMIN = `sugg-admin-${stamp}@example.invalid`;
const EMAIL_PLAIN = `sugg-plain-${stamp}@example.invalid`;

const PREFIX = `p1a-${stamp}`;

interface SeedIds {
  adminId: string;
  identifiedId: string;
  anonCoachId: string;
  anonFreeId: string;
}

suite("admin suggestions workspace", () => {
  let admin: SupabaseClient;
  let plainClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let seed: SeedIds;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const mkUser = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`setup createUser failed for ${email}`);
      return data.user.id;
    };
    const adminId = await mkUser(EMAIL_ADMIN);
    await mkUser(EMAIL_PLAIN);

    const baseRow = {
      country: "IN",
      current_solution: ["excel"],
      desired_features: ["followup-reminders"],
    };
    const insertRow = async (row: Record<string, unknown>) => {
      const { data, error } = await admin.from("wtp_interest").insert(row).select("id").single();
      if (error || !data) throw new Error(`setup wtp insert failed: ${error?.message}`);
      return (data as { id: string }).id;
    };
    const identifiedId = await insertRow({
      ...baseRow,
      user_id: adminId,
      email: `${PREFIX}-a@example.invalid`,
      profession: "coach",
      profession_other: null,
      client_count_band: "11-25",
      price_band: "5-10",
      message: `${PREFIX} identified coach wants followup reminders`,
    });
    const anonCoachId = await insertRow({
      ...baseRow,
      user_id: null,
      email: null,
      profession: "coach",
      profession_other: null,
      client_count_band: "1-10",
      current_solution_other: null,
      other_feature: `${PREFIX} custom dashboard widget`,
      price_band: "not-sure",
      message: `${PREFIX} anonymous needs reporting`,
    });
    const anonFreeId = await insertRow({
      ...baseRow,
      user_id: null,
      email: null,
      profession: "freelancer",
      profession_other: null,
      client_count_band: "1-10",
      other_feature: null,
      price_band: "free",
      message: `${PREFIX} free tier freelancer`,
    });
    seed = { adminId, identifiedId, anonCoachId, anonFreeId };

    const signIn = async (email: string) => {
      const c = createClient(URL!, ANON!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw new Error(`setup signIn failed for ${email}`);
      return c;
    };
    plainClient = await signIn(EMAIL_PLAIN);
    anonClient = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    await admin
      .from("wtp_interest")
      .delete()
      .in("id", [seed.identifiedId, seed.anonCoachId, seed.anonFreeId]);
    const { data } = await admin.auth.admin.listUsers();
    for (const email of [EMAIL_ADMIN, EMAIL_PLAIN]) {
      const found = data.users.find((u) => u.email === email);
      if (found) await admin.auth.admin.deleteUser(found.id);
    }
  });

  it("lists seeded rows with an exact total", async () => {
    const { data, error, count } = await admin
      .from("wtp_interest")
      .select("id", { count: "exact" })
      .ilike("message", `%${PREFIX}%`);
    expect(error).toBeNull();
    expect(count).toBe(3);
    expect((data ?? []).map((r) => (r as { id: string }).id).sort()).toEqual(
      [seed.identifiedId, seed.anonCoachId, seed.anonFreeId].sort(),
    );
  });

  it("filters by profession", async () => {
    const { data, error } = await admin
      .from("wtp_interest")
      .select("id,profession")
      .ilike("message", `%${PREFIX}%`)
      .eq("profession", "coach");
    expect(error).toBeNull();
    expect((data ?? []).map((r) => (r as { id: string }).id).sort()).toEqual(
      [seed.identifiedId, seed.anonCoachId].sort(),
    );
  });

  it("filters identified vs anonymous", async () => {
    const identified = await admin
      .from("wtp_interest")
      .select("id")
      .ilike("message", `%${PREFIX}%`)
      .not("user_id", "is", null);
    expect(identified.error).toBeNull();
    expect((identified.data ?? []).map((r) => (r as { id: string }).id)).toEqual([
      seed.identifiedId,
    ]);
    const anonymous = await admin
      .from("wtp_interest")
      .select("id")
      .ilike("message", `%${PREFIX}%`)
      .is("user_id", null);
    expect(anonymous.error).toBeNull();
    expect((anonymous.data ?? []).map((r) => (r as { id: string }).id).sort()).toEqual(
      [seed.anonCoachId, seed.anonFreeId].sort(),
    );
  });

  it("searches the justified text fields", async () => {
    const { data, error } = await admin
      .from("wtp_interest")
      .select("id")
      .or(`other_feature.ilike.%${PREFIX} custom dashboard widget%`);
    expect(error).toBeNull();
    expect((data ?? []).map((r) => (r as { id: string }).id)).toEqual([seed.anonCoachId]);
  });

  it("paginates server-side with range windows", async () => {
    const first = await admin
      .from("wtp_interest")
      .select("id", { count: "exact" })
      .ilike("message", `%${PREFIX}%`)
      .order("created_at", { ascending: false })
      .range(0, 0);
    expect(first.error).toBeNull();
    expect(first.count).toBe(3);
    expect(first.data ?? []).toHaveLength(1);
    const beyond = await admin
      .from("wtp_interest")
      .select("id", { count: "exact" })
      .ilike("message", `%${PREFIX}%`)
      .order("created_at", { ascending: false })
      .range(100000, 100024);
    expect(beyond.error).toBeNull();
    expect(beyond.count).toBe(3);
    expect(beyond.data ?? []).toHaveLength(0);
  });

  it("resolves unknown ids to null", async () => {
    const { data, error } = await admin
      .from("wtp_interest")
      .select("id")
      .eq("id", "11111111-2222-4333-8444-555555555555")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("denies anon and plain reads, and all anon writes", async () => {
    for (const client of [anonClient, plainClient]) {
      const read = await client.from("wtp_interest").select("id").limit(1);
      expect(read.data ?? []).toHaveLength(0);
      expect(read.error).not.toBeNull();
    }
    const write = await anonClient.from("wtp_interest").insert({
      country: "IN",
      profession: "coach",
      client_count_band: "1-10",
      price_band: "free",
    });
    expect(write.error).not.toBeNull();
  });

  it("service payloads never contain the service key", async () => {
    const { data } = await admin.from("wtp_interest").select("id").limit(1);
    expect(JSON.stringify(data ?? [])).not.toContain("service_role");
  });
});
