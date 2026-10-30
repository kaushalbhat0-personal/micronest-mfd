import { describe, expect, it } from "vitest";
import {
  detectDuplicates,
  duplicateMobileKey,
  identityOf,
  normalizeDuplicateName,
} from "@/features/radar/import/duplicates";

describe("duplicate keys", () => {
  it("normalizes names case- and space-insensitively", () => {
    expect(normalizeDuplicateName("  Rajesh   Sharma ")).toBe("rajesh sharma");
  });

  it("prefers 91-prefixed digits for mobiles", () => {
    expect(duplicateMobileKey("9876543210")).toBe("919876543210");
    expect(duplicateMobileKey("+91 98765 43210")).toBe("919876543210");
    expect(duplicateMobileKey("abc")).toBeNull();
  });
});

describe("detectDuplicates", () => {
  it("flags repeats within the file, first occurrence wins", () => {
    const rows = ["Rajesh Sharma", "rajesh  sharma", "Asha"].map((name) =>
      identityOf(name, "9876543210"),
    );
    // Same mobile on every row: rows 2+ duplicate row 1.
    const flagged = detectDuplicates(
      rows.map((identity) => ({ identity })),
      [],
    );
    expect(flagged).toEqual([false, true, true]);
  });

  it("flags an existing client by mobile even when the name differs", () => {
    const flagged = detectDuplicates(
      [{ identity: identityOf("New Name", "9876543210") }],
      [identityOf("Old Name", "+91 98765 43210")],
    );
    expect(flagged).toEqual([true]);
  });

  it("matches name-only rows by exact normalized name", () => {
    const flagged = detectDuplicates(
      [{ identity: identityOf("  Asha  ", "") }],
      [identityOf("asha", "")],
    );
    expect(flagged).toEqual([true]);
  });

  it("never fuzzy-matches different people", () => {
    const flagged = detectDuplicates(
      [{ identity: identityOf("Rajesh Sharma", "") }],
      [identityOf("Rajesh Verma", "")],
    );
    expect(flagged).toEqual([false]);
  });

  it("ignores rows with neither name nor mobile", () => {
    const flagged = detectDuplicates([{ identity: identityOf("", "") }], []);
    expect(flagged).toEqual([false]);
  });
});
