import { describe, expect, it } from "vitest";
import { whySeverityForSignals } from "@/features/radar/components/client-detail";
import type { Signal } from "@/features/radar/types";

/**
 * RCCF-MFD-35: presentation-only severity for the Why-contact box.
 * Domain signals stay owned by signals.ts (computeSignals / reasonsFor).
 */
describe("whySeverityForSignals", () => {
  it("renders reconnect-due as warning", () => {
    expect(whySeverityForSignals(["reconnect-due"])).toBe("warning");
  });

  it("renders new-client as warning", () => {
    expect(whySeverityForSignals(["new-client"])).toBe("warning");
  });

  it("renders recent-only as reconnect", () => {
    expect(whySeverityForSignals(["recent-investor"])).toBe("reconnect");
  });

  it("renders no signal as neutral", () => {
    const empty: Signal[] = [];
    expect(whySeverityForSignals(empty)).toBe("neutral");
  });

  it("prefers warning when signals combine", () => {
    expect(whySeverityForSignals(["recent-investor", "reconnect-due"])).toBe("warning");
    expect(whySeverityForSignals(["recent-investor", "new-client"])).toBe("warning");
  });
});
