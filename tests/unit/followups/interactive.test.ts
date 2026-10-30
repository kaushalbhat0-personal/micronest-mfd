import { describe, expect, it } from "vitest";
import { getFollowUpStatus } from "@/features/followups/dates";
import { toFollowupRecord } from "@/features/followups/model";
import type { StoredFollowup } from "@/features/followups/types";
import {
  fieldForFollowupError,
  validateFollowupInput,
  type FollowupFieldInput,
} from "@/features/followups/validation";

const TODAY = "2026-10-25";
const CLIENT = "123e4567-e89b-42d3-a456-426614174000";

const VALID: FollowupFieldInput = {
  clientId: CLIENT,
  dueDate: "2026-10-25",
  reason: "Discuss SIP increase",
  note: "Prefers evening calls",
};

function stored(overrides: Partial<StoredFollowup> = {}): StoredFollowup {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    clientId: CLIENT,
    dueDate: TODAY,
    reason: "Discuss SIP increase",
    note: "",
    completedAt: null,
    createdAt: "2026-10-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("validateFollowupInput", () => {
  it("accepts today and future dates", () => {
    expect(validateFollowupInput(VALID, TODAY)).toEqual({
      row: {
        clientId: CLIENT,
        dueDate: TODAY,
        reason: "Discuss SIP increase",
        note: "Prefers evening calls",
      },
      error: null,
    });
    expect(
      validateFollowupInput({ ...VALID, dueDate: "2027-01-15", note: "" }, TODAY).error,
    ).toBeNull();
  });

  it("rejects past dates while the CSV path tolerates history", () => {
    expect(validateFollowupInput({ ...VALID, dueDate: "2026-10-24" }, TODAY).error).toContain(
      "Please choose today or a future date",
    );
  });

  it("rejects empty, malformed, and impossible dates", () => {
    expect(validateFollowupInput({ ...VALID, dueDate: "" }, TODAY).error).toContain(
      "Please choose when to follow up",
    );
    expect(validateFollowupInput({ ...VALID, dueDate: "25/10/2026" }, TODAY).error).toContain(
      "doesn't look right",
    );
    expect(validateFollowupInput({ ...VALID, dueDate: "tomorrow" }, TODAY).error).toContain(
      "doesn't look right",
    );
    expect(validateFollowupInput({ ...VALID, dueDate: "2026-02-30" }, TODAY).error).toContain(
      "doesn't look right",
    );
    expect(validateFollowupInput({ ...VALID, dueDate: "2026-13-01" }, TODAY).error).toContain(
      "doesn't look right",
    );
  });

  it("requires a well-formed client reference", () => {
    expect(validateFollowupInput({ ...VALID, clientId: "" }, TODAY).error).toContain(
      "Please choose a client",
    );
    expect(validateFollowupInput({ ...VALID, clientId: "Rajesh" }, TODAY).error).toContain(
      "Please choose a valid client",
    );
  });

  it("requires reason within 1–40 chars", () => {
    expect(validateFollowupInput({ ...VALID, reason: "   " }, TODAY).error).toContain(
      "Please say why you're following up",
    );
    expect(validateFollowupInput({ ...VALID, reason: "x".repeat(41) }, TODAY).error).toContain(
      "under 40",
    );
    expect(validateFollowupInput({ ...VALID, reason: "x".repeat(40) }, TODAY).error).toBeNull();
  });

  it("allows empty note but caps at 200 chars", () => {
    expect(validateFollowupInput({ ...VALID, note: "" }, TODAY).error).toBeNull();
    expect(validateFollowupInput({ ...VALID, note: "x".repeat(201) }, TODAY).error).toContain(
      "under 200",
    );
  });

  it("rejects sensitive reason and note without echoing the secret", () => {
    const pan = "ABCDE1234F";
    const reasonError = validateFollowupInput({ ...VALID, reason: `PAN ${pan}` }, TODAY).error;
    expect(reasonError).toContain("sensitive");
    expect(reasonError).not.toContain(pan);
    const noteError = validateFollowupInput({ ...VALID, note: `otp 123456` }, TODAY).error;
    expect(noteError).toContain("sensitive");
  });

  it("trims surrounding whitespace consistently", () => {
    const result = validateFollowupInput(
      {
        clientId: `  ${CLIENT}  `,
        dueDate: "  2026-11-05  ",
        reason: "  Call back  ",
        note: "  hi  ",
      },
      TODAY,
    );
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      clientId: CLIENT,
      dueDate: "2026-11-05",
      reason: "Call back",
      note: "hi",
    });
  });
});

