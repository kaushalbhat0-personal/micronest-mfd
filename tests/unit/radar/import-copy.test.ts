import { describe, expect, it } from "vitest";
import {
  PREVIEW_BLANK_SAFE_NOTE,
  PREVIEW_UPDATE_NOTE,
  receiptUpdateNote,
} from "@/features/radar/import/copy";

describe("receiptUpdateNote", () => {
  it("claims matching clients were updated only when updates happened", () => {
    expect(receiptUpdateNote(2)).toMatch(/updated/i);
    expect(receiptUpdateNote(1)).toMatch(/updated/i);
  });

  it("makes no update claim when zero updates occurred", () => {
    expect(receiptUpdateNote(0)).not.toMatch(/were updated/i);
    // Truthful: still never claims duplication.
    expect(receiptUpdateNote(0)).toMatch(/duplicated/i);
    expect(receiptUpdateNote(3)).toMatch(/nothing was duplicated/i);
  });
});

describe("preview copy (blank-safe update wording)", () => {
  it("replaces the contradictory 'nothing will be overwritten' claim", () => {
    expect(PREVIEW_UPDATE_NOTE).not.toMatch(/will be overwritten/i);
    expect(PREVIEW_BLANK_SAFE_NOTE).not.toMatch(/will be overwritten/i);
    expect(PREVIEW_UPDATE_NOTE).not.toMatch(/nothing already in your clients/i);
  });

  it("states the blank-safe rule accurately", () => {
    for (const copy of [PREVIEW_UPDATE_NOTE, PREVIEW_BLANK_SAFE_NOTE]) {
      expect(copy).toMatch(/only with the fields you filled in/i);
      expect(copy).toMatch(/never erase existing details/i);
    }
  });
});
