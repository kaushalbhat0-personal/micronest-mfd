import { CLIENT_COUNT_BANDS, PRICE_BANDS, PROFESSIONS } from "@/features/wtp/validation";

/**
 * Pure filter model for the admin Suggestions workspace (P1A).
 *
 * No Supabase, server-only, browser, or React imports — safe for server
 * components, route handlers, and unit tests. Vocabulary comes from the
 * real `wtp_interest` enums; unknown values are dropped, never accepted.
 */

/** Records per suggestions page. Server-side `.range()` window. */
export const SUGGESTION_PAGE_SIZE = 25;

/** Search box bound: keeps `ilike` patterns small and URLs shareable. */
export const MAX_SUGGESTION_QUERY_LENGTH = 120;

/** Upper bound for `page`: prevents absurd offsets, not a data limit. */
export const MAX_ADMIN_PAGE = 1000;

/** Maximum excerpt shown on list cards (matches P0 overview). */
export const SUGGESTION_EXCERPT_LENGTH = 140;

export type SuggestionAuthStatus = "all" | "identified" | "anonymous";

export const AUTH_STATUSES: readonly SuggestionAuthStatus[] = ["all", "identified", "anonymous"];

export interface SuggestionFilters {
  q: string;
  profession: string;
  country: string;
  countBand: string;
  priceBand: string;
  authStatus: SuggestionAuthStatus;
  page: number;
}

export const EMPTY_SUGGESTION_FILTERS: SuggestionFilters = {
  q: "",
  profession: "",
  country: "",
  countBand: "",
  priceBand: "",
  authStatus: "all",
  page: 1,
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.length > 0 ? (value[0] ?? "") : "";
  return value ?? "";
}

function inList(value: string, list: readonly string[]): boolean {
  return list.includes(value);
}

/**
 * Normalize raw URL search params into safe filters. Trims whitespace,
 * drops unsupported enum values, clamps the query length, and normalizes
 * the page to a finite integer in [1, MAX_ADMIN_PAGE].
 */
export function parseSuggestionSearchParams(
  params: Record<string, string | string[] | undefined>,
): SuggestionFilters {
  const q = firstParam(params.q).trim().slice(0, MAX_SUGGESTION_QUERY_LENGTH);

  const professionRaw = firstParam(params.profession).trim();
  const profession = inList(professionRaw, PROFESSIONS) ? professionRaw : "";

  const countryRaw = firstParam(params.country).trim();
  const country = countryRaw.length > 0 && countryRaw.length <= 64 ? countryRaw : "";

  const countBandRaw = firstParam(params.countBand).trim();
  const countBand = inList(countBandRaw, CLIENT_COUNT_BANDS) ? countBandRaw : "";

  const priceBandRaw = firstParam(params.priceBand).trim();
  const priceBand = inList(priceBandRaw, PRICE_BANDS) ? priceBandRaw : "";

  const authRaw = firstParam(params.authStatus).trim();
  const authStatus: SuggestionAuthStatus =
    authRaw === "identified" || authRaw === "anonymous" ? authRaw : "all";

  const pageRaw = Number.parseInt(firstParam(params.page).trim(), 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(Math.floor(pageRaw), MAX_ADMIN_PAGE) : 1;

  return { q, profession, country, countBand, priceBand, authStatus, page };
}

/**
 * Serialize filters back to a query string, omitting defaults so URLs stay
 * minimal and clearing filters removes parameters. Never includes record
 * content — only filter selections and the page.
 */
export function suggestionFiltersToQuery(filters: SuggestionFilters): string {
  const params = new URLSearchParams();
  if (filters.q.length > 0) params.set("q", filters.q);
  if (filters.profession.length > 0) params.set("profession", filters.profession);
  if (filters.country.length > 0) params.set("country", filters.country);
  if (filters.countBand.length > 0) params.set("countBand", filters.countBand);
  if (filters.priceBand.length > 0) params.set("priceBand", filters.priceBand);
  if (filters.authStatus !== "all") params.set("authStatus", filters.authStatus);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

/** True for canonical lowercase/uppercase UUIDs (used for `[id]` routes). */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** List-card excerpt: trimmed message capped at 140 chars, else null. */
export function excerptMessage(message: string | null | undefined): string | null {
  const text = (message ?? "").trim();
  if (text.length === 0) return null;
  return text.length > SUGGESTION_EXCERPT_LENGTH ? text.slice(0, SUGGESTION_EXCERPT_LENGTH) : text;
}

/**
 * Format a stored minor-units amount + ISO currency for display.
 * No conversion, no exchange rates — the stored units rendered as major.
 *
 * INR keeps the legacy MFD presentation (en-IN digit grouping). Other
 * currencies use the caller's locale (neutral `en-US` fallback) so e.g.
 * USD 1,234,567 is never rendered with Indian grouping (12,34,567).
 */
export function formatQuotedAmount(
  minor: number | null | undefined,
  currency: string | null | undefined,
  locale?: string,
): string | null {
  if (minor === null || minor === undefined || !currency) return null;
  if (!Number.isFinite(minor) || minor < 0) return null;
  const groupingLocale = currency === "INR" ? "en-IN" : (locale ?? "en-US");
  const major = new Intl.NumberFormat(groupingLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `${major} ${currency}`;
}
