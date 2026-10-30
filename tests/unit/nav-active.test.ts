import { describe, expect, test } from "vitest";
import { activeDestination } from "@/lib/nav";

describe("activeDestination", () => {
  test("today owns the queue route only", () => {
    // usePathname() never carries a query string; legacy ?filter= values
    // are handled by the page, not the nav.
    expect(activeDestination("/workspace/today")).toBe("today");
  });

  test("clients owns the directory and detail routes", () => {
    expect(activeDestination("/workspace/clients")).toBe("clients");
    expect(activeDestination("/workspace/clients/123e4567-e89b-42d3-a456-426614174000")).toBe(
      "clients",
    );
  });

  test("studio owns the message studio route", () => {
    expect(activeDestination("/tools/message-studio")).toBe("studio");
    expect(activeDestination("/tools/message-studio/custom")).toBe("studio");
  });

  test("marketing, login, and unknown routes own nothing", () => {
    expect(activeDestination("/")).toBeNull();
    expect(activeDestination("/login")).toBeNull();
    expect(activeDestination("/login?next=%2Fworkspace%2Ftoday")).toBeNull();
    expect(activeDestination("/auth/callback")).toBeNull();
    expect(activeDestination(null)).toBeNull();
  });
});
