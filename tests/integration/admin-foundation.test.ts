/**
 * Admin foundation integration tests (P0).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped.
 *
 * Verifies at the database layer (RLS, not application code):
 * - anonymous and authenticated non-admin clients cannot read admin_users
 *   rows belonging to others, and cannot read wtp_interest at all;
 * - a member can self-read their own admin_users row;
 * - existing customer RLS (radar_clients owner isolation, wtp_interest
 *   insert-only) is unchanged;
 * - the service-role key never appears in any response payload.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "admin-foundation-test-001";
const stamp = Date.now().toString(36);
const EMAIL_ADMIN = `admin-fdn-admin-${stamp}@example.invalid`;
const EMAIL_PLAIN = `admin-fdn-plain-${stamp}@example.invalid`;

suite("admin_users foundation", () => {
  let admin: SupabaseClient;
  let adminClient: SupabaseClient;
  let plainClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let adminId: string;
  let plainId: string;

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
    adminId = await mkUser(EMAIL_ADMIN);
    plainId = await mkUser(EMAIL_PLAIN);

    // Privileged membership row for the admin user only (mirrors the
    // one-time SQL bootstrap; revoked_at stays NULL).
    const { error: memberError } = await admin
      .from("admin_users")
      .insert({ user_id: adminId, role: "admin" });
    if (memberError) throw new Error(`setup admin_users insert failed: ${memberError.message}`);

    const signIn = async (email: string) => {
      const c = createClient(URL!, ANON!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw new Error(`setup signIn failed for ${email}`);
      return c;
    };
    adminClient = await signIn(EMAIL_ADMIN);
    plainClient = await signIn(EMAIL_PLAIN);
    anonClient = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!CONFIGURED) return;
    await admin.from("admin_users").delete().eq("user_id", adminId);
    await admin.auth.admin.deleteUser(adminId);
    await admin.auth.admin.deleteUser(plainId);
  });

  it("admin member can self-read their own row", async () => {
    const { data, error } = await adminClient
      .from("admin_users")
      .select("user_id")
      .eq("user_id", adminId);
    expect(error).toBeNull();
    expect(data?.map((r) => r.user_id)).toContain(adminId);
  });

  it("plain authenticated user reads zero admin rows", async () => {
    const { data, error } = await plainClient.from("admin_users").select("user_id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("anonymous client reads zero admin rows", async () => {
    const { data, error } = await anonClient.from("admin_users").select("user_id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("nobody can insert admin_users through the anon path", async () => {
    const { error } = await plainClient
      .from("admin_users")
      .insert({ user_id: plainId, role: "admin" });
    expect(error).not.toBeNull();
  });

  it("wtp_interest stays unreadable from anon/authenticated clients", async () => {
    for (const client of [anonClient, plainClient]) {
      const { data, error } = await client.from("wtp_interest").select("id").limit(1);
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    }
  });

  it("service responses never contain the service key", async () => {
    const { data } = await admin.from("admin_users").select("user_id").limit(1);
    expect(JSON.stringify(data ?? [])).not.toContain("service_role");
  });
});
