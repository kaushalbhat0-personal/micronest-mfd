import * as React from "react";
import { resolveRegion } from "./locale";

/**
 * Minimal presentation-gating context (MFD-76 Phase A).
 *
 * MicroNest Core is vertical-neutral; the MFD vertical (SIP, Lumpsum,
 * Insurance, ARN, Hinglish builders, MFD import/messages) stays fully
 * available but must never confront a generic user. There is deliberately
 * NO persisted vertical, NO country selector, NO per-user setting, and NO
 * auth/storage involvement here: the browser region is a presentation hint
 * only, resolved from `navigator.language` via the existing locale helper.
 *
 * - `resolveVerticalContext()` returns "mfd" for IN-region devices and
 *   "generic" everywhere else. A generic-region MFD user still reaches
 *   every MFD field through the clearly labelled disclosure/template
 *   choices, so nothing is ever removed — only de-emphasized.
 * - Callers may pass an explicit vertical to force MFD presentation
 *   (tests, previews) without touching global state.
 *
 * Never use this for identity, access control, storage, or lifecycle
 * semantics — only for choosing which copy/fields to emphasize.
 */
export type VerticalContext = "generic" | "mfd";

/** IN-region devices keep the full MFD presentation; all others go generic-first. */
export function resolveVerticalContext(region?: string): VerticalContext {
  const code = (region ?? resolveRegion()).toUpperCase();
  return code === "IN" ? "mfd" : "generic";
}

/** True only for the MFD vertical presentation. Display gating only. */
export function isMfdVertical(vertical: VerticalContext): boolean {
  return vertical === "mfd";
}

/**
 * Minimal record evidence that MFD domain data exists (a non-default
 * category or a recorded amount). A bare activity date alone is NOT
 * evidence — the generic Add Client maps "Last activity" onto the same
 * stored field, so a date by itself must keep generic verbs.
 */
export interface VerticalEvidence {
  investmentType?: string | null;
  sipAmountPaise?: number | null;
  lumpsumAmountPaise?: number | null;
}

/** True when the stored record carries MFD domain data. Display only. */
export function hasInvestmentEvidence(evidence: VerticalEvidence): boolean {
  if (
    evidence.investmentType !== undefined &&
    evidence.investmentType !== null &&
    evidence.investmentType !== "Other"
  ) {
    return true;
  }
  if (evidence.sipAmountPaise != null || evidence.lumpsumAmountPaise != null) return true;
  return false;
}

/**
 * Contextual gating (MFD-76 Phase A): a generic surface upgrades to MFD
 * wording only when the record itself carries MFD evidence, so existing
 * MFD clients keep their exact presentation while a generic client never
 * wears investment verbs. Requested "mfd" always stays "mfd".
 */
export function effectiveVertical(
  evidence: VerticalEvidence,
  requested: VerticalContext,
): VerticalContext {
  if (requested === "mfd") return "mfd";
  return hasInvestmentEvidence(evidence) ? "mfd" : "generic";
}

/**
 * Hydration-safe vertical for client components (MFD-76 Phase A).
 * Server and hydration renders pin to "mfd" (SSR HTML stays byte-identical
 * with the legacy output); the committed client render resolves the
 * browser-region heuristic. Display only — never identity, storage, or
 * lifecycle.
 */
export function useResolvedVertical(): VerticalContext {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => resolveVerticalContext(),
    () => "mfd",
  );
}

/** No-op subscribe: the browser region is read once per render. */
function subscribeNoop(): () => void {
  return () => {};
}
