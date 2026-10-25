/**
 * Follow-up repository integration tests (RCCF-MFD-22, C1).
 *
 * Runs ONLY against a dedicated dev project when these env vars are set:
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Otherwise the whole file is skipped. The service-role client is used
 * EXCLUSIVELY for test setup (create users, seed clients) and teardown
 * (delete users; rows cascade). Every behavioral assertion goes through
 * anon-key clients holding real user JWTs, so RLS — not application code —
 * is what is actually under test. Never use production data, real accounts,
 * or committed credentials.
 *
 * NOTE: createFollowup intentionally omits user_id — the live schema fills
 * it from DEFAULT auth.uid() (migration 20261025160000). If that default
 * were missing, the create tests below would fail with a create-coded
 * error instead of passing, which is exactly the coverage wanted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  completeFollowup,
  createFollowup,
  listFollowupsForClient,
  listOpenFollowups,
  listOpenFollowupsForClient,
  reopenFollowup,
} from "@/features/followups/repository";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const CONFIGURED = Boolean(URL && ANON && SERVICE);

const suite = CONFIGURED ? describe : describe.skip;

const PASSWORD = "rls-furepo-test-001";
const stamp = Date.now().toString(36);
const EMAIL_A = `furepo-a-${stamp}@example.invalid`;
const EMAIL_B = `furepo-b-${stamp}@example.invalid`;
const FUTURE = "2026-11-05";

suite("followups repository persistence", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientAId: string;
  let clientBId: string;

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

    const mkClient = async (userId: string, name: string) => {
      const { data, error } = await admin
        .from("radar_clients")
        .insert({ user_id: userId, name })
        .select("id")
        .single();
      if (error || !data) throw new Error("setup client insert failed");
      return data.id as string;
    };
    clientAId = await mkClient(idA, "FU Repo Alpha");
    clientBId = await mkClient(idB, "FU Repo Beta");
  }, 120000);

  afterAll(async () => {
    if (!CONFIGURED) return;
    const { data } = await admin.auth.admin.listUsers();
    for (const u of data.users) {
      if (u.email?.includes(stamp)) await admin.auth.admin.deleteUser(u.id);
    }
  }, 120000);

  it("owner creates, lists, completes, and reopens a follow-up", async () => {
    const created = await createFollowup(clientA, {
      clientId: clientAId,
      dueDate: FUTURE,
      reason: "Repo roundtrip",
      note: "call after 11am",
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created).toMatchObject({
      clientId: clientAId,
      dueDate: FUTURE,
      reason: "Repo roundtrip",
      completedAt: null,
    });

    const open = await listOpenFollowups(clientA);
    expect(open.map((r) => r.id)).toContain(created.id);
    const forClient = await listOpenFollowupsForClient(clientA, clientAId);
    expect(forClient.map((r) => r.id)).toContain(created.id);

    const done = await completeFollowup(clientA, created.id);
    expect(typeof done.completedAt).toBe("string");
    expect((await listOpenFollowups(clientA)).map((r) => r.id)).not.toContain(created.id);

    const reopened = await reopenFollowup(clientA, created.id);
    expect(reopened.completedAt).toBeNull();
    expect((await listOpenFollowups(clientA)).map((r) => r.id)).toContain(created.id);

    // Cleanup through the admin path (no app-level delete exists by design).
    await admin.from("client_followups").delete().eq("id", created.id);
  }, 60000);

  it("completing and reopening never touch last_contacted", async () => {
    const before = await admin
      .from("radar_clients")
      .select("last_contacted")
      .eq("id", clientAId)
      .single();
    const created = await createFollowup(clientA, {
      clientId: clientAId,
      dueDate: FUTURE,
      reason: "Orthogonality check",
      note: "",
    });
    await completeFollowup(clientA, created.id);
    await reopenFollowup(clientA, created.id);
    const after = await admin
      .from("radar_clients")
      .select("last_contacted")
      .eq("id", clientAId)
      .single();
    expect(after.data!.last_contacted).toBe(before.data!.last_contacted);
    await admin.from("client_followups").delete().eq("id", created.id);
  }, 60000);

  it("full-client list carries open then completed through the lifecycle", async () => {
    const created = await createFollowup(clientA, {
      clientId: clientAId,
      dueDate: FUTURE,
      reason: "Full list lifecycle",
      note: "",
    });
    try {
      // create → present in full list as open and in open-only list.
      const fullOpen = await listFollowupsForClient(clientA, clientAId);
      expect(fullOpen.map((r) => r.id)).toContain(created.id);
      expect(fullOpen.find((r) => r.id === created.id)!.completedAt).toBeNull();

      // complete → reload-equivalent: absent from open-only, present in full as completed.
      const done = await completeFollowup(clientA, created.id);
      expect(typeof done.completedAt).toBe("string");
      expect((await listOpenFollowupsForClient(clientA, clientAId)).map((r) => r.id)).not.toContain(
        created.id,
      );
      const fullDone = await listFollowupsForClient(clientA, clientAId);
      const doneRow = fullDone.find((r) => r.id === created.id)!;
      expect(doneRow.completedAt).toBe(done.completedAt);
      expect(fullDone.filter((r) => r.completedAt === null).map((r) => r.id)).not.toContain(
        created.id,
      );

      // reopen → reload-equivalent: open again in both lists.
      const reopened = await reopenFollowup(clientA, created.id);
      expect(reopened.completedAt).toBeNull();
      const fullReopened = await listFollowupsForClient(clientA, clientAId);
      expect(fullReopened.find((r) => r.id === created.id)!.completedAt).toBeNull();
      expect((await listOpenFollowupsForClient(clientA, clientAId)).map((r) => r.id)).toContain(
        created.id,
      );
    } finally {
      await admin.from("client_followups").delete().eq("id", created.id);
    }
  }, 60000);

  it("full-client list ordering is open (due ASC) then completed (completed DESC)", async () => {
    const mk = (dueDate: string) =>
      createFollowup(clientA, {
        clientId: clientAId,
        dueDate,
        reason: `Order ${dueDate}`,
        note: "",
      });
    const first = await mk("2026-11-10");
    const second = await mk("2026-11-06");
    try {
      const done = await completeFollowup(clientA, first.id);
      expect(typeof done.completedAt).toBe("string");
      const full = await listFollowupsForClient(clientA, clientAId);
      const ids = full.map((r) => r.id);
      // Open row sorts before the completed row regardless of due dates.
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
      expect(full.find((r) => r.id === first.id)!.completedAt).not.toBeNull();
      expect(full.find((r) => r.id === second.id)!.completedAt).toBeNull();
    } finally {
      await admin.from("client_followups").delete().in("id", [first.id, second.id]);
    }
  }, 60000);

  it("full-client list rejects malformed ids and blocks cross-user access", async () => {
    await expect(listFollowupsForClient(clientA, "not-a-uuid")).rejects.toMatchObject({
      code: "load",
    });
    // Foreign client id: RLS yields zero rows, never a leak.
    expect(await listFollowupsForClient(clientA, clientBId)).toEqual([]);
  }, 60000);

  it("foreign client create is blocked and cross-user rows stay invisible", async () => {
    await expect(
      createFollowup(clientA, {
        clientId: clientBId,
        dueDate: FUTURE,
        reason: "Poach attempt",
        note: "",
      }),
    ).rejects.toMatchObject({ code: "create" });

    const createdB = await createFollowup(clientB, {
      clientId: clientBId,
      dueDate: FUTURE,
      reason: "Beta private task",
      note: "",
    });
    try {
      expect((await listOpenFollowups(clientA)).map((r) => r.id)).not.toContain(createdB.id);
      expect((await listOpenFollowupsForClient(clientA, clientBId)).map((r) => r.id)).not.toContain(
        createdB.id,
      );
      await expect(completeFollowup(clientA, createdB.id)).rejects.toMatchObject({
        code: "complete",
      });
      await expect(reopenFollowup(clientA, createdB.id)).rejects.toMatchObject({
        code: "reopen",
      });
    } finally {
      await admin.from("client_followups").delete().eq("id", createdB.id);
    }
  }, 60000);
});
