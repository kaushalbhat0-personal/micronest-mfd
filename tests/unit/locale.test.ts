import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCALE, DEFAULT_REGION, resolveLocale, resolveRegion } from "@/lib/locale";
import { resolveVerticalContext } from "@/lib/vertical";

function stubNavigator(language: string): void {
  vi.stubGlobal("navigator", { language });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveRegion", () => {
  it("resolves a region-specific locale to its region", () => {
    stubNavigator("en-IN");
    expect(resolveRegion()).toBe("IN");
    stubNavigator("en-US");
    expect(resolveRegion()).toBe("US");
    stubNavigator("en-GB");
    expect(resolveRegion()).toBe("GB");
    stubNavigator("en-AU");
    expect(resolveRegion()).toBe("AU");
    stubNavigator("fr-FR");
    expect(resolveRegion()).toBe("FR");
    stubNavigator("ja-JP");
    expect(resolveRegion()).toBe("JP");
    stubNavigator("hi-IN");
    expect(resolveRegion()).toBe("IN");
  });

  it("does not silently assume India for a region-less locale", () => {
    stubNavigator("en");
    expect(resolveRegion()).not.toBe("IN");
    stubNavigator("fr");
    expect(resolveRegion()).not.toBe("IN");
    stubNavigator("ja");
    expect(resolveRegion()).not.toBe("IN");
  });

  it("keeps the pinned India default on the server / no-navigator path", () => {
    // No navigator → resolveLocale falls back to the MFD-compatible default.
    expect(resolveLocale()).toBe(DEFAULT_LOCALE);
    expect(resolveRegion()).toBe(DEFAULT_REGION);
  });

  it("drives the vertical presentation off the resolved region", () => {
    stubNavigator("en-IN");
    expect(resolveVerticalContext()).toBe("mfd");
    stubNavigator("en");
    expect(resolveVerticalContext()).toBe("generic");
    stubNavigator("en-US");
    expect(resolveVerticalContext()).toBe("generic");
  });
});
