import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMPLETED_LIMIT,
  listCompletedFollowups,
  MAX_COMPLETED_LIMIT,
} from "@/features/followups/repository";
import {
  groupActiveFollowups,
  parseFollowupsTab,
  splitStoredFollowups,
  toCompletedRecord,
  type FollowupClientInfo,
} from "@/features/followups/model";
import type { StoredFollowup } from "@/features/followups/types";

const CLIENT_A = "123e4567-e89b-42d3-a456-426614174000";
const CLIENT_B = "223e4567-e89b-42d3-a456-426614174001";

function stored(overrides: Partial<StoredFollowup> = {}): StoredFollowup {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    clientId: CLIENT_A,
    dueDate: "2026-11-05",
    reason: "Discuss SIP increase",
    note: "",
    completedAt: null,
    createdAt: "2026-10-25T10:00:00.000Z",
    ...overrides,
  };
}

const CLIENTS = new Map<string, FollowupClientInfo>([
  [CLIENT_A, { name: "Asha Rao", phone: "+91 98765 43210" }],
  [CLIENT_B, { name: "Ben Dias", phone: "" }],
]);

/** Thenable-chain stub with the completed-read verbs (not/limit). */
function stubTable(resolution: { data?: unknown; error?: { code?: string; message: string } }) {
  const fns = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    limit: vi.fn(),
  };
  const chain = {
    ...fns,
    then: (resolve: (value: unknown) => void) => resolve(resolution),
  };
  Object.values(fns).forEach((fn) => fn.mockReturnValue(chain));
  return { from: vi.fn(() => chain), calls: fns };
}

describe("followup repository completed read", () => {
  it("filters to completed rows, newest first, with the default bound", async () => {
    const table = stubTable({ data: [] });
    const rows = await listCompletedFollowups(table as never);
    expect(rows).toEqual([]);
    expect(table.calls.not).toHaveBeenCalledWith("completed_at", "is", null);
    expect(table.calls.order).toHaveBeenCalledWith("completed_at", { ascending: false });
    expect(table.calls.limit).toHaveBeenCalledWith(DEFAULT_COMPLETED_LIMIT);
    expect(DEFAULT_COMPLETED_LIMIT).toBe(100);
  });

  it("respects an explicit bound and clamps to the maximum", async () => {
    const table = stubTable({ data: [] });
    await listCompletedFollowups(table as never, 50);
    expect(table.calls.limit).toHaveBeenCalledWith(50);

    const clamped = stubTable({ data: [] });
    await listCompletedFollowups(clamped as never, MAX_COMPLETED_LIMIT + 400);
    expect(clamped.calls.limit).toHaveBeenCalledWith(MAX_COMPLETED_LIMIT);
  });

  it("falls back to the default bound for non-positive limits", async () => {
    const table = stubTable({ data: [] });
    await listCompletedFollowups(table as never, 0);
    expect(table.calls.limit).toHaveBeenCalledWith(DEFAULT_COMPLETED_LIMIT);
  });

  it("maps rows through the stored shape", async () => {
    const table = stubTable({
      data: [
        {
          id: "c1",
          client_id: CLIENT_A,
          due_date: "2026-10-20",
          reason: "Review nominees",
          note: "Evening",
          completed_at: "2026-10-25T09:00:00.000Z",
          created_at: "2026-10-18T10:00:00.000Z",
        },
      ],
    });
    const rows = await listCompletedFollowups(table as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: CLIENT_A,
      dueDate: "2026-10-20",
      completedAt: "2026-10-25T09:00:00.000Z",
    });
  });

  it("maps failures without leaking details", async () => {
    const table = stubTable({ error: { code: "XX000", message: "internal detail" } });
    const error = await listCompletedFollowups(table as never).catch((e) => e);
    expect(error.code).toBe("load");
    expect(error.message).not.toContain("detail");
  });

  it("maps auth failures to the auth error code", async () => {
    const table = stubTable({ error: { message: "jwt expired" } });
    await expect(listCompletedFollowups(table as never)).rejects.toMatchObject({ code: "auth" });
  });
});

