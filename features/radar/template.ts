import type { InvestmentType } from "./types";

/**
 * The application-owned radar CSV contract. The validator, the future
 * template file, and the UI example all reference these constants —
 * never hardcode header names anywhere else.
 */
export const RADAR_HEADERS = [
  "Client Name",
  "Mobile",
  "Investment Type",
  "Last Invested",
  "Last Contacted",
  "New Client",
  "Note",
] as const;

export type RadarHeader = (typeof RADAR_HEADERS)[number];

export const RADAR_REQUIRED_HEADERS: RadarHeader[] = ["Client Name"];

export const INVESTMENT_TYPES: InvestmentType[] = ["SIP", "Lumpsum", "Both", "Insurance", "Other"];

/** Accepted truthy values for the New Client flag (trimmed, lowercase). */
export const NEW_CLIENT_TRUTHY = ["y", "yes", "1"];

export interface InvestmentTypeResult {
  value: InvestmentType;
  /** Present when a non-blank value was not recognized. Blank means Other, silently. */
  warning: string | null;
}

/**
 * Normalizes free-text investment type against the fixed enum.
 * Deterministic: exact match after trim+lowercase, no aliases, no guessing.
 */
export function normalizeInvestmentType(raw: string): InvestmentTypeResult {
  const clean = raw.trim().toLowerCase();
  if (clean.length === 0) return { value: "Other", warning: null };
  const match = INVESTMENT_TYPES.find((t) => t.toLowerCase() === clean);
  if (match) return { value: match, warning: null };
  return { value: "Other", warning: "Investment type not recognized — treated as Other." };
}

/** Parses the explicit New Client flag. Only Y/yes/1 count; never inferred. */
export function parseNewClientFlag(raw: string): { value: boolean; warning: string | null } {
  const clean = raw.trim().toLowerCase();
  if (clean.length === 0) return { value: false, warning: null };
  if (NEW_CLIENT_TRUTHY.includes(clean)) return { value: true, warning: null };
  return { value: false, warning: "New Client value not recognized — treated as no." };
}
