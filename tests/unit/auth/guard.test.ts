import { describe, expect, it } from "vitest";
import { isProtectedPath, loginUrlFor, safeNextPath } from "@/lib/auth/guard";

describe("auth guard", () => {
  it("protects client radar including nested paths", () => {
    expect(isProtectedPath("/tools/client-radar")).toBe(true);
    expect(isProtectedPath("/tools/client-radar/")).toBe(true);
    expect(isProtectedPath("/tools/client-radar/export")).toBe(true);
  });

  it("leaves public routes alone", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/tools/message-studio")).toBe(false);
    expect(isProtectedPath("/tools/followups")).toBe(false);
    expect(isProtectedPath("/auth/callback")).toBe(false);
    expect(isProtectedPath("/tools/client-radar-backup")).toBe(false);
  });

  it("accepts safe same-origin paths", () => {
    expect(safeNextPath("/tools/client-radar")).toBe("/tools/client-radar");
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/login?next=%2Ftools%2Fclient-radar")).toBe(
      "/login?next=%2Ftools%2Fclient-radar",
    );
  });

  it("rejects external, protocol-relative, and malformed destinations", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("http://evil.example/x")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(42)).toBe("/");
  });

  it("builds login urls preserving the requested path", () => {
    expect(loginUrlFor("/tools/client-radar")).toBe("/login?next=%2Ftools%2Fclient-radar");
    expect(loginUrlFor("/tools/client-radar?page=2")).toBe(
      "/login?next=%2Ftools%2Fclient-radar%3Fpage%3D2",
    );
    expect(loginUrlFor("https://evil.example")).toBe("/login?next=%2F");
  });
});
