/**
 * RLS integration tests for radar_clients (RCCF-MFD-15).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped — unit tests and E2E never need it.
 *
 * The service-role client is used EXCLUSIVELY for test setup (create users),
 * verification reads, and teardown (delete users; rows cascade). Every
 * isolation assertion goes through anon-key clients holding real user JWTs,
 * so RLS — not application code — is what is actually under test.
 * Never use production data, real accounts, or committed credentials here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "rls-test-password-001";
const stamp = Date.now().toString(36);
const EMAIL_A = `rls-a-${stamp}@example.invalid`;
const EMAIL_B = `rls-b-${stamp}@example.invalid`;

interface Seed {
  idA: string;
  rowAId: string;
  idB: string;
  rowBId: string;
}

suite("radar_clients RLS", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let anon: SupabaseClient;
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
    const idA = await mkUser(EMAIL_A);
    const idB = await mkUser(EMAIL_B);

    const signIn = async (email: string) => {
      const c = createClient(URL!, ANON!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw new Error(`setup signIn failed for ${email}`);
      return c;
    };
    clientA = await signIn(EMAIL_A);
    clientB = await signIn(EMAIL_B);
    anon = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const insertRow = async (userId: string, name: string) => {
      const { data, error } = await admin
        .from("radar_clients")
        .insert({ user_id: userId, name })
        .select("id")
        .single();
      if (error || !data) throw new Error("setup insert failed");
      return data.id as string;
    };
    const rowAId = await insertRow(idA, "RLS Alpha");
    const rowBId = await insertRow(idB, "RLS Beta");
    seed = { idA, rowAId, idB, rowBId };
  }, 120000);

  afterAll(async () => {
    if (!CONFIGURED) return;
    await admin.auth.admin.deleteUser(seed.idA);
    await admin.auth.admin.deleteUser(seed.idB);
  }, 120000);

  it("A can read A's own row", async () => {
    const { data, error } = await clientA.from("radar_clients").select("id,name,user_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ id: seed.rowAId, name: "RLS Alpha", user_id: seed.idA });
  }, 30000);

  it("A cannot read B's row", async () => {
    const { data, error } = await clientA.from("radar_clients").select("id").eq("id", seed.rowBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  }, 30000);

  it("B cannot read A's row", async () => {
    const { data, error } = await clientB.from("radar_clients").select("id").eq("id", seed.rowAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  }, 30000);

  it("A cannot insert a row owned by B", async () => {
    const { error } = await clientA
      .from("radar_clients")
      .insert({ user_id: seed.idB, name: "RLS Intruder" });
    expect(error).not.toBeNull();
    const check = await admin.from("radar_clients").select("id").eq("name", "RLS Intruder");
    expect(check.data).toHaveLength(0);
  }, 30000);

  it("A cannot update B's row", async () => {
    const { data } = await clientA
      .from("radar_clients")
      .update({ note: "tampered" })
      .eq("id", seed.rowBId)
      .select("id");
    expect(data).toHaveLength(0);
    const check = await admin.from("radar_clients").select("note").eq("id", seed.rowBId).single();
    expect(check.data!.note).toBe("");
  }, 30000);

  it("A cannot transfer ownership of its own row to B", async () => {
    const { error } = await clientA
      .from("radar_clients")
      .update({ user_id: seed.idB })
      .eq("id", seed.rowAId);
    expect(error).not.toBeNull();
    const check = await admin
      .from("radar_clients")
      .select("user_id")
      .eq("id", seed.rowAId)
      .single();
    expect(check.data!.user_id).toBe(seed.idA);
  }, 30000);

  it("A cannot delete B's row", async () => {
    await clientA.from("radar_clients").delete().eq("id", seed.rowBId);
    const check = await admin.from("radar_clients").select("id").eq("id", seed.rowBId);
    expect(check.data).toHaveLength(1);
  }, 30000);

  it("anonymous select sees nothing", async () => {
    const { data } = await anon.from("radar_clients").select("id");
    expect(data).toHaveLength(0);
  }, 30000);

  it("anonymous insert is rejected", async () => {
    const { error } = await anon
      .from("radar_clients")
      .insert({ user_id: seed.idA, name: "RLS Anon" });
    expect(error).not.toBeNull();
  }, 30000);
});
