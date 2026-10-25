import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, normalizePhone } from "@/lib/whatsapp";

describe("normalizePhone", () => {
  it("accepts empty input (user picks contact manually)", () => {
    expect(normalizePhone("")).toEqual({ ok: true });
    expect(normalizePhone(undefined)).toEqual({ ok: true });
  });

  it("prefixes 91 for 10-digit numbers", () => {
    expect(normalizePhone("9876543210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("handles +91 and spaced formats", () => {
    expect(normalizePhone("+91 98765 43210")).toEqual({ ok: true, digits: "919876543210" });
    expect(normalizePhone("09876543210")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("rejects letters and short numbers", () => {
    expect(normalizePhone("98ABCD3210").ok).toBe(false);
    expect(normalizePhone("12345").ok).toBe(false);
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me link with phone and encoded text", () => {
    const url = buildWhatsAppUrl("Hello Sharma ji", "9876543210");
    expect(url).toBe("https://wa.me/919876543210?text=Hello%20Sharma%20ji");
  });

  it("builds a contact-picker link when no phone is given", () => {
    const url = buildWhatsAppUrl("Hello");
    expect(url).toBe("https://wa.me/?text=Hello");
  });

  it("returns null for an invalid phone", () => {
    expect(buildWhatsAppUrl("Hello", "123")).toBeNull();
  });

  it("encodes special characters and newlines", () => {
    const url = buildWhatsAppUrl("Line1\nLine2 & more", "9876543210");
    expect(url).toContain("Line1%0ALine2%20%26%20more");
  });
});
