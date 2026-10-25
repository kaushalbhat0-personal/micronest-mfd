/**
 * RLS integration tests for client_followups (RCCF-MFD-21, C0).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped — unit tests and E2E never need it.
 *
 * The service-role client is used EXCLUSIVELY for test setup (create users,
 * seed clients), verification reads, and teardown (delete users; rows
 * cascade). Every isolation assertion goes through anon-key clients holding
 * real user JWTs, so RLS — not application code — is what is actually under
 * test. Never use production data, real accounts, or committed credentials.
 *
 * NOTE: these tests exercise the policies directly and therefore supply
 * user_id explicitly in inserts (the column is NOT NULL). The application
 * contract — future repository code never accepts user_id from callers —
 * is a C1 concern; what matters here is that RLS rejects anything whose
 * user_id is not the caller's own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "rls-followups-test-001";
const stamp = Date.now().toString(36);
const EMAIL_A = `rls-fu-a-${stamp}@example.invalid`;
const EMAIL_B = `rls-fu-b-${stamp}@example.invalid`;

interface Seed {
  idA: string;
  idB: string;
  clientAId: string;
  clientBId: string;
  followupAId: string;
}

const DUE = "2026-11-05";

suite("client_followups RLS", () => {
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

    const mkClient = async (userId: string, name: string) => {
      const { data, error } = await admin
        .from("radar_clients")
        .insert({ user_id: userId, name })
        .select("id")
        .single();
      if (error || !data) throw new Error("setup client insert failed");
      return data.id as string;
    };
    const clientAId = await mkClient(idA, "FU Client Alpha");
    const clientBId = await mkClient(idB, "FU Client Beta");

    const { data: fu, error: fuError } = await admin
      .from("client_followups")
      .insert({ user_id: idA, client_id: clientAId, due_date: DUE, reason: "Discuss SIP increase" })
      .select("id")
      .single();
    if (fuError || !fu) throw new Error("setup follow-up insert failed");
    seed = { idA, idB, clientAId, clientBId, followupAId: fu.id as string };
  }, 120000);

  afterAll(async () => {
    if (!CONFIGURED) return;
    await admin.auth.admin.deleteUser(seed.idA);
    await admin.auth.admin.deleteUser(seed.idB);
  }, 120000);

  it("A can insert a follow-up for A's own client", async () => {
    const { data, error } = await clientA
      .from("client_followups")
      .insert({ user_id: seed.idA, client_id: seed.clientAId, due_date: DUE, reason: "Call back" })
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await admin.from("client_followups").delete().eq("id", data![0].id);
  }, 30000);

  it("A can read A's own follow-up", async () => {
    const { data, error } = await clientA.from("client_followups").select("id,reason,note");
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toContain(seed.followupAId);
  }, 30000);

  it("A can update A's own follow-up", async () => {
    const { data, error } = await clientA
      .from("client_followups")
      .update({ note: "Evening works" })
      .eq("id", seed.followupAId)
      .select("id,note");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ id: seed.followupAId, note: "Evening works" });
  }, 30000);

  it("B cannot read A's follow-up", async () => {
    const { data, error } = await clientB
      .from("client_followups")
      .select("id")
      .eq("id", seed.followupAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  }, 30000);

  it("B cannot update A's follow-up", async () => {
    const { data } = await clientB
      .from("client_followups")
      .update({ note: "tampered" })
      .eq("id", seed.followupAId)
      .select("id");
    expect(data).toHaveLength(0);
    const check = await admin
      .from("client_followups")
      .select("note")
      .eq("id", seed.followupAId)
      .single();
    expect(check.data!.note).toBe("Evening works");
  }, 30000);

  it("B cannot delete A's follow-up", async () => {
    await clientB.from("client_followups").delete().eq("id", seed.followupAId);
    const check = await admin.from("client_followups").select("id").eq("id", seed.followupAId);
    expect(check.data).toHaveLength(1);
  }, 30000);

  it("foreign-client insert is rejected (own user_id + another user's client)", async () => {
    const { error } = await clientA.from("client_followups").insert({
      user_id: seed.idA,
      client_id: seed.clientBId,
      due_date: DUE,
      reason: "Poach attempt",
    });
    expect(error).not.toBeNull();
    const check = await admin.from("client_followups").select("id").eq("reason", "Poach attempt");
    expect(check.data).toHaveLength(0);
  }, 30000);

  it("foreign user_id insert is rejected (another user's user_id + own client)", async () => {
    const { error } = await clientA.from("client_followups").insert({
      user_id: seed.idB,
      client_id: seed.clientAId,
      due_date: DUE,
      reason: "Spoof attempt",
    });
    expect(error).not.toBeNull();
    const check = await admin.from("client_followups").select("id").eq("reason", "Spoof attempt");
    expect(check.data).toHaveLength(0);
  }, 30000);

  it("reparenting onto another user's client is rejected", async () => {
    const { data, error } = await clientA
      .from("client_followups")
      .update({ client_id: seed.clientBId })
      .eq("id", seed.followupAId)
      .select("id");
    // Either a policy error or zero affected rows: both mean the move failed.
    const check = await admin
      .from("client_followups")
      .select("client_id")
      .eq("id", seed.followupAId)
      .single();
    expect(check.data!.client_id).toBe(seed.clientAId);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  }, 30000);

  it("deleting a client cascades its follow-ups", async () => {
    const { data: tmp } = await admin
      .from("radar_clients")
      .insert({ user_id: seed.idA, name: "FU Cascade Client" })
      .select("id")
      .single();
    const tmpClientId = tmp!.id as string;
    const { data: tmpFu } = await admin
      .from("client_followups")
      .insert({ user_id: seed.idA, client_id: tmpClientId, due_date: DUE, reason: "Cascade me" })
      .select("id")
      .single();
    await admin.from("radar_clients").delete().eq("id", tmpClientId);
    const check = await admin
      .from("client_followups")
      .select("id")
      .eq("id", tmpFu!.id as string);
    expect(check.data).toHaveLength(0);
  }, 30000);

  it("each user sees only their own rows", async () => {
    const { data: fuB } = await admin
      .from("client_followups")
      .insert({ user_id: seed.idB, client_id: seed.clientBId, due_date: DUE, reason: "Beta task" })
      .select("id")
      .single();
    try {
      const seenByA = await clientA.from("client_followups").select("id,reason");
      expect(seenByA.error).toBeNull();
      expect(seenByA.data!.every((r) => r.reason !== "Beta task")).toBe(true);
      const seenByB = await clientB.from("client_followups").select("id,reason");
      expect(seenByB.error).toBeNull();
      expect(seenByB.data!.map((r) => r.reason)).toEqual(["Beta task"]);
    } finally {
      await admin
        .from("client_followups")
        .delete()
        .eq("id", fuB!.id as string);
    }
  }, 30000);

  it("anonymous select sees nothing and anonymous insert is rejected", async () => {
    const { data } = await anon.from("client_followups").select("id");
    expect(data).toHaveLength(0);
    const { error } = await anon.from("client_followups").insert({
      user_id: seed.idA,
      client_id: seed.clientAId,
      due_date: DUE,
      reason: "Anon attempt",
    });
    expect(error).not.toBeNull();
  }, 30000);

  it("CHECK constraints reject empty reasons and overlong notes", async () => {
    const badReason = await clientA.from("client_followups").insert({
      user_id: seed.idA,
      client_id: seed.clientAId,
      due_date: DUE,
      reason: "",
    });
    expect(badReason.error).not.toBeNull();
    const badNote = await clientA.from("client_followups").insert({
      user_id: seed.idA,
      client_id: seed.clientAId,
      due_date: DUE,
      reason: "Valid reason",
      note: "x".repeat(201),
    });
    expect(badNote.error).not.toBeNull();
  }, 30000);

  it("A can delete A's own follow-up", async () => {
    const { data: tmp } = await clientA
      .from("client_followups")
      .insert({ user_id: seed.idA, client_id: seed.clientAId, due_date: DUE, reason: "Doomed" })
      .select("id");
    expect(tmp).toHaveLength(1);
    const { error } = await clientA
      .from("client_followups")
      .delete()
      .eq("id", tmp![0].id as string);
    expect(error).toBeNull();
    const check = await admin
      .from("client_followups")
      .select("id")
      .eq("id", tmp![0].id as string);
    expect(check.data).toHaveLength(0);
  }, 30000);
});
