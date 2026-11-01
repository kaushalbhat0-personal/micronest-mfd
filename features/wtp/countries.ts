import * as React from "react";
import { DEFAULT_LOCALE, resolveLocale } from "@/lib/locale";

/**
 * International country options for the research form (MFD-78).
 *
 * The list is derived at runtime from the browser's Intl registry
 * (`supportedValuesOf("region")` + `DisplayNames`), so it stays global and
 * alphabetically sorted in the visitor's own locale — no hardcoded,
 * India-first list lives in the product. A compact curated fallback
 * covers runtimes without region support. The empty value is the default:
 * the visitor must actively choose (the field is required).
 */

export interface CountryOption {
  /** ISO 3166-1 alpha-2 region code (stored verbatim). */
  code: string;
  /** Locale-aware display name. */
  name: string;
}

/** Curated fallback when `Intl.supportedValuesOf("region")` is unavailable. */
const FALLBACK_CODES = [
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "NL",
  "ES",
  "IT",
  "BR",
  "MX",
  "AE",
  "SG",
  "MY",
  "ID",
  "PH",
  "ZA",
  "NG",
  "KE",
  "IN",
] as const;

function displayName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** All supported regions with locale-aware names, sorted by name. */
export function countryOptions(locale?: string): CountryOption[] {
  const resolved = locale ?? resolveLocale();
  let codes: string[];
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    codes = typeof supported === "function" ? supported.call(Intl, "region") : [...FALLBACK_CODES];
  } catch {
    codes = [...FALLBACK_CODES];
  }
  return codes
    .map((code) => ({ code, name: displayName(code, resolved) }))
    .sort((a, b) => a.name.localeCompare(b.name, resolved));
}

/** No-op subscribe: the region registry is read once per render. */
function subscribeNoop(): () => void {
  return () => {};
}

let cachedLocale: string | null = null;
let cachedOptions: CountryOption[] | null = null;

function snapshotFor(locale: string): CountryOption[] {
  if (cachedOptions === null || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedOptions = countryOptions(locale);
  }
  return cachedOptions;
}

/**
 * Hydration-safe country options for client components. Mirrors
 * `useResolvedLocale`: server and hydration renders pin to the default
 * locale (SSR HTML stays locale-neutral); the committed client render
 * reads the browser locale. Never used for storage or identity — the
 * selected ISO code is stored verbatim.
 */
export function useCountryOptions(): CountryOption[] {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => snapshotFor(resolveLocale()),
    () => snapshotFor(DEFAULT_LOCALE),
  );
}
