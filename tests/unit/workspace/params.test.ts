import { describe, expect, it } from "vitest";
import { isValidClientId } from "@/lib/workspace/params";

describe("workspace client id", () => {
  it("accepts well-formed opaque uuids", () => {
    expect(isValidClientId("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isValidClientId("123E4567-E89B-42D3-A456-426614174000")).toBe(true);
  });

  it("rejects names, phone numbers, and other client data in URLs", () => {
    expect(isValidClientId("Rajesh Sharma")).toBe(false);
    expect(isValidClientId("9876543210")).toBe(false);
    expect(isValidClientId("+919876543210")).toBe(false);
    expect(isValidClientId("")).toBe(false);
    expect(isValidClientId(null)).toBe(false);
    expect(isValidClientId(undefined)).toBe(false);
    expect(isValidClientId(42)).toBe(false);
  });

  it("rejects malformed or traversive input", () => {
    expect(isValidClientId("../etc/passwd")).toBe(false);
    expect(isValidClientId("123e4567-e89b-42d3-a456-42661417400")).toBe(false);
    expect(isValidClientId("not-a-uuid-at-all-0000")).toBe(false);
    expect(isValidClientId("123e4567-e89b-42d3-a456-426614174000;DROP")).toBe(false);
  });
});
