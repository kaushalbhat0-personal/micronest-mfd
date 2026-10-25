/**
 * Repository integration tests (RCCF-MFD-16).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped. RLS itself was proven in MFD-15;
 * these tests prove the repository layer honors it (own data flows,
 * foreign data never surfaces, cross-user writes throw typed errors).
 * Never use production data, real accounts, or committed credentials.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  listClients,
  RadarStoreError,
  toClientRecord,
  updateLastContacted,
} from "@/features/radar/repository";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "rls-repo-test-001";
const stamp = Date.now().toString(36);
const EMAIL_A = `repo-a-${stamp}@example.invalid`;
const EMAIL_B = `repo-b-${stamp}@example.invalid`;
const TODAY = "2026-10-25";

suite("radar repository persistence", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let idA = "";
  let idB = "";

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
    idA = await mkUser(EMAIL_A);
    idB = await mkUser(EMAIL_B);

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

    await admin.from("radar_clients").insert([
      { user_id: idA, name: "Repo Alpha", mobile: "9876543210", last_contacted: null },
      { user_id: idB, name: "Repo Beta", mobile: "", last_contacted: null },
    ]);
  }, 120000);

  afterAll(async () => {
    if (!CONFIGURED) return;
    await admin.auth.admin.deleteUser(idA);
    await admin.auth.admin.deleteUser(idB);
  }, 120000);

  it("empty account returns zero records", async () => {
    const { data } = await admin.auth.admin.createUser({
      email: `repo-empty-${stamp}@example.invalid`,
      password: PASSWORD,
      email_confirm: true,
    });
    const fresh = createClient(URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await fresh.auth.signInWithPassword({
      email: `repo-empty-${stamp}@example.invalid`,
      password: PASSWORD,
    });
    expect(await listClients(fresh)).toEqual([]);
    await admin.auth.admin.deleteUser(data.user!.id);
  }, 30000);

  it("returns only the caller's own records", async () => {
    const rows = await listClients(clientA);
    expect(rows.map((r) => r.name)).toEqual(["Repo Alpha"]);
  }, 30000);

  it("maps stored rows to domain records with computed signals", async () => {
    const rows = await listClients(clientA);
    const record = toClientRecord(rows[0], 0, TODAY, 90);
    expect(record.name).toBe("Repo Alpha");
    expect(record.phoneValid).toBe(true);
    expect(record.signals).toContain("reconnect-due");
  }, 30000);

  it("mark contacted persists last_contacted on the owned row", async () => {
    const rows = await listClients(clientA);
    const updated = await updateLastContacted(clientA, rows[0].id, TODAY);
    expect(updated.lastContacted).toBe(TODAY);
    const check = await admin
      .from("radar_clients")
      .select("last_contacted")
      .eq("id", updated.id)
      .single();
    expect(check.data!.last_contacted).toBe(TODAY);
  }, 30000);

  it("cross-user update throws a typed update error and changes nothing", async () => {
    const rowsB = await listClients(clientB);
    const attempt = updateLastContacted(clientA, rowsB[0].id, TODAY);
    await expect(attempt).rejects.toBeInstanceOf(RadarStoreError);
    await expect(attempt).rejects.toMatchObject({ code: "update" });
    const check = await admin
      .from("radar_clients")
      .select("last_contacted")
      .eq("id", rowsB[0].id)
      .single();
    expect(check.data!.last_contacted).toBeNull();
  }, 30000);
});
