/**
 * Free validation boundary (100 clients). Pure rules only — no I/O, no
 * UI, no persistence. MicroNest is free for up to 100 owned clients while
 * the product is being validated; reaching the boundary routes the user
 * to the WTP research flow (/premium), never to billing.
 *
 * The boundary gates NEW client creation only. Existing records stay
 * fully usable (view, search, edit, contact, follow-ups); updates to
 * existing clients never consume capacity.
 *
 * CONCURRENCY NOTE (accepted for this validation phase): admission is a
 * count-then-insert check, so two tabs racing at 99 can both pass and land
 * at 101. The consequence is bounded — the user simply sees the boundary
 * messaging on the next admission — and an atomic database mechanism
 * (trigger/quota) is deliberately deferred until real billing exists.
 */

/** Maximum owned clients on the free validation tier. Hard boundary. */
export const FREE_CLIENT_LIMIT = 100;

/** Owned count at which the approaching-limit nudge appears (never blocks). */
export const LIMIT_WARNING_THRESHOLD = 90;

/** True once no further NEW clients may be created. */
export function isAtClientLimit(ownedCount: number): boolean {
  return ownedCount >= FREE_CLIENT_LIMIT;
}

/** True in the nudge band: approaching but not yet at the limit. */
export function isApproachingClientLimit(ownedCount: number): boolean {
  return ownedCount >= LIMIT_WARNING_THRESHOLD && ownedCount < FREE_CLIENT_LIMIT;
}

export type ImportAdmission =
  | { allowed: true }
  | {
      allowed: false;
      /** Owned + genuinely new rows: the total the file would reach. */
      wanted: number;
      /** New rows the user must remove to fit: wanted - FREE_CLIENT_LIMIT. */
      overBy: number;
    };

/**
 * Import admission for one file. Updates to existing clients never consume
 * capacity — only genuinely new rows count toward the boundary.
 */
export function importAdmission(ownedCount: number, newRowCount: number): ImportAdmission {
  const wanted = ownedCount + newRowCount;
  if (wanted <= FREE_CLIENT_LIMIT) return { allowed: true };
  return { allowed: false, wanted, overBy: wanted - FREE_CLIENT_LIMIT };
}
