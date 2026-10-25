import { describe, expect, it } from "vitest";
import { detectSensitiveInput } from "@/features/message-studio/sensitive";
import {
  CUSTOM_MESSAGE_MAX_LENGTH,
  countChars,
  validateCustomMessage,
} from "@/features/message-studio/validation";

describe("countChars", () => {
  it("counts Unicode code points, not UTF-16 units", () => {
    expect(countChars("abc")).toBe(3);
    // Surrogate pairs: .length would give 2 / 5 here.
    expect(countChars("😊")).toBe(1);
    expect(countChars("Hi 👋")).toBe(4);
    // Devanagari passes through without special-casing.
    expect(countChars("नमस्कार")).toBeGreaterThan(0);
  });
});

describe("validateCustomMessage", () => {
  it("rejects empty and whitespace-only messages", () => {
    expect(validateCustomMessage("").ok).toBe(false);
    expect(validateCustomMessage("").error).toBeTruthy();
    expect(validateCustomMessage("   \n  ").ok).toBe(false);
  });

  it("accepts ordinary and native-language messages unchanged", () => {
    for (const text of [
      "Hello Rahul, please check your SIP mandate.",
      "नमस्कार राहुल जी, आपका SIP अगले हफ्ते process होना है.",
      "नमस्कार, कसे आहात?",
      "Rahul bhai 😊 kal mandate check kar lena.",
      "Hello राहुल 👋\nSecond line here.",
    ]) {
      const result = validateCustomMessage(text);
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(result.sensitive).toEqual([]);
    }
  });

  it("accepts exactly 1000 characters and rejects 1001", () => {
    expect(validateCustomMessage("a".repeat(1000)).ok).toBe(true);
    const over = validateCustomMessage("a".repeat(1001));
    expect(over.ok).toBe(false);
    expect(over.error).toContain("1000");
  });

  it("counts emoji as single characters toward the limit", () => {
    expect(validateCustomMessage("😊".repeat(1000)).ok).toBe(true);
    expect(validateCustomMessage("😊".repeat(1001)).ok).toBe(false);
    expect(CUSTOM_MESSAGE_MAX_LENGTH).toBe(1000);
  });

  it("uses the existing sensitive-data detector", () => {
    const pan = validateCustomMessage("Please share PAN ABCDE1234F here");
    expect(pan.ok).toBe(false);
    expect(pan.sensitive.length).toBeGreaterThan(0);

    const otp = validateCustomMessage("Share your OTP 482913");
    expect(otp.ok).toBe(false);

    // Detector identity check: same hit as calling it directly.
    expect(pan.sensitive[0]).toEqual(
      detectSensitiveInput("message", "Please share PAN ABCDE1234F here"),
    );
  });
});
