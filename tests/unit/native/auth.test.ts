import { describe, expect, it, beforeEach } from "vitest";
import {
  parseNativeAuthCallback,
  claimAuthCodeOnce,
  safeNativeNextPath,
  buildNativeRedirectTo,
  __resetProcessedCodesForTests,
} from "@/lib/native/auth";

describe("native auth callback", () => {
  beforeEach(() => __resetProcessedCodesForTests());

  it("accepts safe native post-auth paths", () => {
    expect(safeNativeNextPath("/workspace/today")).toBe("/workspace/today");
    expect(safeNativeNextPath("/workspace/clients/abc")).toBe("/workspace/clients/abc");
    expect(safeNativeNextPath("/tools/message-studio")).toBe("/tools/message-studio");
  });

  it("rejects malicious post-auth destinations", () => {
    const fallback = "/workspace/today";
    expect(safeNativeNextPath("//evil.com")).toBe(fallback);
    expect(safeNativeNextPath("https://evil.com")).toBe(fallback);
    expect(safeNativeNextPath("javascript:alert(1)")).toBe(fallback);
    expect(safeNativeNextPath("/\\/evil")).toBe(fallback);
    expect(safeNativeNextPath("micronest://auth/callback")).toBe(fallback);
  });

  it("parses a valid native callback and validates next", () => {
    const parsed = parseNativeAuthCallback(
      "micronest://auth/callback?code=abc123&next=%2Fworkspace%2Fclients%2Fx",
    );
    expect(parsed).toEqual({ code: "abc123", next: "/workspace/clients/x" });
  });

  it("falls back to default next on malicious next values", () => {
    const parsed = parseNativeAuthCallback(
      "micronest://auth/callback?code=abc123&next=https%3A%2F%2Fevil.com",
    );
    expect(parsed?.next).toBe("/workspace/today");
  });

  it("rejects non-callback schemes and missing codes", () => {
    expect(parseNativeAuthCallback("https://micronestmicrotools.vercel.app/")).toBeNull();
    expect(parseNativeAuthCallback("myapp://auth/callback?code=x")).toBeNull();
    expect(parseNativeAuthCallback("micronest://auth/callback?next=/workspace")).toBeNull();
  });

  it("processes each code exactly once (idempotent)", () => {
    expect(claimAuthCodeOnce("code-1")).toBe(true);
    expect(claimAuthCodeOnce("code-1")).toBe(false);
    expect(claimAuthCodeOnce("code-2")).toBe(true);
  });

  it("builds a native redirectTo confined to the dedicated scheme", () => {
    const redirectTo = buildNativeRedirectTo("/workspace/today");
    expect(redirectTo.startsWith("micronest://auth/callback?next=")).toBe(true);
    expect(buildNativeRedirectTo("https://evil.com")).toContain("next=%2Fworkspace%2Ftoday");
  });
});
