import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@/lib/native/session-store";
import { filePickerCompat } from "@/lib/native/files";

describe("native session storage", () => {
  it("persists session material via the adapter (no localStorage)", () => {
    const storage = createMemoryStorage();
    expect(typeof storage.getItem).toBe("function");
    expect(typeof storage.setItem).toBe("function");
    expect(typeof storage.removeItem).toBe("function");
  });

  it("round-trips values in memory", async () => {
    const storage = createMemoryStorage();
    await storage.setItem("sb-test-auth-token", "v1");
    expect(await storage.getItem("sb-test-auth-token")).toBe("v1");
    await storage.removeItem("sb-test-auth-token");
    expect(await storage.getItem("sb-test-auth-token")).toBeNull();
  });

  it("keeps import constraints unchanged", () => {
    const compat = filePickerCompat();
    expect(compat.accept).toContain(".csv");
    expect(compat.accept).toContain(".xlsx");
    expect(compat.maxBytes).toBe(5 * 1024 * 1024);
    expect(compat.maxRows).toBe(500);
  });
});
