import { describe, expect, it } from "vitest";
import { signalPillForRecord } from "@/features/radar/components/clients-workspace";
import type { Signal } from "@/features/radar/types";

function pillFor(signals: Signal[]) {
  return signalPillForRecord({ signals });
}

/**
 * RCCF-MFD-34: presentation-only pill mapping. Domain signals stay owned
 * by signals.ts (computeSignals / radarPriorityClass).
 */
describe("signalPillForRecord", () => {
  it("shows Recent for recent investors", () => {
    expect(pillFor(["recent-investor"])?.label).toBe("Recent");
  });

  it("shows New for new clients", () => {
    expect(pillFor(["new-client"])?.label).toBe("New");
  });

  it("shows Reconnect when reconnect is due", () => {
    expect(pillFor(["reconnect-due"])?.label).toBe("Reconnect");
  });

  it("shows no pill when the client carries no signal", () => {
    expect(pillFor([])).toBeNull();
  });

  it("shows at most one pill following domain priority (recent, new, reconnect)", () => {
    expect(pillFor(["recent-investor", "reconnect-due", "new-client"])?.label).toBe("Recent");
    expect(pillFor(["new-client", "reconnect-due"])?.label).toBe("New");
  });

  it("carries a text label so status is never color-only", () => {
    for (const signals of [["recent-investor"], ["new-client"], ["reconnect-due"]] as Signal[][]) {
      const pill = pillFor(signals);
      expect(pill?.label.length).toBeGreaterThan(0);
      expect(pill?.className.length).toBeGreaterThan(0);
    }
  });
});
