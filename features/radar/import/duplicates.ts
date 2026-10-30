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

/** How a candidate matched an existing/file row. Mobile wins; name is fallback only. */
export type DuplicateMatchKind = "mobile" | "name";

export interface DuplicateMatch {
  index: number;
  kind: DuplicateMatchKind;
}

/**
 * Single source of truth for pairwise matching. Priority: normalized mobile
 * first; exact normalized name only when the candidate has no usable mobile.
 * Never fuzzy — different mobiles never merge, even on identical names.
 */
export function matchKind(
  candidate: DuplicateIdentity,
  target: DuplicateIdentity,
): DuplicateMatchKind | null {
  if (candidate.mobileKey) {
    return target.mobileKey !== null && target.mobileKey === candidate.mobileKey ? "mobile" : null;
  }
  if (candidate.nameKey.length === 0) return null;
  return target.nameKey === candidate.nameKey ? "name" : null;
}

/** First existing identity that matches the candidate, if any. */
export function matchExisting(
  candidate: DuplicateIdentity,
  existing: DuplicateIdentity[],
): DuplicateMatch | null {
  for (let i = 0; i < existing.length; i += 1) {
    const kind = matchKind(candidate, existing[i]);
    if (kind) return { index: i, kind };
  }
  return null;
}

export type DuplicateScope = "book" | "file";

export interface ClassifiedDuplicate {
  duplicate: boolean;
  scope: DuplicateScope | null;
  kind: DuplicateMatchKind | null;
  /** 1-based source line of the first occurrence (file scope only). */
  firstLine: number | null;
  /** Index into `existing` (book scope) or the prior candidate (file scope). */
  matchIndex: number | null;
}

/**
 * Classifies every candidate against the existing book and earlier rows in
 * the same file. Book matches win over file repeats; first occurrence wins
 * within the file. Semantics mirror detectDuplicates exactly (mobile rows
 * only match on mobile; name-only rows only match on exact name) so the
 * preview and the boolean helper can never disagree. Used by the import
 * preview; the manual Add guard reuses matchExisting (book scope) from the
 * same module so both surfaces share one engine.
 */
export function classifyDuplicates(
  candidates: DuplicateIdentity[],
  existing: DuplicateIdentity[],
  lines: number[],
): ClassifiedDuplicate[] {
  const ownedMobile = new Set<string>();
  const ownedName = new Set<string>();
  for (const identity of existing) {
    if (identity.mobileKey) ownedMobile.add(identity.mobileKey);
    if (identity.nameKey.length > 0) ownedName.add(identity.nameKey);
  }
  const seenMobile = new Set<string>();
  const seenName = new Set<string>();
  const firstMobileLine = new Map<string, number>();
  const firstNameLine = new Map<string, number>();
  return candidates.map((candidate, i) => {
    if (candidate.mobileKey) {
      if (ownedMobile.has(candidate.mobileKey)) {
        return {
          duplicate: true,
          scope: "book",
          kind: "mobile",
          firstLine: null,
          matchIndex: null,
        };
      }
      if (seenMobile.has(candidate.mobileKey)) {
        return {
          duplicate: true,
          scope: "file",
          kind: "mobile",
          firstLine: firstMobileLine.get(candidate.mobileKey) ?? null,
          matchIndex: null,
        };
      }
      seenMobile.add(candidate.mobileKey);
      firstMobileLine.set(candidate.mobileKey, lines[i]);
      return { duplicate: false, scope: null, kind: null, firstLine: null, matchIndex: null };
    }
    if (candidate.nameKey.length === 0) {
      return { duplicate: false, scope: null, kind: null, firstLine: null, matchIndex: null };
    }
    if (ownedName.has(candidate.nameKey)) {
      return {
        duplicate: true,
        scope: "book",
        kind: "name",
        firstLine: null,
        matchIndex: null,
      };
    }
    if (seenName.has(candidate.nameKey)) {
      return {
        duplicate: true,
        scope: "file",
        kind: "name",
        firstLine: firstNameLine.get(candidate.nameKey) ?? null,
        matchIndex: null,
      };
    }
    seenName.add(candidate.nameKey);
    firstNameLine.set(candidate.nameKey, lines[i]);
    return { duplicate: false, scope: null, kind: null, firstLine: null, matchIndex: null };
  });
}

/**
 * User-facing reason for a classified duplicate. Never echoes names or
 * numbers — only the match basis and (for file repeats) the source line.
 */
export function duplicateReasonText(
  scope: DuplicateScope,
  kind: DuplicateMatchKind,
  firstLine?: number | null,
): string {
  const basis = kind === "mobile" ? "Matched by mobile number." : "Matched by client name.";
  if (scope === "file") {
    return firstLine === null || firstLine === undefined
      ? `Duplicate of an earlier row in this file. ${basis}`
      : `Duplicate of row ${firstLine} in this file. ${basis}`;
  }
  return `Already in your clients. ${basis}`;
}

/**
 * Manual-Add confirmation copy for a matched existing client. The existing
 * name is the caller's own book record (RLS-scoped), safe to display.
 */
export function manualDuplicateCopy(
  kind: DuplicateMatchKind,
  existingName: string,
): { title: string; body: string; matchedBy: string } {
  if (kind === "mobile") {
    return {
      title: "This client already exists",
      body: `${existingName} is already in your clients.`,
      matchedBy: "Matched by mobile number.",
    };
  }
  return {
    title: "A client with this name already exists",
    body: `${existingName} is already in your clients.`,
    matchedBy: "We couldn't confirm the mobile number, but the client name matches exactly.",
  };
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
  const lines = candidates.map((_, i) => i);
  return classifyDuplicates(
    candidates.map((c) => c.identity),
    existing,
    lines,
  ).map((c) => c.duplicate);
}
