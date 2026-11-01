/**
 * User-facing copy for the import flow (receipt + preview). Pure strings,
 * kept in one place so the receipt can be asserted truthful in tests and
 * the wording can never drift between surfaces. Display only — no behavior.
 */

/**
 * Receipt line about matching clients. Truthful by construction: when no
 * update happened it makes no claim that anyone was updated, and it never
 * claims duplication occurred (dedup prevents it).
 */
export function receiptUpdateNote(updated: number): string {
  return updated > 0
    ? "Matching clients were updated with the new information — nothing was duplicated."
    : "Nothing was duplicated.";
}

/**
 * Preview reassurance for pending updates. States the blank-safe rule
 * accurately: matching clients are updated only with filled-in fields;
 * blank cells never erase existing details. (Replaces the old contradictory
 * "nothing will be overwritten" claim.)
 */
export const PREVIEW_UPDATE_NOTE =
  "Matching clients are updated only with the fields you filled in — blank cells never erase existing details.";

/** Preview footer for the pending-import summary (same blank-safe rule). */
export const PREVIEW_BLANK_SAFE_NOTE =
  "Only ready rows and rows to check will be added. Matching clients are updated only with the fields you filled in — blank cells never erase existing details.";
