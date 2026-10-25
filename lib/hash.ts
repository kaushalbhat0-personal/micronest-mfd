/**
 * Tiny deterministic content hash (FNV-1a, hex). No dependency.
 * Uniqueness comes from mixing the spreadsheet line number into the input —
 * identical client rows on different lines still get distinct ids.
 */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