describe("fieldForFollowupError", () => {
  it("maps validator messages onto form fields", () => {
    expect(fieldForFollowupError("Please choose a client.")).toBe("clientId");
    expect(fieldForFollowupError("That date doesn't look right — please use YYYY-MM-DD.")).toBe(
      "dueDate",
    );
    expect(
      fieldForFollowupError("Reason looks like sensitive information — please remove it."),
    ).toBe("reason");
    expect(fieldForFollowupError("Note must be under 200 characters.")).toBe("note");
    expect(fieldForFollowupError(null)).toBeNull();
  });
});

describe("follow-up status derivation", () => {
  it("classifies yesterday, today, and tomorrow", () => {
    expect(getFollowUpStatus("2026-10-24", TODAY).status).toBe("overdue");
    expect(getFollowUpStatus(TODAY, TODAY).status).toBe("today");
    expect(getFollowUpStatus("2026-10-26", TODAY).status).toBe("upcoming");
  });

  it("handles month and year boundaries", () => {
    expect(getFollowUpStatus("2026-10-31", "2026-11-01").status).toBe("overdue");
    expect(getFollowUpStatus("2025-12-31", "2026-01-01")).toMatchObject({
      status: "overdue",
      daysOverdue: 1,
    });
    expect(getFollowUpStatus("2026-01-01", "2025-12-31").status).toBe("upcoming");
  });
});

describe("toFollowupRecord", () => {
  it("projects an open row with derived status and client display fields", () => {
    const record = toFollowupRecord(
      stored({ dueDate: "2026-10-23" }),
      { name: "Rajesh Sharma", phone: "9876543210" },
      TODAY,
    );
    expect(record).toMatchObject({
      status: "overdue",
      daysOverdue: 2,
      clientName: "Rajesh Sharma",
      clientPhone: "9876543210",
      clientPhoneValid: true,
      reason: "Discuss SIP increase",
    });
  });

  it("marks bad client phones invalid without dropping the record", () => {
    const record = toFollowupRecord(stored(), { name: "No Phone", phone: "abc" }, TODAY);
    expect(record).toMatchObject({ clientName: "No Phone", clientPhoneValid: false });
  });

  it("never projects completed rows — they carry no active status", () => {
    expect(
      toFollowupRecord(
        stored({ completedAt: "2026-10-25T09:00:00.000Z" }),
        { name: "Rajesh Sharma", phone: "" },
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("splitStoredFollowups (C2 client-detail split)", () => {
  it("splits open vs completed without reordering", async () => {
    const { splitStoredFollowups } = await import("@/features/followups/model");
    const openA = stored({ id: "o-a" });
    const doneA = stored({ id: "c-a", completedAt: "2026-10-24T09:00:00.000Z" });
    const openB = stored({ id: "o-b" });
    // Repository order is [open...] + [completed...]; split must preserve it.
    const { open, completed } = splitStoredFollowups([openA, openB, doneA]);
    expect(open.map((r) => r.id)).toEqual(["o-a", "o-b"]);
    expect(completed.map((r) => r.id)).toEqual(["c-a"]);
  });

  it("excludes completed history from the open header count", async () => {
    const { splitStoredFollowups } = await import("@/features/followups/model");
    const rows = [
      stored({ id: "o-1" }),
      stored({ id: "c-1", completedAt: "2026-10-24T09:00:00.000Z" }),
      stored({ id: "c-2", completedAt: "2026-10-23T09:00:00.000Z" }),
    ];
    const { open, completed } = splitStoredFollowups(rows);
    expect(open).toHaveLength(1);
    expect(completed).toHaveLength(2);
  });
});
