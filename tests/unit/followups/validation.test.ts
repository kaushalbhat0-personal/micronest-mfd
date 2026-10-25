import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { TEMPLATE_HEADERS } from "@/features/followups/template";
import {
  validateFileHeaders,
  validateFileMeta,
  validateRow,
  MAX_DATA_ROWS,
} from "@/features/followups/validation";

function mapFor(header: string[]) {
  const result = validateFileHeaders(header);
  if (!result.map) throw new Error(`expected valid headers: ${result.error}`);
  return result.map;
}

const STANDARD = mapFor([...TEMPLATE_HEADERS]);

describe("validateFileMeta", () => {
  it("accepts .csv within size and rejects the rest", () => {
    expect(validateFileMeta("followups.csv", 100)).toBeNull();
    expect(validateFileMeta("Followups.CSV", 100)).toBeNull();
    expect(validateFileMeta("followups.xlsx", 100)).toContain(".csv");
    expect(validateFileMeta("followups.csv", 3 * 1024 * 1024)).toContain("2 MB");
  });
});

describe("validateFileHeaders", () => {
  it("accepts the exact template", () => {
    const result = validateFileHeaders([...TEMPLATE_HEADERS]);
    expect(result.error).toBeNull();
    expect(result.ignored).toEqual([]);
  });

  it("is case-insensitive, trims whitespace, and ignores order", () => {
    const result = validateFileHeaders([
      "  reason ",
      "NOTE",
      "mobile",
      "next FOLLOW-UP",
      "CLIENT name",
    ]);
    expect(result.error).toBeNull();
    expect(result.map?.["Client Name"]).toBe(4);
  });

  it("treats missing optional columns as absent", () => {
    const result = validateFileHeaders(["Client Name", "Next Follow-up"]);
    expect(result.error).toBeNull();
    expect(result.map?.["Mobile"]).toBe(-1);
  });

  it("rejects missing required columns", () => {
    expect(validateFileHeaders(["Client Name", "Mobile"]).error).toContain("Next Follow-up");
    expect(validateFileHeaders(["Mobile", "Next Follow-up"]).error).toContain("Client Name");
    expect(validateFileHeaders([]).error).toContain("empty");
  });

  it("rejects duplicate canonical headers", () => {
    const result = validateFileHeaders([
      "Client Name",
      "Mobile",
      "Next Follow-up",
      "Reason",
      "Note",
      "mobile",
    ]);
    expect(result.error).toContain("appears 2 times");
  });

  it("reports extra columns as ignored", () => {
    const result = validateFileHeaders([
      "Client Name",
      "Mobile",
      "Next Follow-up",
      "Reason",
      "Note",
      "PAN",
      "Folio",
    ]);
    expect(result.error).toBeNull();
    expect(result.ignored).toEqual(["PAN", "Folio"]);
  });
});

describe("validateRow", () => {
  it("accepts a complete valid row", () => {
    const result = validateRow(["Rajesh", "9876543210", "25/10/2026", "SIP", "Mandate"], STANDARD);
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({ name: "Rajesh", phoneValid: true, date: "2026-10-25" });
  });

  it("rejects missing name and missing/invalid dates", () => {
    expect(validateRow(["", "9876543210", "25/10/2026", "", ""], STANDARD).error).toContain("name");
    expect(validateRow(["Rajesh", "", "", "", ""], STANDARD).error).toContain("missing");
    expect(validateRow(["Rajesh", "", "31/02/2026", "", ""], STANDARD).error).toContain(
      "not a valid",
    );
  });

  it("warns on invalid phone but keeps the row", () => {
    const result = validateRow(["Rajesh", "not-a-number", "25/10/2026", "", ""], STANDARD);
    expect(result.error).toBeNull();
    expect(result.row?.phoneValid).toBe(false);
    expect(result.warning).toContain("checking");
  });

  it("accepts missing phone", () => {
    const result = validateRow(["Rajesh", "", "25/10/2026", "", ""], STANDARD);
    expect(result.error).toBeNull();
    expect(result.row?.phoneValid).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("rejects over-length fields", () => {
    expect(validateRow(["x".repeat(61), "", "25/10/2026", "", ""], STANDARD).error).toContain("60");
    expect(validateRow(["Rajesh", "", "25/10/2026", "x".repeat(41), ""], STANDARD).error).toContain(
      "40",
    );
    expect(
      validateRow(["Rajesh", "", "25/10/2026", "", "x".repeat(201)], STANDARD).error,
    ).toContain("200");
  });

  it("blocks sensitive content without echoing it", () => {
    const pan = "ABCDE1234F";
    const result = validateRow(["Rajesh", "", "25/10/2026", `bring ${pan}`, ""], STANDARD);
    expect(result.error).toContain("sensitive");
    expect(result.error).not.toContain(pan);
  });

  it("reads reordered columns through the header map", () => {
    const map = mapFor(["Note", "Reason", "Next Follow-up", "Mobile", "Client Name"]);
    const result = validateRow(["n", "SIP", "25/10/2026", "9876543210", "Rajesh"], map);
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({ name: "Rajesh", date: "2026-10-25", reason: "SIP" });
  });

  it("handles short rows as missing values", () => {
    expect(validateRow(["Rajesh"], STANDARD).error).toContain("missing");
  });

  it("exposes the 500-row ceiling", () => {
    expect(MAX_DATA_ROWS).toBe(500);
    expect(parseCsv).toBeDefined();
  });
});
