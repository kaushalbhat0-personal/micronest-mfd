import type { InvestmentType } from "./types";

/**
 * The application-owned radar CSV contract. The validator, the future
 * template file, and the UI example all reference these constants —
 * never hardcode header names anywhere else.
 *
 * The canonical template carries separate SIP Amount and Lumpsum Amount
 * columns so a Both client can hold two independent figures. The legacy
 * single "Amount" column is NOT in the template but stays recognized for
 * older files (see LEGACY_AMOUNT_HEADER).
 */
export const RADAR_HEADERS = [
  "Client Name",
  "Mobile",
  "Investment Type",
  "SIP Amount",
  "Lumpsum Amount",
  "Last Invested",
  "Last Contacted",
  "New Client",
  "Note",
] as const;

export type RadarHeader = (typeof RADAR_HEADERS)[number] | typeof LEGACY_AMOUNT_HEADER;

/** Legacy single-amount column from older templates/files. Still accepted. */
export const LEGACY_AMOUNT_HEADER = "Amount" as const;

/** Every header the validator, mapper, and preview understand. */
export const MAPPABLE_HEADERS: RadarHeader[] = [...RADAR_HEADERS, LEGACY_AMOUNT_HEADER];

export const RADAR_REQUIRED_HEADERS: RadarHeader[] = ["Client Name"];

export const INVESTMENT_TYPES: InvestmentType[] = ["SIP", "Lumpsum", "Both", "Insurance", "Other"];

/** Accepted truthy values for the New Client flag (trimmed, lowercase). */
export const NEW_CLIENT_TRUTHY = ["y", "yes", "true", "1", "new"];

/** Explicit falsy values: recognized as "no" without a warning. */
export const NEW_CLIENT_FALSY = ["n", "no", "false", "0", "existing"];

/** Deterministic investment-type aliases beyond exact matching. */
const INVESTMENT_ALIASES: Record<string, InvestmentType> = {
  "lump sum": "Lumpsum",
  lumpsum: "Lumpsum",
};

export interface InvestmentTypeResult {
  value: InvestmentType;
  /** Present when a non-blank value was not recognized. Blank means Other, silently. */
  warning: string | null;
}

/**
 * Normalizes free-text investment type against the fixed enum.
 * Deterministic: exact match after trim+lowercase, then a small alias
 * list — no guessing. Unknown values become Other with a warning.
 */
export function normalizeInvestmentType(raw: string): InvestmentTypeResult {
  const clean = raw.trim().toLowerCase();
  if (clean.length === 0) return { value: "Other", warning: null };
  const alias = INVESTMENT_ALIASES[clean];
  if (alias) return { value: alias, warning: null };
  const match = INVESTMENT_TYPES.find((t) => t.toLowerCase() === clean);
  if (match) return { value: match, warning: null };
  return { value: "Other", warning: "We didn't recognise this investment type, so it's listed as Other." };
}

/**
 * Parses the explicit New Client flag. Truthy and explicitly-falsy values
 * are silent; anything else warns and counts as no. Never inferred.
 */
export function parseNewClientFlag(raw: string): { value: boolean; warning: string | null } {
  const clean = raw.trim().toLowerCase();
  if (clean.length === 0) return { value: false, warning: null };
  if (NEW_CLIENT_TRUTHY.includes(clean)) return { value: true, warning: null };
  if (NEW_CLIENT_FALSY.includes(clean)) return { value: false, warning: null };
  return { value: false, warning: "We didn't recognise the New Client value, so it's treated as no." };
}

/**
 * Optional relationship-context amounts, stored as integer paise (never
 * floating-point). Two independent buckets:
 * - SIP Amount → the monthly SIP figure (SIP and Both clients)
 * - Lumpsum Amount → the recorded lumpsum figure (Lumpsum, Both,
 *   Insurance, and Other clients)
 * Relationship context only — never portfolio value, AUM, holdings,
 * returns, or profit. The product has no ledger concepts.
 */

/** Largest accepted amount: ₹100 crore, in paise. */
export const MAX_AMOUNT_PAISE = 100_000_000_000;

export interface AmountParseResult {
  /** Integer paise, or null when the input was blank (valid: absent). */
  paise: number | null;
  /** Present when the input was non-blank but unusable; the row is rejected. */
  error: string | null;
}

