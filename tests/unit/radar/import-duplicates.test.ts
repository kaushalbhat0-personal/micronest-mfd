import { describe, expect, it } from "vitest";
import {
  classifyDuplicates,
  detectDuplicates,
  duplicateMobileKey,
  duplicateReasonText,
  identityOf,
  manualDuplicateCopy,
  matchExisting,
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

describe("matchExisting (shared by manual Add and import)", () => {
  it("blocks the same mobile even when the name differs", () => {
    const hit = matchExisting(identityOf("New Name", "9876543210"), [
      identityOf("Old Name", "+91 98765 43210"),
    ]);
    expect(hit).toEqual({ index: 0, kind: "mobile" });
  });

  it("blocks the same normalized name when mobile is unavailable", () => {
    const hit = matchExisting(identityOf("  Rahul   Sharma ", ""), [
      identityOf("rahul sharma", ""),
    ]);
    expect(hit).toEqual({ index: 0, kind: "name" });
  });

  it("does not block similar-but-different names", () => {
    expect(
      matchExisting(identityOf("Rajesh Sharma", ""), [identityOf("Rajesh Verma", "")]),
    ).toBeNull();
  });

  it("does not block the same name with a different valid mobile", () => {
    // Deterministic policy: a candidate carrying a mobile matches on mobile only.
    expect(
      matchExisting(identityOf("Rahul Sharma", "9811111111"), [
        identityOf("Rahul Sharma", "9876543210"),
      ]),
    ).toBeNull();
  });

  it("keeps blank-mobile rows with different names distinct", () => {
    expect(matchExisting(identityOf("Asha", ""), [identityOf("Meera", "")])).toBeNull();
  });

  it("only sees the provided book — another user's rows cannot match", () => {
    // Isolation is enforced by scoping: the matcher receives only the
    // caller's RLS-loaded identities, so an empty book never matches.
    expect(matchExisting(identityOf("Rahul Sharma", "9876543210"), [])).toBeNull();
    expect(matchExisting(identityOf("Rahul Sharma", ""), [])).toBeNull();
  });
});

describe("classifyDuplicates", () => {
  it("marks the first file occurrence kept and later repeats as file duplicates", () => {
    const out = classifyDuplicates(
      [identityOf("Rahul Sharma", "9876543210"), identityOf("Rahul Sharma", "9876543210")],
      [],
      [4, 11],
    );
    expect(out[0].duplicate).toBe(false);
    expect(out[1]).toMatchObject({ duplicate: true, scope: "file", kind: "mobile", firstLine: 4 });
  });

  it("prefers the book match when a row matches both the book and the file", () => {
    const out = classifyDuplicates(
      [identityOf("A", "9876543210"), identityOf("B", "9876543210")],
      [identityOf("Book Owner", "9876543210")],
      [4, 11],
    );
    expect(out[0]).toMatchObject({ duplicate: true, scope: "book", kind: "mobile" });
    expect(out[1]).toMatchObject({ duplicate: true, scope: "book", kind: "mobile" });
  });

  it("classifies name-only file repeats by client name", () => {
    const out = classifyDuplicates([identityOf("Asha", ""), identityOf("asha", "")], [], [4, 11]);
    expect(out[1]).toMatchObject({ duplicate: true, scope: "file", kind: "name", firstLine: 4 });
  });
});

describe("duplicate copy", () => {
  it("states the match basis without echoing values", () => {
    expect(duplicateReasonText("book", "mobile")).toContain("Matched by mobile number");
    expect(duplicateReasonText("book", "name")).toContain("Matched by client name");
    expect(duplicateReasonText("file", "mobile", 4)).toContain("row 4");
    expect(duplicateReasonText("file", "name", 11)).toContain("Matched by client name");
  });

  it("uses the required manual-Add titles", () => {
    expect(manualDuplicateCopy("mobile", "Rahul Sharma").title).toBe("This client already exists");
    expect(manualDuplicateCopy("name", "Rahul Sharma").title).toBe(
      "A client with this name already exists",
    );
  });
});
