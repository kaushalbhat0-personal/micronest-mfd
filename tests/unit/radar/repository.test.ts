import { describe, expect, it, vi } from "vitest";
import {
  listClients,
  RadarStoreError,
  toClientRecord,
  toStoredClient,
  updateLastContacted,
  type StoredRadarClient,
} from "@/features/radar/repository";

const STORED: StoredRadarClient = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Aarav Mehta",
  phone: "9876543210",
  investmentType: "SIP",
  lastInvested: "2026-10-12",
  lastContacted: null,
  isNewClient: false,
  note: "Met at review camp",
};

function stubClient(resfsm: { data?: unknown; error?: { code?: string; message: string } }) {
  const terminal = async () => resfsm;
  const secondOrder = vi.fn(terminal);
  const firstOrder = vi.fn(() => ({ order: secondOrder }));
  const selectAfterEq = vi.fn(terminal);
  const eq = vi.fn(() => ({ select: selectAfterEq }));
  const select = vi.fn(() => ({ order: firstOrder }));
  const update = vi.fn(() => ({ eq }));
  return {
    calls: { select, update, order: firstOrder, eq },
    from: vi.fn(() => ({ select, update, order: firstOrder })),
  };
}

describe("radar repository mapping", () => {
  it("maps a db row to its persistence shape, ignoring unknown fields", () => {
    expect(
      toStoredClient({
        id: "abc",
        name: "Aarav",
        mobile: "9876543210",
        investment_type: "Both",
        last_invested: "2026-10-01",
        last_contacted: null,
        is_new_client: true,
        note: "hi",
        user_id: "someone-else",
        // Unknown extras must never leak into the domain model.
        created_at: "2026-10-25",
      } as Parameters<typeof toStoredClient>[0]),
    ).toEqual({
      id: "abc",
      name: "Aarav",
      phone: "9876543210",
      investmentType: "Both",
      lastInvested: "2026-10-01",
      lastContacted: null,
      isNewClient: true,
      note: "hi",
    });
  });

  it("falls back safely on malformed values", () => {
    const stored = toStoredClient({
      id: 42,
      name: "Aarav",
      mobile: null,
      investment_type: "Crypto",
      last_invested: "12/10/2026",
      last_contacted: "not-a-date",
      is_new_client: "yes",
      note: 7,
    });
    expect(stored).toEqual({
      id: "",
      name: "Aarav",
      phone: "",
      investmentType: "Other",
      lastInvested: null,
      lastContacted: null,
      isNewClient: false,
      note: "",
    });
  });

  it("projects a stored client into a domain record with computed signals", () => {
    const record = toClientRecord(STORED, 3, "2026-10-25", 90);
    expect(record).toMatchObject({
      id: STORED.id,
      rowNumber: 4,
      name: "Aarav Mehta",
      phone: "9876543210",
      phoneValid: true,
      investmentType: "SIP",
      note: "Met at review camp",
    });
    // Invested 13 days ago → recent-investor; never contacted → reconnect-due.
    expect(record.signals).toEqual(["recent-investor", "reconnect-due"]);
  });

  it("marks bad phones invalid without dropping the record", () => {
    const record = toClientRecord({ ...STORED, phone: "abc" }, 0, "2026-10-25", 90);
    expect(record.phoneValid).toBe(false);
    expect(record.phone).toBe("abc");
  });
});

describe("radar repository list", () => {
  it("returns mapped rows in database order", async () => {
    const client = stubClient({ data: [{ ...STORED, mobile: "9876543210" }] });
    const rows = await listClients(client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: STORED.id, name: "Aarav Mehta" });
    expect(client.calls.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("maps auth failures to the auth error code", async () => {
    const client = stubClient({ error: { code: "PGRST301", message: "JWT expired" } });
    await expect(listClients(client as never)).rejects.toMatchObject({ code: "auth" });
  });

  it("maps other failures to the load error code with safe copy", async () => {
    const client = stubClient({
      error: { code: "XX000", message: "internal secret detail" },
    });
    const error = await listClients(client as never).catch((e) => e);
    expect(error).toBeInstanceOf(RadarStoreError);
    expect(error.code).toBe("load");
    expect(error.message).not.toContain("secret");
  });

  it("maps thrown transport errors to load errors", async () => {
    const from = vi.fn(() => {
      throw new Error("network down");
    });
    await expect(listClients({ from } as never)).rejects.toMatchObject({ code: "load" });
  });
});

describe("radar repository update", () => {
  it("persists last contacted and returns the updated row", async () => {
    const client = stubClient({
      data: [{ ...STORED, mobile: "9876543210", last_contacted: "2026-10-25" }],
    });
    const updated = await updateLastContacted(client as never, STORED.id, "2026-10-25");
    expect(updated.lastContacted).toBe("2026-10-25");
  });

  it("treats zero updated rows (RLS denial) as an update error", async () => {
    const client = stubClient({ data: [] });
    await expect(
      updateLastContacted(client as never, STORED.id, "2026-10-25"),
    ).rejects.toMatchObject({ code: "update" });
  });

  it("maps auth failures to the auth error code", async () => {
    const client = stubClient({ error: { message: "jwt expired" } });
    await expect(
      updateLastContacted(client as never, STORED.id, "2026-10-25"),
    ).rejects.toMatchObject({ code: "auth" });
  });
});