describe("completed presenter", () => {
  it("keeps a completed row with client and timestamp info", () => {
    const record = toCompletedRecord(
      stored({ completedAt: "2026-10-25T09:00:00.000Z", note: "Evening" }),
      CLIENTS.get(CLIENT_A)!,
    );
    expect(record).toMatchObject({
      clientId: CLIENT_A,
      clientName: "Asha Rao",
      clientPhone: "+91 98765 43210",
      reason: "Discuss SIP increase",
      note: "Evening",
      dueDate: "2026-11-05",
      completedAt: "2026-10-25T09:00:00.000Z",
    });
  });

  it("rejects an open row — history never admits active records", () => {
    expect(toCompletedRecord(stored({ completedAt: null }), CLIENTS.get(CLIENT_A)!)).toBeNull();
  });
});

describe("follow-ups tab parsing", () => {
  it("defaults Active and selects Completed only for ?tab=completed", () => {
    expect(parseFollowupsTab(undefined)).toBe("active");
    expect(parseFollowupsTab(null)).toBe("active");
    expect(parseFollowupsTab("active")).toBe("active");
    expect(parseFollowupsTab("completed")).toBe("completed");
    expect(parseFollowupsTab("history")).toBe("active");
    expect(parseFollowupsTab(42)).toBe("active");
  });
});

describe("active grouping", () => {
  const TODAY = "2026-10-25";

  it("groups by derived status with earliest-due-first ordering", () => {
    const groups = groupActiveFollowups(
      [
        stored({ id: "up2", dueDate: "2026-11-10" }),
        stored({ id: "od2", dueDate: "2026-10-20" }),
        stored({ id: "td", dueDate: TODAY }),
        stored({ id: "od1", dueDate: "2026-10-18" }),
        stored({ id: "up1", dueDate: "2026-10-30" }),
      ],
      CLIENTS,
      TODAY,
    );
    expect(groups.overdue.map((r) => r.id)).toEqual(["od1", "od2"]);
    expect(groups.today.map((r) => r.id)).toEqual(["td"]);
    expect(groups.upcoming.map((r) => r.id)).toEqual(["up1", "up2"]);
  });

  it("breaks due-date ties by earliest created", () => {
    const groups = groupActiveFollowups(
      [
        stored({ id: "late", dueDate: TODAY, createdAt: "2026-10-25T12:00:00.000Z" }),
        stored({ id: "early", dueDate: TODAY, createdAt: "2026-10-25T09:00:00.000Z" }),
      ],
      CLIENTS,
      TODAY,
    );
    expect(groups.today.map((r) => r.id)).toEqual(["early", "late"]);
  });

  it("skips completed rows and unknown clients defensively", () => {
    const groups = groupActiveFollowups(
      [
        stored({ id: "done", completedAt: "2026-10-25T09:00:00.000Z" }),
        stored({ id: "ghost", clientId: "00000000-0000-4000-8000-000000000000" }),
      ],
      CLIENTS,
      TODAY,
    );
    expect(groups).toEqual({ overdue: [], today: [], upcoming: [] });
  });
});

describe("active → completed → reopened lifecycle", () => {
  it("a completion stamp moves the row between partitions without duplication", () => {
    const open = stored({ id: "lc" });
    expect(splitStoredFollowups([open]).open.map((r) => r.id)).toEqual(["lc"]);

    const done: StoredFollowup = { ...open, completedAt: "2026-10-25T09:00:00.000Z" };
    const split = splitStoredFollowups([done]);
    expect(split.open).toEqual([]);
    expect(split.completed.map((r) => r.id)).toEqual(["lc"]);

    const reopened: StoredFollowup = { ...done, completedAt: null };
    expect(splitStoredFollowups([reopened]).open.map((r) => r.id)).toEqual(["lc"]);
  });

  it("reopened status re-derives from the due date", () => {
    const groups = groupActiveFollowups(
      [stored({ id: "re", dueDate: "2026-10-20", completedAt: null })],
      CLIENTS,
      "2026-10-25",
    );
    expect(groups.overdue.map((r) => r.id)).toEqual(["re"]);
    expect(groups.overdue[0]?.status).toBe("overdue");
  });
});
