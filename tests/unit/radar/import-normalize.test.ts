import { describe, expect, it } from "vitest";
import { normalizeImportDate, cellToText } from "@/features/radar/import/normalize";

describe("normalizeImportDate", () => {
  it("passes DD/MM/YYYY through", () => {
    expect(normalizeImportDate("25/10/2026")).toBe("25/10/2026");
    expect(normalizeImportDate(" 01/02/2026 ")).toBe("01/02/2026");
  });

  it("converts DD-MM-YYYY separators", () => {
    expect(normalizeImportDate("25-10-2026")).toBe("25/10/2026");
  });

  it("reorders YYYY-MM-DD", () => {
    expect(normalizeImportDate("2026-10-25")).toBe("25/10/2026");
  });

  it("converts Excel serial numbers", () => {
    // 2026-10-25 as an Excel serial.
    expect(normalizeImportDate(46320)).toBe("25/10/2026");
  });

  it("leaves non-dates for the strict validator to reject", () => {
    expect(normalizeImportDate("not a date")).toBe("not a date");
    expect(normalizeImportDate(true)).toBe("1");
  });

  it("treats blank and null as empty", () => {
    expect(normalizeImportDate("")).toBe("");
    expect(normalizeImportDate("   ")).toBe("");
    expect(normalizeImportDate(null)).toBe("");
  });
});

describe("cellToText", () => {
  it("coerces typed cells without inventing digits", () => {
    expect(cellToText("  Rajesh  ")).toBe("Rajesh");
    expect(cellToText(9876543210)).toBe("9876543210");
    expect(cellToText(true)).toBe("true");
    expect(cellToText(false)).toBe("false");
    expect(cellToText(null)).toBe("");
  });
});
