/**
 * Route-param helpers for the workspace (RCCF-MFD-18 Phase A).
 *
 * Only opaque identifiers may appear in workspace URLs — never client names,
 * phone numbers, notes, or other client data. These pure helpers keep that
 * rule unit-testable without a router or database.
 */

/** radar_clients ids are uuid v1–v8 (gen_random_uuid produces v4). */
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only for a well-formed opaque client identifier. */
export function isValidClientId(value: unknown): boolean {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value);
}
