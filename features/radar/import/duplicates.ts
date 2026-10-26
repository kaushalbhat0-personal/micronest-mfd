import { normalizePhone } from "@/lib/whatsapp";

/**
 * Duplicate detection (RCCF-MFD-44). Conservative by design: normalized
 * mobile match first, exact normalized-name match only when mobile is
 * unavailable. No fuzzy name matching — two different people must never
 * merge.
 */

export function normalizeDuplicateName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 91-prefixed digits for a valid Indian mobile, else null. */
export function duplicateMobileKey(phone: string): string | null {
  const result = normalizePhone(phone);
  if (!result.ok || !result.digits) return null;
  return result.digits;
}

export interface DuplicateIdentity {
  mobileKey: string | null;
  nameKey: string;
}

export function identityOf(name: string, phone: string): DuplicateIdentity {
  return { mobileKey: duplicateMobileKey(phone.trim()), nameKey: normalizeDuplicateName(name) };
}

/**
 * Splits candidate rows into new vs already-seen. Matching priority:
 * normalized mobile first; exact normalized name only when the incoming
 * row has no mobile. No fuzzy matching — two different people with
 * different mobiles never merge, even on identical names.
 */
export function detectDuplicates(
  candidates: Array<{ identity: DuplicateIdentity }>,
  existing: DuplicateIdentity[],
): boolean[] {
  const ownedMobile = new Set<string>();
  const ownedName = new Set<string>();
  for (const identity of existing) {
    if (identity.mobileKey) ownedMobile.add(identity.mobileKey);
    if (identity.nameKey.length > 0) ownedName.add(identity.nameKey);
  }
  const seenMobile = new Set<string>();
  const seenName = new Set<string>();
  return candidates.map(({ identity }) => {
    if (identity.mobileKey) {
      if (ownedMobile.has(identity.mobileKey) || seenMobile.has(identity.mobileKey)) return true;
      seenMobile.add(identity.mobileKey);
      return false;
    }
    if (identity.nameKey.length === 0) return false;
    if (ownedName.has(identity.nameKey) || seenName.has(identity.nameKey)) return true;
    seenName.add(identity.nameKey);
    return false;
  });
}
