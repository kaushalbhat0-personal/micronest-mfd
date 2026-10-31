import { describe, expect, it, vi } from "vitest";
import {
  createClient,
  deleteClient,
  getClient,
  legacyAmountMirror,
  listClients,
  RadarStoreError,
  toClientRecord,
  toStoredClient,
  updateClient,
  updateLastContacted,
  type StoredRadarClient,
} from "@/features/radar/repository";

const STORED: StoredRadarClient = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Aarav Mehta",
  phone: "9876543210",
  investmentType: "SIP",
  sipAmountPaise: null,
  lumpsumAmountPaise: null,
  amountPaise: null,
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
        sip_amount_paise: 500000,
        lumpsum_amount_paise: null,
        amount_paise: 500000,
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
      sipAmountPaise: 500000,
      lumpsumAmountPaise: null,
      amountPaise: 500000,
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
      sip_amount_paise: -5,
      lumpsum_amount_paise: "oops",
      amount_paise: -5,
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
      sipAmountPaise: null,
      lumpsumAmountPaise: null,
      amountPaise: null,
      lastInvested: null,
      lastContacted: null,
      isNewClient: false,
      note: "",
    });
  });

  it("reads bigint amounts returned as text and projects them", () => {
    const stored = toStoredClient({
      id: "abc",
      name: "Aarav",
      mobile: "9876543210",
      investment_type: "SIP",
      sip_amount_paise: "500000",
      lumpsum_amount_paise: null,
      amount_paise: "500000",
      last_invested: null,
      last_contacted: null,
      is_new_client: false,
      note: "",
    });
    expect(stored.sipAmountPaise).toBe(500000);
    expect(stored.amountPaise).toBe(500000);
    const projected = toClientRecord(stored, 0, "2026-10-25", 90);
    expect(projected.sipAmountPaise).toBe(500000);
    expect(projected.lumpsumAmountPaise).toBeNull();
  });

  it("derives the legacy mirror from the buckets by investment type", () => {
    expect(legacyAmountMirror("SIP", 500000, 20000000)).toBe(500000);
    expect(legacyAmountMirror("Lumpsum", 500000, 20000000)).toBe(20000000);
    // Both never duplicates: the mirror keeps the monthly figure.
    expect(legacyAmountMirror("Both", 1000000, 20000000)).toBe(1000000);
    expect(legacyAmountMirror("Other", null, 700000)).toBe(700000);
    expect(legacyAmountMirror("Other", null, null)).toBeNull();
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

describe("radar repository crud", () => {
  const INPUT = {
    name: "Aarav Mehta",
    phone: "9876543210",
    investmentType: "SIP",
    sipAmountPaise: 500000,
    lumpsumAmountPaise: null,
    lastInvested: "2026-10-12",
    lastContacted: null,
    isNewClient: false,
    note: "Met at review camp",
  } as const;

  function stubTable(resolution: { data?: unknown; error?: { code?: string; message: string } }) {
    const fns = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const chain = {
      ...fns,
      then: (resolve: (value: unknown) => void) => resolve(resolution),
    };
    Object.values(fns).forEach((fn) => fn.mockReturnValue(chain));
    return { from: vi.fn(() => chain), calls: fns };
  }

  it("creates a client without ever sending user_id", async () => {
    const table = stubTable({
      data: [{ ...STORED, id: "new-id", mobile: "9876543210" }],
    });
    const created = await createClient(table as never, { ...INPUT });
    expect(created).toMatchObject({ id: "new-id", name: "Aarav Mehta" });
    expect(table.calls.insert).toHaveBeenCalledTimes(1);
    const sent = table.calls.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("user_id");
    expect(sent).toMatchObject({
      name: "Aarav Mehta",
      mobile: "9876543210",
      investment_type: "SIP",
      sip_amount_paise: 500000,
      lumpsum_amount_paise: null,
      amount_paise: 500000,
      last_invested: "2026-10-12",
      last_contacted: null,
      is_new_client: false,
      note: "Met at review camp",
    });
  });

  it("writes Both amounts independently with a non-duplicated legacy mirror", async () => {
    const table = stubTable({
      data: [{ ...STORED, id: "both-id", mobile: "9876543210" }],
    });
    const both = {
      ...INPUT,
      investmentType: "Both",
      lumpsumAmountPaise: 20000000,
    } as const;
    await createClient(table as never, both);
    const sent = table.calls.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      sip_amount_paise: 500000,
      lumpsum_amount_paise: 20000000,
      amount_paise: 500000,
    });
  });

  it("reads one owned client and rejects empty ids safely", async () => {
    const table = stubTable({ data: [{ ...STORED, mobile: "9876543210" }] });
    const found = await getClient(table as never, STORED.id);
    expect(found).toMatchObject({ id: STORED.id, name: "Aarav Mehta" });
    expect(table.calls.eq).toHaveBeenCalledWith("id", STORED.id);

    await expect(getClient(table as never, "")).rejects.toMatchObject({ code: "load" });
  });

  it("treats zero rows as foreign-or-missing for read, update, and delete", async () => {
    const empty = stubTable({ data: [] });
    await expect(getClient(empty as never, "foreign-id")).rejects.toMatchObject({ code: "load" });
    await expect(updateClient(empty as never, "foreign-id", { ...INPUT })).rejects.toMatchObject({
      code: "update",
    });
    await expect(deleteClient(empty as never, "foreign-id")).rejects.toMatchObject({
      code: "delete",
    });
  });

  it("updates the nine fields and maps auth failures", async () => {
    const table = stubTable({
      data: [{ ...STORED, mobile: "9876543210", note: "Updated note" }],
    });
    const updated = await updateClient(table as never, STORED.id, {
      ...INPUT,
      note: "Updated note",
    });
    expect(updated.note).toBe("Updated note");
    const sent = table.calls.update.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("user_id");

    const authed = stubTable({ error: { message: "jwt expired" } });
    await expect(updateClient(authed as never, STORED.id, { ...INPUT })).rejects.toMatchObject({
      code: "auth",
    });
  });

  it("deletes by id and verifies a row was removed", async () => {
    const table = stubTable({ data: [{ id: STORED.id }] });
    await expect(deleteClient(table as never, STORED.id)).resolves.toBeUndefined();
    expect(table.calls.delete).toHaveBeenCalledTimes(1);
    expect(table.calls.eq).toHaveBeenCalledWith("id", STORED.id);
  });

  it("maps create failures without leaking details", async () => {
    const table = stubTable({ error: { code: "23505", message: "duplicate supersecret" } });
    const error = await createClient(table as never, { ...INPUT }).catch((e) => e);
    expect(error).toBeInstanceOf(RadarStoreError);
    expect(error.code).toBe("create");
    expect(error.message).not.toContain("supersecret");
  });
});
