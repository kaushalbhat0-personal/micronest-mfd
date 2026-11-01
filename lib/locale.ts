import * as React from "react";

/**
 * Thin locale/presentation adapter (MFD-72 Phase 1, extended MFD-76 Phase A).
 *
 * MicroNest stores money as integer minor units and dates as YYYY-MM-DD —
 * both locale-neutral. *Presentation* varies by locale:
 * - Stored data, lifecycle thresholds, date arithmetic, sorting, follow-up
 *   semantics, and CSV interchange never vary by locale.
 * - Display strings may use the resolved/browser locale where the caller
 *   passes one explicitly, or via `useResolvedLocale()` in client
 *   components. Bare `formatDisplayDate`/`formatMoneyMinor` defaults stay
 *   pinned to the MFD-compatible output (en-IN/INR) so server pre-renders
 *   and existing snapshots remain byte-identical.
 *
 * There is deliberately no language selector, no currency input, and no
 * per-user locale setting yet: callers pass explicit options when they
 * have them, and everything else falls back to the MFD-compatible default.
 *
 * SSR-safe: never touches `navigator` without a guard, so server
 * pre-rendering and hydration always agree on the default.
 */

/** Presentation default preserving exact MFD behavior (₹ grouping, DD/MM/YYYY). */
export const DEFAULT_LOCALE = "en-IN";
/** Stored amounts are INR minor units; the currency default matches the data. */
export const DEFAULT_CURRENCY = "INR";
/** Region default preserving the existing +91 inference behavior. */
export const DEFAULT_REGION = "IN";

export interface MoneyFormatOptions {
  locale?: string;
  currency?: string;
}

/** Device locale when available (browser only); the pinned default otherwise. */
export function resolveLocale(): string {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
      const language = navigator.language.trim();
      if (language.length > 0) return language;
    }
  } catch {
    // Telemetry-grade best effort: fall through to the default.
  }
  return DEFAULT_LOCALE;
}

/**
 * Device region ("US", "IN", …) from the browser locale when available;
 * the pinned default otherwise. Used only to disambiguate phone input and
 * vertical presentation — never for identity, storage, or access control.
 *
 * A region-specific locale (en-US, fr-FR) resolves to its region. A
 * genuinely region-less browser locale (en, fr, ja) resolves to unknown
 * ("") so it is never silently treated as India — a region-less device must
 * not get the +91 phone inference or the MFD vertical. The pinned India
 * default still applies on the server / no-navigator path, where
 * resolveLocale() falls back to the MFD-compatible en-IN default.
 */
export function resolveRegion(): string {
  const locale = resolveLocale();
  const subtag = locale.split(/[-_]/)[1];
  if (subtag && /^[A-Za-z]{2}$/.test(subtag)) return subtag.toUpperCase();
  // Region-less browser locale (e.g. "en"): unknown, not India. The pinned
  // DEFAULT_REGION only applies when there is no browser locale at all
  // (resolveLocale already returned the en-IN default in that case).
  return locale === DEFAULT_LOCALE ? DEFAULT_REGION : "";
}

/**
 * Device IANA timezone ("Asia/Kolkata", "America/New_York", …) when the
 * runtime can resolve one; undefined otherwise (SSR, prerender, or a
 * runtime without Intl). Used only to define the calendar-day boundary
 * for "today" — never for identity, storage, or access control. Storage
 * stays YYYY-MM-DD.
 */
export function resolveTimeZone(): string | undefined {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (typeof timeZone === "string" && timeZone.length > 0) return timeZone;
    }
  } catch {
    // Telemetry-grade best effort: fall through to undefined.
  }
  return undefined;
}

/**
 * Integer minor units → display string. Default is the exact legacy MFD
 * output (₹5,000 / ₹5,000.50 with en-IN grouping); other locales use
 * standard currency formatting. Display only — storage stays integer.
 */
export function formatMoneyMinor(minor: number, options?: MoneyFormatOptions): string {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const currency = options?.currency ?? DEFAULT_CURRENCY;
  if (locale === DEFAULT_LOCALE && currency === DEFAULT_CURRENCY) {
    const major = Math.floor(minor / 100);
    const remainder = minor % 100;
    const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(major);
    if (remainder === 0) return `₹${grouped}`;
    return `₹${grouped}.${String(remainder).padStart(2, "0")}`;
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

/**
 * YYYY-MM-DD → locale-aware display date. Default renders the familiar
 * DD/MM/YYYY (India); e.g. en-US renders MM/DD/YYYY. Display only —
 * storage and CSV interchange stay YYYY-MM-DD / DD/MM/YYYY respectively.
 */
export function formatDateLocale(dateYMD: string, locale: string = DEFAULT_LOCALE): string {
  const year = Number(dateYMD.slice(0, 4));
  const month = Number(dateYMD.slice(5, 7));
  const day = Number(dateYMD.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return dateYMD;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

/**
 * Hydration-safe browser locale for client components (MFD-76 Phase A).
 * Server and hydration renders pin to the default (SSR HTML stays
 * byte-identical); the committed client render reads the browser locale.
 * Display only — thread the result into presentation helpers explicitly;
 * never into storage or lifecycle logic.
 */
export function useResolvedLocale(): string {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => resolveLocale(),
    () => DEFAULT_LOCALE,
  );
}

/** No-op subscribe: the browser locale is read once per render. */
function subscribeNoop(): () => void {
  return () => {};
}
