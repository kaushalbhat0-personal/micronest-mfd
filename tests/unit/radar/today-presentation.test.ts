import { describe, expect, it } from "vitest";
import { initialsForName, toneForName } from "@/components/ui/client-avatar";
import { cardClasses } from "@/components/ui/card";
import { severityForWhyKind } from "@/features/radar/components/today-card";
import { todaySignalBadge } from "@/features/radar/components/today-card";

/**
 * RCCF-MFD-33 Phase 1+3: presentation helpers only.
 * Domain ranking/filtering stays covered by today.test.ts and view tests.
 */
describe("initialsForName", () => {
  it("uses the first letters of the first two words", () => {
    expect(initialsForName("Rajesh Sharma")).toBe("RS");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(initialsForName("Madonna")).toBe("MA");
  });

  it("trims extra whitespace", () => {
    expect(initialsForName("  Priya   Mehta ")).toBe("PM");
  });

  it("returns a placeholder for an empty name", () => {
    expect(initialsForName("   ")).toBe("?");
  });
});

describe("toneForName", () => {
  it("is deterministic for the same name", () => {
    expect(toneForName("Rajesh Sharma")).toBe(toneForName("Rajesh Sharma"));
  });

  it("only uses the existing design palette", () => {
    for (const name of ["Asha Mehta", "Bo", "C", " Vikram Reddy-Junior "]) {
      expect(toneForName(name)).toMatch(/bg-(emerald-50|stone-200|amber-100)/);
    }
  });
});

describe("severityForWhyKind", () => {
  it("maps every known why kind without touching domain logic", () => {
    expect(severityForWhyKind("followup-overdue")).toBe("overdue");
    expect(severityForWhyKind("followup-today")).toBe("warning");
    expect(severityForWhyKind("new")).toBe("warning");
    expect(severityForWhyKind("reconnect")).toBe("reconnect");
    expect(severityForWhyKind("recent")).toBe("reconnect");
    expect(severityForWhyKind("followup-upcoming")).toBe("neutral");
    expect(severityForWhyKind(null)).toBe("neutral");
  });
});

describe("todaySignalBadge", () => {
  it("labels every why kind with a palette tone", () => {
    expect(todaySignalBadge("followup-overdue")).toEqual({ label: "Overdue", tone: "red" });
    expect(todaySignalBadge("followup-today")).toEqual({ label: "Due today", tone: "amber" });
    expect(todaySignalBadge("followup-upcoming")).toEqual({ label: "Upcoming", tone: "stone" });
    expect(todaySignalBadge("recent")).toEqual({ label: "Recent", tone: "emerald" });
    expect(todaySignalBadge("reconnect")).toEqual({ label: "Reconnect", tone: "amber" });
    expect(todaySignalBadge("new")).toEqual({ label: "New", tone: "emerald" });
  });
});

describe("cardClasses", () => {
  it("keeps the default padding unchanged", () => {
    expect(cardClasses()).toContain("p-5");
    expect(cardClasses("default")).toContain("p-5");
  });

  it("offers a compact padding for dense cards", () => {
    expect(cardClasses("compact")).toContain("p-4");
    expect(cardClasses("compact")).not.toContain("p-5");
  });
});
