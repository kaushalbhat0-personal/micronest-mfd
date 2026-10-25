import { describe, expect, it, vi } from "vitest";
import {
  completeFollowup,
  createFollowup,
  FollowupStoreError,
  listOpenFollowups,
  listOpenFollowupsForClient,
  reopenFollowup,
  toStoredFollowup,
} from "@/features/followups/repository";
import type { FollowupInput } from "@/features/followups/types";

const CLIENT = "123e4567-e89b-42d3-a456-426614174000";

const DB_ROW = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  client_id: CLIENT,
  due_date: "2026-11-05",
  reason: "Discuss SIP increase",
  note: "",
  completed_at: null,
  created_at: "2026-10-25T10:00:00.000Z",
};

const INPUT: FollowupInput = {
  clientId: CLIENT,
  dueDate: "2026-11-05",
  reason: "Discuss SIP increase",
  note: "",
};

/** Thenable-chain stub mirroring the radar repository test convention. */
function stubTable(resolution: { data?: unknown; error?: { code?: string; message: string } }) {
  const fns = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    is: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  const chain = {
    ...fns,
    then: (resolve: (value: unknown) => void) => resolve(resolution),
  };
  Object.values(fns).forEach((fn) => fn.mockReturnValue(chain));
  return { from: vi.fn(() => chain), calls: fns };
}

describe("followup repository mapping", () => {
  it("maps a db row to its persistence shape, ignoring user_id", () => {
    expect(
      toStoredFollowup({ ...DB_ROW, user_id: "someone-else", extra: 1 } as Parameters<
        typeof toStoredFollowup
      >[0]),
    ).toEqual({
      id: DB_ROW.id,
      clientId: CLIENT,
      dueDate: "2026-11-05",
      reason: "Discuss SIP increase",
      note: "",
      completedAt: null,
      createdAt: "2026-10-25T10:00:00.000Z",
    });
  });

  it("falls back safely on malformed values", () => {
    expect(
      toStoredFollowup({
        id: 42,
        client_id: null,
        due_date: "05/11/2026",
        reason: 7,
        note: null,
        completed_at: "",
        created_at: null,
      }),
    ).toEqual({
      id: "",
      clientId: "",
      dueDate: "",
      reason: "",
      note: "",
      completedAt: null,
      createdAt: "",
    });
  });

  it("preserves the completion timestamp verbatim", () => {
    expect(
      toStoredFollowup({ ...DB_ROW, completed_at: "2026-10-25T09:00:00.000Z" }).completedAt,
    ).toBe("2026-10-25T09:00:00.000Z");
  });
});

describe("followup repository create", () => {
  it("sends only the four approved fields — never user_id", async () => {
    const table = stubTable({ data: [DB_ROW] });
    const created = await createFollowup(table as never, INPUT);
    expect(created).toMatchObject({ clientId: CLIENT, dueDate: "2026-11-05" });
    expect(table.calls.insert).toHaveBeenCalledTimes(1);
    const sent = table.calls.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("user_id");
    expect(sent).toEqual({
      client_id: CLIENT,
      due_date: "2026-11-05",
      reason: "Discuss SIP increase",
      note: "",
    });
  });

  it("treats zero created rows (foreign client RLS denial) as a create error", async () => {
    const table = stubTable({ data: [] });
    await expect(createFollowup(table as never, INPUT)).rejects.toMatchObject({ code: "create" });
  });

  it("maps failures without leaking details", async () => {
    const table = stubTable({ error: { code: "23503", message: "supersecret fk detail" } });
    const error = await createFollowup(table as never, INPUT).catch((e) => e);
    expect(error).toBeInstanceOf(FollowupStoreError);
    expect(error.code).toBe("create");
    expect(error.message).not.toContain("supersecret");
  });

  it("maps auth failures to the auth error code", async () => {
    const table = stubTable({ error: { message: "jwt expired" } });
    await expect(createFollowup(table as never, INPUT)).rejects.toMatchObject({ code: "auth" });
  });
});

describe("followup repository list", () => {
  it("applies the open filter and attention ordering", async () => {
    const table = stubTable({ data: [DB_ROW] });
    const rows = await listOpenFollowups(table as never);
    expect(rows).toHaveLength(1);
    expect(table.calls.is).toHaveBeenCalledWith("completed_at", null);
    expect(table.calls.order).toHaveBeenNthCalledWith(1, "due_date", { ascending: true });
    expect(table.calls.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: true });
  });

  it("maps load failures to the load error code", async () => {
    const table = stubTable({ error: { code: "XX000", message: "internal detail" } });
    const error = await listOpenFollowups(table as never).catch((e) => e);
    expect(error).toBeInstanceOf(FollowupStoreError);
    expect(error.code).toBe("load");
    expect(error.message).not.toContain("detail");
  });

  it("scopes per-client lists by client_id with the open filter", async () => {
    const table = stubTable({ data: [DB_ROW] });
    const rows = await listOpenFollowupsForClient(table as never, CLIENT);
    expect(rows).toHaveLength(1);
    expect(table.calls.eq).toHaveBeenCalledWith("client_id", CLIENT);
    expect(table.calls.is).toHaveBeenCalledWith("completed_at", null);
  });

  it("rejects malformed client ids safely without touching the database", async () => {
    const table = stubTable({ data: [DB_ROW] });
    await expect(listOpenFollowupsForClient(table as never, "not-a-uuid")).rejects.toMatchObject({
      code: "load",
    });
    expect(table.from).not.toHaveBeenCalled();
  });
});

describe("followup repository complete/reopen", () => {
  it("completes by stamping completed_at for the right id", async () => {
    const table = stubTable({
      data: [{ ...DB_ROW, completed_at: "2026-10-25T09:00:00.000Z" }],
    });
    const done = await completeFollowup(table as never, DB_ROW.id);
    expect(done.completedAt).toBe("2026-10-25T09:00:00.000Z");
    expect(table.calls.eq).toHaveBeenCalledWith("id", DB_ROW.id);
    const sent = table.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(sent)).toEqual(["completed_at"]);
    expect(typeof sent.completed_at).toBe("string");
  });

  it("reopens by clearing completed_at for the right id", async () => {
    const table = stubTable({ data: [DB_ROW] });
    const open = await reopenFollowup(table as never, DB_ROW.id);
    expect(open.completedAt).toBeNull();
    expect(table.calls.update.mock.calls[0][0]).toEqual({ completed_at: null });
  });

  it("treats zero updated rows (foreign id) as operation errors", async () => {
    const empty = stubTable({ data: [] });
    await expect(completeFollowup(empty as never, DB_ROW.id)).rejects.toMatchObject({
      code: "complete",
    });
    await expect(reopenFollowup(empty as never, DB_ROW.id)).rejects.toMatchObject({
      code: "reopen",
    });
  });

  it("never sends client fields on complete/reopen", async () => {
    const table = stubTable({ data: [DB_ROW] });
    await completeFollowup(table as never, DB_ROW.id);
    const sent = table.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("client_id");
    expect(sent).not.toHaveProperty("last_contacted");
    expect(sent).not.toHaveProperty("user_id");
  });
});
