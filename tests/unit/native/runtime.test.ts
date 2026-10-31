import { describe, expect, it } from "vitest";
import { isNative, nativePlatform, getWebBaseUrl } from "@/lib/native/runtime";

describe("native runtime detection", () => {
  it("is not native on server/tests without a Capacitor global", () => {
    expect(isNative()).toBe(false);
    expect(nativePlatform()).toBe("web");
  });

  it("defaults to the production web base URL", () => {
    expect(getWebBaseUrl()).toContain("micronestmicrotools.vercel.app");
  });
});