/**
 * Parses a human-typed rupee amount (form input or spreadsheet text) into
 * integer paise without floating-point arithmetic. Accepts plain digits
 * with optional thousands separators, an optional ₹/Rs./INR affix, and up
 * to two decimal places (e.g. "5000", "5,000", "₹5,000.50").
 */
export function parseAmountInput(raw: string): AmountParseResult {
  const text = raw.trim();
  if (text.length === 0) return { paise: null, error: null };
  let cleaned = text.replace(/[\s,]/g, "");
  cleaned = cleaned.replace(/^₹+/, "");
  cleaned = cleaned.replace(/^(rs\.?|inr)/i, "");
  cleaned = cleaned.replace(/(rs\.?|inr)$/i, "");
  cleaned = cleaned.replace(/₹/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { paise: null, error: "Amount must be a number like 5000 or 5000.50." };
  }
  const dot = cleaned.indexOf(".");
  const rupeesText = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const fractionText = dot === -1 ? "" : cleaned.slice(dot + 1);
  const rupees = Number(rupeesText);
  if (!Number.isSafeInteger(rupees)) {
    return { paise: null, error: "Amount is too large — keep it under ₹100 crore." };
  }
  const fraction = fractionText.length === 0 ? 0 : Number(fractionText.padEnd(2, "0"));
  const paise = rupees * 100 + fraction;
  if (!Number.isSafeInteger(paise) || paise > MAX_AMOUNT_PAISE) {
    return { paise: null, error: "Amount is too large — keep it under ₹100 crore." };
  }
  return { paise, error: null };
}

/** Integer paise → display string (₹5,000 or ₹5,000.50, en-IN grouping). */
export function formatAmountPaise(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rupees);
  if (remainder === 0) return `₹${grouped}`;
  return `₹${grouped}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Integer paise → plain rupee input string (no currency symbol or grouping)
 * for the Add/Edit form and the CSV round-trip. Re-parses to identical paise.
 */
export function amountPaiseToInput(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  if (remainder === 0) return String(rupees);
  if (remainder % 10 === 0) return `${rupees}.${remainder / 10}`;
  return `${rupees}.${String(remainder).padStart(2, "0")}`;
}

/** Form label for the optional SIP amount field. */
export function sipAmountLabel(): string {
  return "Monthly SIP amount (optional)";
}

/** Form label for the optional lumpsum amount field. */
export function lumpsumAmountLabel(): string {
  return "Lumpsum amount (optional)";
}

/** Form hint for the optional SIP amount field. */
export function sipAmountHint(): string {
  return "Monthly SIP amount in ₹. Leave blank if unknown.";
}

/** Form hint for the optional lumpsum amount field. */
export function lumpsumAmountHint(): string {
  return "Latest lumpsum investment amount in ₹. Leave blank if unknown.";
}

/** Monthly SIP figure with the /month suffix, or null when absent. */
export function formatSipAmount(paise: number | null): string | null {
  if (paise === null) return null;
  return `${formatAmountPaise(paise)}/month`;
}

/** Recorded lumpsum figure, or null when absent. */
export function formatLumpsumAmount(paise: number | null): string | null {
  if (paise === null) return null;
  return formatAmountPaise(paise);
}

/**
 * Compact relationship-context rendering of both amounts, or null when
 * neither is present. SIP reads its monthly figure; Lumpsum its recorded
 * figure; Both reads each independently; Insurance/Other read whichever
 * figure exists. Never portfolio value or returns.
 */
export function formatInvestmentAmounts(
  type: InvestmentType,
  sipPaise: number | null,
  lumpsumPaise: number | null,
): string | null {
  const sip = formatSipAmount(sipPaise);
  const lumpsum = formatLumpsumAmount(lumpsumPaise);
  if (type === "Both") {
    const parts = [
      sip ? `SIP ${sip}` : null,
      lumpsum ? `Lumpsum ${lumpsum}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  // Single-type clients show their own bucket first, falling back to
  // whichever figure exists so cross-filled legacy data never hides.
  if (type === "SIP") return sip ?? lumpsum;
  if (type === "Lumpsum") return lumpsum ?? sip;
  return lumpsum ?? sip;
}
