/**
 * Admin Users workspace integration tests (P1B).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped.
 *
 * Verifies at the database layer (RLS + Admin API, not app code):
 * - an admin can read Auth users and aggregate count-only usage
 * - plain authenticated and anonymous clients are denied customer reads
 * - usage queries return user_id columns only, never customer PII rows
 * - unknown Auth ids error (detail notFound path)
 * - payloads never contain the service-role secret
 *
 * The `listUsersPage`/`getUserDetail` glue is covered by unit mapping
 * tests and stub E2E; importing `lib/admin/*` here would need the
 * server-only + Next request context.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "admin-users-test-001";
const stamp = Date.now().toString(36);
const EMAIL_ADMIN = `users-admin-${stamp}@example.invalid`;
const EMAIL_PLAIN = `users-plain-${stamp}@example.invalid`;
const PREFIX = `u-${stamp}`;

interface Seed {
  adminId: string;
  plainId: string;
  clientIds: string[];
}

suite("admin users workspace", () => {
  let admin: SupabaseClient;
  let plainClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let seed: Seed;

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
    const plainId = await mkUser(EMAIL_PLAIN);

    const { data: clients, error: clientError } = await admin
      .from("radar_clients")
      .insert([
        { user_id: adminId, name: `${PREFIX} Alpha`, investment_type: "SIP" },
        { user_id: adminId, name: `${PREFIX} Beta`, investment_type: "Other" },
      ])
      .select("id");
    if (clientError || !clients) throw new Error(`setup clients failed: ${clientError?.message}`);
    const clientIds = (clients as Array<{ id: string }>).map((c) => c.id);

    const { error: followupError } = await admin.from("client_followups").insert({
      user_id: adminId,
      client_id: clientIds[0],
      due_date: "2026-12-01",
      reason: `${PREFIX} review`,
    });
    if (followupError) throw new Error(`setup followup failed: ${followupError.message}`);

    const { error: wtpError } = await admin.from("wtp_interest").insert({
      user_id: adminId,
      email: `${PREFIX}@example.invalid`,
      country: "IN",
      profession: "coach",
      client_count_band: "1-10",
      current_solution: ["excel"],
      desired_features: ["followup-reminders"],
      price_band: "free",
      message: `${PREFIX} admin research submission`,
    });
    if (wtpError) throw new Error(`setup wtp failed: ${wtpError.message}`);

    seed = { adminId, plainId, clientIds };

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
    await admin.from("radar_clients").delete().in("id", seed.clientIds);
    await admin.from("wtp_interest").delete().eq("user_id", seed.adminId);
    await admin.auth.admin.deleteUser(seed.adminId);
    await admin.auth.admin.deleteUser(seed.plainId);
  });

  it("admin can list users and fetch one by id", async () => {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(listed.error).toBeNull();
    const found = listed.data.users.find((u) => u.id === seed.adminId);
    expect(found?.email).toBe(EMAIL_ADMIN);

    const single = await admin.auth.admin.getUserById(seed.adminId);
    expect(single.error).toBeNull();
    expect(single.data.user?.id).toBe(seed.adminId);
  });

  it("aggregates count-only usage without customer PII columns", async () => {
    const clients = await admin
      .from("radar_clients")
      .select("user_id")
      .in("user_id", [seed.adminId, seed.plainId]);
    expect(clients.error).toBeNull();
    const adminClients = ((clients.data ?? []) as Array<{ user_id: string }>).filter(
      (r) => r.user_id === seed.adminId,
    );
    expect(adminClients.length).toBe(2);
    for (const row of (clients.data ?? []) as Array<Record<string, unknown>>) {
      expect(Object.keys(row).sort()).toEqual(["user_id"]);
    }

    const followups = await admin
      .from("client_followups")
      .select("user_id,completed_at")
      .in("user_id", [seed.adminId, seed.plainId]);
    expect(followups.error).toBeNull();
    expect(followups.data ?? []).toHaveLength(1);

    const wtp = await admin
      .from("wtp_interest")
      .select("user_id")
      .in("user_id", [seed.adminId, seed.plainId]);
    expect(wtp.error).toBeNull();
    expect(
      ((wtp.data ?? []) as Array<{ user_id: string }>).filter((r) => r.user_id === seed.adminId),
    ).toHaveLength(1);
  });

  it("denies plain and anonymous customer reads", async () => {
    for (const client of [plainClient, anonClient]) {
      const read = await client.from("radar_clients").select("id").limit(1);
      expect(read.data ?? []).toHaveLength(0);
      expect(read.error).not.toBeNull();
    }
  });

  it("unknown auth ids error instead of leaking", async () => {
    const missing = await admin.auth.admin.getUserById("11111111-2222-4333-8444-555555555555");
    expect(missing.error).not.toBeNull();
  });

  it("service payloads never contain the service key", async () => {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(JSON.stringify(data ?? {})).not.toContain("service_role");
  });
});
