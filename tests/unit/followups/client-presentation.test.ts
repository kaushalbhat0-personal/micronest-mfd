import { describe, expect, it } from "vitest";
import { followupStatusTone } from "@/features/followups/components/client-followups";

/**
 * RCCF-MFD-51: presentation-only tone for the open-row status word.
 * Status words come from getFollowUpStatus + dueWords; this only maps
 * the status to a restrained text tone. Text carries the meaning.
 */
describe("followupStatusTone", () => {
  it("marks overdue strongest, today amber, upcoming neutral", () => {
    expect(followupStatusTone("overdue")).toBe("text-red-800");
    expect(followupStatusTone("today")).toBe("text-amber-800");
    expect(followupStatusTone("upcoming")).toBe("text-stone-500");
  });
});
