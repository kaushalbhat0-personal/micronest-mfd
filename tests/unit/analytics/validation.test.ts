import { describe, expect, it } from "vitest";
import { parsePerfBeacon } from "@/lib/perf/schema";
import { milestonesCrossed, CLIENT_MILESTONES } from "@/lib/analytics";
import { formatMoneyMinor, formatDateLocale, resolveRegion } from "@/lib/locale";
import { formatDisplayDate } from "@/lib/dates";
import { formatAmountPaise } from "@/features/radar/template";
import { normalizePhone } from "@/lib/whatsapp";

describe("validation beacon schema (MFD-72)", () => {
  it("accepts milestone, signup, active, template, and import events", () => {
    expect(parsePerfBeacon({ op: "validation.event", event: "signup" })).toEqual({
      op: "validation.event",
      event: "signup",
    });
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "client_count_10",
        milestone: 10,
        clientCount: 12,
      }),
    ).toEqual({
      op: "validation.event",
      event: "client_count_10",
      milestone: 10,
      clientCount: 12,
    });
    expect(
      parsePerfBeacon({ op: "validation.event", event: "workspace_active" }),
    ).toEqual({ op: "validation.event", event: "workspace_active" });
  });

  it("rejects unknown events, extra fields, and bad milestones", () => {
    expect(parsePerfBeacon({ op: "validation.event", event: "willingness_to_pay" })).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "signup", clientName: "Asha" }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "signup", phone: "9876543210" }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "signup", note: "hello" }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "client_count_10", milestone: 11 }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "signup", clientCount: -1 }),
    ).toBeNull();
  });
});

describe("milestone transitions (MFD-72)", () => {
  it("covers the 1/10/50/99/100 milestone set", () => {
    expect([...CLIENT_MILESTONES]).toEqual([1, 10, 50, 99, 100]);
  });

  it("fires each crossed milestone exactly once per transition", () => {
    expect(milestonesCrossed(0, 1)).toEqual([1]);
    expect(milestonesCrossed(9, 10)).toEqual([10]);
    expect(milestonesCrossed(9, 55)).toEqual([10, 50]);
    expect(milestonesCrossed(0, 120)).toEqual([1, 10, 50, 99, 100]);
  });

  it("never fires on re-renders, refetches, or shrinkage", () => {
    expect(milestonesCrossed(10, 10)).toEqual([]);
    expect(milestonesCrossed(12, 12)).toEqual([]);
    expect(milestonesCrossed(55, 54)).toEqual([]);
    expect(milestonesCrossed(100, 100)).toEqual([]);
    expect(milestonesCrossed(101, 150)).toEqual([]);
  });
});

describe("locale money presentation (MFD-72)", () => {
  it("preserves exact MFD/INR output by default", () => {
    expect(formatMoneyMinor(500000)).toBe("₹5,000");
    expect(formatMoneyMinor(500050)).toBe("₹5,000.50");
    expect(formatMoneyMinor(20000000)).toBe("₹2,00,000");
    expect(formatAmountPaise(500000)).toBe("₹5,000");
    expect(formatAmountPaise(20000000)).toBe("₹2,00,000");
  });

  it("supports an alternate locale/currency without touching storage", () => {
    const formatted = formatMoneyMinor(500000, { locale: "en-US", currency: "USD" });
    expect(formatted).not.toBe("₹5,000");
    expect(formatted).toContain("5,000");
    expect(formatAmountPaise(500000, { locale: "en-US", currency: "USD" })).toBe(formatted);
  });
});

describe("locale date presentation (MFD-72)", () => {
  it("keeps DD/MM/YYYY by default so storage and CSV stay stable", () => {
    expect(formatDisplayDate("2026-10-25")).toBe("25/10/2026");
    expect(formatDateLocale("2026-10-25")).toBe("25/10/2026");
  });

  it("renders locale-aware dates when asked", () => {
    expect(formatDateLocale("2026-10-25", "en-US")).toBe("10/25/2026");
    expect(formatDisplayDate("2026-10-25", "en-US")).toBe("10/25/2026");
  });

  it("passes stored values through unchanged when malformed", () => {
    expect(formatDateLocale("not-a-date")).toBe("not-a-date");
  });
});

describe("international-safe phone normalization (MFD-72)", () => {
  it("keeps the +91 inference for India (default) — MFD unchanged", () => {
    expect(normalizePhone("9876543210")).toEqual({ ok: true, digits: "919876543210" });
    expect(normalizePhone("9876543210", "IN")).toEqual({ ok: true, digits: "919876543210" });
    expect(normalizePhone("09876543210", "IN")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("accepts explicit international numbers in every region", () => {
    expect(normalizePhone("+1 5551234567", "US")).toEqual({ ok: true, digits: "15551234567" });
    expect(normalizePhone("+44 7700900123", "GB")).toEqual({ ok: true, digits: "447700900123" });
    expect(normalizePhone("+91 98765 43210", "US")).toEqual({ ok: true, digits: "919876543210" });
  });

  it("never silently 91-prefixes an ambiguous number outside India", () => {
    const result = normalizePhone("9876543210", "US");
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("digits");
    expect(normalizePhone("09876543210", "US").ok).toBe(false);
  });

  it("still rejects letters and short numbers everywhere", () => {
    expect(normalizePhone("98ABCD3210", "US").ok).toBe(false);
    expect(normalizePhone("12345", "IN").ok).toBe(false);
    expect(normalizePhone("12345", "US").ok).toBe(false);
  });

  it("resolves a region without crashing when navigator is absent", () => {
    expect(["IN", resolveRegion()].length).toBe(2);
  });
});
