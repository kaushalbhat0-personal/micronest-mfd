import { describe, expect, it } from "vitest";
import {
  fieldForClientError,
  validateClientFields,
  type ClientFieldInput,
} from "@/features/radar/validation";
import { filterClientsByName } from "@/features/radar/view";
import type { ClientRecord } from "@/features/radar/types";

const TODAY = "2026-10-25";

const VALID: ClientFieldInput = {
  name: "Aarav Mehta",
  phone: "9876543210",
  investmentType: "SIP",
  sipAmount: "",
  lumpsumAmount: "",
  lastInvested: "12/10/2026",
  lastContacted: "",
  note: "Prefers evening calls",
};

function record(name: string): ClientRecord {
  return {
    id: name,
    rowNumber: 1,
    name,
    phone: "",
    phoneValid: false,
    investmentType: "Other",
    sipAmountPaise: null,
    lumpsumAmountPaise: null,
    lastInvested: null,
    lastContacted: null,
    note: "",
    signals: [],
  };
}

describe("validateClientFields (shared by CSV and form)", () => {
  it("accepts a complete valid input", () => {
    const result = validateClientFields(VALID, TODAY, "form");
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      name: "Aarav Mehta",
      phone: "9876543210",
      phoneValid: true,
      investmentType: "SIP",
      lastInvested: "2026-10-12",
      lastContacted: null,
      note: "Prefers evening calls",
    });
  });

  it("accepts a minimal input with every optional field blank", () => {
    const result = validateClientFields(
      {
        name: "Nina",
        phone: "",
        investmentType: "",
        sipAmount: "",
        lumpsumAmount: "",
        lastInvested: "",
        lastContacted: "",
        note: "",
      },
      TODAY,
      "form",
    );
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({ investmentType: "Other", lastInvested: null, note: "" });
  });

  it("rejects missing and overlong names", () => {
    expect(validateClientFields({ ...VALID, name: "  " }, TODAY, "form").error).toContain(
      "Please enter the client's name",
    );
    expect(validateClientFields({ ...VALID, name: "x".repeat(61) }, TODAY, "form").error).toContain(
      "under 60",
    );
  });

  it("rejects invalid and future dates", () => {
    expect(
      validateClientFields({ ...VALID, lastInvested: "31/02/2026" }, TODAY, "form").error,
    ).toContain("Last invested");
    expect(
      validateClientFields({ ...VALID, lastContacted: "26/10/2026" }, TODAY, "form").error,
    ).toContain("in the future");
  });

  it("derives lifecycle from dates, never from a stored flag", () => {
    // MFD-70: there is no New Client boolean anywhere in the validated
    // output; New is derived from lastInvested/lastContacted downstream.
    expect("isNewClient" in (validateClientFields({ ...VALID }, TODAY, "form").row ?? {})).toBe(
      false,
    );
  });

  it("rejects sensitive notes with form-appropriate copy", () => {
    const error = validateClientFields({ ...VALID, note: "PAN ABCDE1234F" }, TODAY, "form").error;
    expect(error).toContain("sensitive");
    expect(error).not.toContain("re-upload");
    expect(error).not.toContain("ABCDE1234F");
  });

  it("warns (never rejects) on bad phones and unknown types", () => {
    const result = validateClientFields(
      { ...VALID, phone: "abc", investmentType: "Crypto" },
      TODAY,
      "form",
    );
    expect(result.error).toBeNull();
    expect(result.row?.phoneValid).toBe(false);
    expect(result.row?.investmentType).toBe("Other");
    expect(result.warnings.some((w) => w.startsWith("Phone number"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("investment type"))).toBe(true);
  });

  it("trims all free-text fields", () => {
    const result = validateClientFields(
      { ...VALID, name: "  Aarav  ", phone: " 9876543210 ", note: " hi " },
      TODAY,
      "form",
    );
    expect(result.row).toMatchObject({ name: "Aarav", phone: "9876543210", note: "hi" });
  });
});

describe("fieldForClientError", () => {
  it("maps validator messages onto form fields", () => {
    expect(fieldForClientError("Please enter the client's name.")).toBe("name");
    expect(fieldForClientError("SIP Amount must be a number like 5000 or 5000.50.")).toBe(
      "sipAmount",
    );
    expect(fieldForClientError("Lumpsum Amount must be a number like 5000 or 5000.50.")).toBe(
      "lumpsumAmount",
    );
    expect(
      fieldForClientError(
        "Please check the Last invested date — \"x\" is not a valid DD/MM/YYYY date.",
      ),
    ).toBe("lastInvested");
    expect(
      fieldForClientError("The Last spoke date \"x\" can't be in the future."),
    ).toBe("lastContacted");
    expect(fieldForClientError("Note looks like sensitive information — please remove it.")).toBe(
      "note",
    );
    expect(fieldForClientError(null)).toBeNull();
  });
});

describe("filterClientsByName", () => {
  const records = [record("Rajesh Sharma"), record("Priya Shah"), record("Amit Patel")];

  it("matches case-insensitively on substrings", () => {
    expect(filterClientsByName(records, "sha").map((r) => r.name)).toEqual([
      "Rajesh Sharma",
      "Priya Shah",
    ]);
    expect(filterClientsByName(records, "PRIYA").map((r) => r.name)).toEqual(["Priya Shah"]);
  });

  it("returns the full list on blank queries and never mutates it", () => {
    expect(filterClientsByName(records, "   ")).toHaveLength(3);
    expect(filterClientsByName(records, "zzz")).toHaveLength(0);
    expect(records).toHaveLength(3);
  });
});
