import { describe, expect, it } from "vitest";
import {
  isProtectedPath,
  loginUrlFor,
  resolvePostLoginDestination,
  safeNextPath,
} from "@/lib/auth/guard";

describe("auth guard", () => {
  it("protects the workspace including nested client routes", () => {
    expect(isProtectedPath("/workspace")).toBe(true);
    expect(isProtectedPath("/workspace/")).toBe(true);
    expect(isProtectedPath("/workspace/today")).toBe(true);
    expect(isProtectedPath("/workspace/clients")).toBe(true);
    expect(isProtectedPath("/workspace/clients/123")).toBe(true);
  });

  it("leaves public routes alone", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/tools/message-studio")).toBe(false);
    expect(isProtectedPath("/auth/callback")).toBe(false);
    expect(isProtectedPath("/workspace-backup")).toBe(false);
  });

  it("no longer protects the retired standalone tool routes", () => {
    expect(isProtectedPath("/tools/client-radar")).toBe(false);
    expect(isProtectedPath("/tools/followups")).toBe(false);
  });

  it("accepts safe same-origin paths", () => {
    expect(safeNextPath("/workspace/today")).toBe("/workspace/today");
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/login?next=%2Fworkspace%2Ftoday")).toBe(
      "/login?next=%2Fworkspace%2Ftoday",
    );
  });

  it("rejects external, protocol-relative, and malformed destinations", () => {
    expect(safeNextPath("https://evil.example")).toBe("/workspace/today");
    expect(safeNextPath("http://evil.example/x")).toBe("/workspace/today");
    expect(safeNextPath("//evil.example")).toBe("/workspace/today");
    expect(safeNextPath("/\\evil.example")).toBe("/workspace/today");
    expect(safeNextPath("javascript:alert(1)")).toBe("/workspace/today");
    expect(safeNextPath("")).toBe("/workspace/today");
    expect(safeNextPath(null)).toBe("/workspace/today");
    expect(safeNextPath(undefined)).toBe("/workspace/today");
    expect(safeNextPath(42)).toBe("/workspace/today");
  });

  it("supports an explicit fallback for non-auth contexts", () => {
    expect(safeNextPath(undefined, "/")).toBe("/");
    expect(safeNextPath("https://evil.example", "/")).toBe("/");
  });

  it("builds login urls preserving the requested path", () => {
    expect(loginUrlFor("/workspace/today")).toBe("/login?next=%2Fworkspace%2Ftoday");
    expect(loginUrlFor("/workspace/clients?page=2")).toBe(
      "/login?next=%2Fworkspace%2Fclients%3Fpage%3D2",
    );
    expect(loginUrlFor("https://evil.example")).toBe("/login?next=%2Fworkspace%2Ftoday");
  });

  it("routes admins to /admin when no explicit destination was requested", () => {
    expect(resolvePostLoginDestination(null, true)).toBe("/admin");
    expect(resolvePostLoginDestination("", true)).toBe("/admin");
    expect(resolvePostLoginDestination(undefined, true)).toBe("/admin");
  });

  it("routes normal users to the workspace by default", () => {
    expect(resolvePostLoginDestination(null, false)).toBe("/workspace/today");
    expect(resolvePostLoginDestination("", false)).toBe("/workspace/today");
  });

  it("honors an explicit safe destination for admins and users", () => {
    expect(resolvePostLoginDestination("/admin/users", true)).toBe("/admin/users");
    expect(resolvePostLoginDestination("/workspace/clients", false)).toBe("/workspace/clients");
    expect(resolvePostLoginDestination("/admin/users?page=2", true)).toBe("/admin/users?page=2");
  });

  it("ignores unsafe destinations and falls back by role", () => {
    expect(resolvePostLoginDestination("https://evil.example", true)).toBe("/admin");
    expect(resolvePostLoginDestination("https://evil.example", false)).toBe("/workspace/today");
    expect(resolvePostLoginDestination("//evil.example", true)).toBe("/admin");
    expect(resolvePostLoginDestination("/\\evil.example", false)).toBe("/workspace/today");
  });

  it("treats revoked admins as normal users", () => {
    expect(resolvePostLoginDestination(null, false)).toBe("/workspace/today");
    expect(resolvePostLoginDestination("/workspace/today", false)).toBe("/workspace/today");
  });
});
