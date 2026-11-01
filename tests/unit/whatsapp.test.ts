import { describe, expect, it } from "vitest";
import { buildCallUrl, buildWhatsAppUrl, normalizePhone } from "@/lib/whatsapp";

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

  it("preserves the bare Indian 10-digit inference for region IN", () => {
    expect(normalizePhone("9876543210", "IN")).toEqual({ ok: true, digits: "919876543210" });
    expect(normalizePhone("09876543210", "IN")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("accepts explicit +country international numbers via E.164", () => {
    expect(normalizePhone("+44 7911 123456", "GB")).toEqual({ ok: true, digits: "447911123456" });
    expect(normalizePhone("+1 555 123 4567", "US")).toEqual({ ok: true, digits: "15551234567" });
    expect(normalizePhone("+61 412 345 678", "AU")).toEqual({ ok: true, digits: "61412345678" });
    expect(normalizePhone("+33 6 12 34 56 78", "FR")).toEqual({ ok: true, digits: "33612345678" });
    expect(normalizePhone("+81 90 1234 5678", "JP")).toEqual({ ok: true, digits: "819012345678" });
    expect(normalizePhone("+65 9123 4567", "SG")).toEqual({ ok: true, digits: "6591234567" });
  });

  it("accepts explicit 00 international prefixes", () => {
    expect(normalizePhone("0044 7911 123456", "GB")).toEqual({ ok: true, digits: "447911123456" });
    expect(normalizePhone("00 61 412 345 678", "AU")).toEqual({ ok: true, digits: "61412345678" });
  });

  it("keeps NANP and already-international bare forms working", () => {
    expect(normalizePhone("15551234567", "US")).toEqual({ ok: true, digits: "15551234567" });
    expect(normalizePhone("447911123456", "GB")).toEqual({ ok: true, digits: "447911123456" });
  });

  it("does not silently make a region-less 10-digit number Indian", () => {
    // Non-IN region: a bare 10-digit number must be rejected, not inferred.
    expect(normalizePhone("5551234567", "US").ok).toBe(false);
    expect(normalizePhone("5551234567", "").ok).toBe(false);
    expect(normalizePhone("0555123456", "GB").ok).toBe(false);
  });

  it("rejects malformed explicit international numbers", () => {
    expect(normalizePhone("+123").ok).toBe(false);
    expect(normalizePhone("+").ok).toBe(false);
    expect(normalizePhone("00").ok).toBe(false);
    expect(normalizePhone("+0 555 123 4567").ok).toBe(false);
    expect(normalizePhone("+9198765432109876").ok).toBe(false); // > 15 digits
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

describe("buildCallUrl", () => {
  it("builds a tel link with international digits", () => {
    expect(buildCallUrl("9876543210")).toBe("tel:+919876543210");
    expect(buildCallUrl("+91 98765 43210")).toBe("tel:+919876543210");
  });

  it("returns null for missing or invalid phones", () => {
    expect(buildCallUrl("")).toBeNull();
    expect(buildCallUrl(undefined)).toBeNull();
    expect(buildCallUrl("123")).toBeNull();
  });
});
