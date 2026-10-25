import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS, loadPrefs } from "@/features/message-studio/prefs";

function mockWindow(stored: string | null, { throwing = false } = {}) {
  const getItem = throwing
    ? () => {
        throw new Error("denied");
      }
    : () => stored;
  vi.stubGlobal("window", {
    localStorage: { getItem, setItem: () => {}, removeItem: () => {} },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPrefs", () => {
  it("returns defaults when storage holds valid prefs", () => {
    mockWindow(
      JSON.stringify({
        mode: "custom",
        purpose: "review-invite",
        language: "hinglish",
        tone: "friendly",
        arn: "ARN-1",
        includeDisclosure: true,
      }),
    );
    expect(loadPrefs()).toEqual({
      mode: "custom",
      purpose: "review-invite",
      language: "hinglish",
      tone: "friendly",
      arn: "ARN-1",
      includeDisclosure: true,
    });
  });

  it("falls back to defaults on malformed JSON or unknown values", () => {
    mockWindow("{not-json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);

    mockWindow(JSON.stringify({ purpose: "nope", language: "french", tone: 42, arn: 7 }));
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("falls back to defaults when storage is unavailable or window is absent", () => {
    mockWindow(null, { throwing: true });
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    // No window stubbed here (afterEach removed it): SSR path.
    vi.unstubAllGlobals();
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
