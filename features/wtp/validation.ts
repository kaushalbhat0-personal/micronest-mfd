/**
 * Shared validation for the public MicroNest research form (MFD-78).
 *
 * Pure module — no browser, Next.js, or Supabase imports — so the same
 * rules run in the client form, the API route, and unit tests. Values are
 * research labels, never product enums: nothing here constrains the
 * workspace domain model.
 */

/** Professions a visitor can identify with. "other" pairs with free text. */
export const PROFESSIONS = [
  "consultant",
  "coach",
  "insurance-advisor",
  "financial-professional",
  "real-estate-professional",
  "agency",
  "education-training",
  "healthcare-wellness",
  "freelancer",
  "other",
] as const;

export type Profession = (typeof PROFESSIONS)[number];

/** Approximate client-count bands shown on the form. */
export const CLIENT_COUNT_BANDS = [
  "1-10",
  "11-25",
  "26-50",
  "51-100",
  "101-250",
  "251-500",
  "500+",
] as const;

export type ClientCountBand = (typeof CLIENT_COUNT_BANDS)[number];

/** Tools the visitor's workflow currently runs on. Multi-select. */
export const CURRENT_SOLUTIONS = [
  "excel",
  "google-sheets",
  "whatsapp",
  "email",
  "crm",
  "industry-software",
  "notes",
  "nothing",
  "other",
] as const;

export type CurrentSolution = (typeof CURRENT_SOLUTIONS)[number];

/** Feature categories the visitor can ask for. Multi-select. */
export const DESIRED_FEATURES = [
  "client-organization",
  "followup-reminders",
  "whatsapp-integration",
  "email-integration",
  "client-history",
  "notes-tasks",
  "custom-fields",
  "reports-analytics",
  "team-members",
  "automations",
  "ai-assistance",
  "mobile-experience",
  "import-export",
  "other",
] as const;

export type DesiredFeature = (typeof DESIRED_FEATURES)[number];

/**
 * Monthly willingness-to-pay bands, in USD-equivalent framing on the form.
 * The band is a research label only: exact local amounts (when given) are
 * stored separately as minor units + ISO currency, never converted.
 */
export const PRICE_BANDS = [
  "free",
  "under-5",
  "5-10",
  "10-25",
  "25-50",
  "50-plus",
  "not-sure",
] as const;

export type PriceBand = (typeof PRICE_BANDS)[number];

/** Bands where an exact amount is meaningless and must stay absent. */
const NO_AMOUNT_BANDS: ReadonlySet<string> = new Set(["free", "not-sure"]);

/**
 * ISO 4217 currencies offered for the optional exact amount. A short
 * international set (not an exhaustive registry): the code is stored
 * verbatim and never converted, so adding codes needs no logic change.
 */
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AED",
  "SGD",
  "AUD",
  "CAD",
  "BRL",
  "ZAR",
  "NGN",
  "KES",
  "PHP",
  "MYR",
  "IDR",
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

/** Upper bound for an exact monthly amount: 1,000,000 major units. */
export const MAX_QUOTED_MINOR = 100_000_000;

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_OTHER_LENGTH = 200;
export const MAX_PROFESSION_OTHER_LENGTH = 120;

/** Raw submission as received from the form (before user_id resolution). */
export interface WtpSubmissionInput {
  email: string | null;
  country: string;
  profession: string;
  professionOther: string | null;
  clientCountBand: string;
  currentSolution: string[];
  currentSolutionOther: string | null;
  desiredFeatures: string[];
  otherFeature: string | null;
  quotedPriceMinor: number | null;
  quotedCurrency: string | null;
  priceBand: string;
  message: string | null;
}

export interface WtpValidationError {
  field: string;
  message: string;
}

/**
 * Parses a human-typed decimal amount into integer minor units without
 * floating-point arithmetic ("25", "25.5", "1,250.75"). Returns null for
 * blank input (valid: absent). Mirrors the workspace amount parser's
 * string-splitting approach without importing MFD-specific messaging.
 */
export function parseExactAmountToMinor(raw: string): {
  minor: number | null;
  error: string | null;
} {
  const text = raw.trim();
  if (text.length === 0) return { minor: null, error: null };
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { minor: null, error: "Enter an amount like 25 or 25.50." };
  }
  const dot = cleaned.indexOf(".");
  const majorText = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const fractionText = dot === -1 ? "" : cleaned.slice(dot + 1);
  const major = Number(majorText);
  if (!Number.isSafeInteger(major)) {
    return { minor: null, error: "That amount is too large." };
  }
  const fraction = fractionText.length === 0 ? 0 : Number(fractionText.padEnd(2, "0"));
  const minor = major * 100 + fraction;
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_QUOTED_MINOR) {
    return { minor: null, error: "That amount is too large." };
  }
  return { minor, error: null };
}

/** True for the ISO alpha-3 shape the database CHECK enforces. */
export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function isAllowedList(values: string[], allowed: readonly string[]): boolean {
  return values.every((v) => (allowed as readonly string[]).includes(v));
}

function hasNoDuplicates(values: string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Validates a research submission. Returns field-scoped errors (empty when
 * valid). Never throws, never logs: the API route maps these to a 400.
 */
export function validateWtpSubmission(input: WtpSubmissionInput): WtpValidationError[] {
  const errors: WtpValidationError[] = [];

  const country = input.country.trim();
  if (country.length < 2 || country.length > 64) {
    errors.push({ field: "country", message: "Choose your country." });
  }

  if (!(PROFESSIONS as readonly string[]).includes(input.profession)) {
    errors.push({ field: "profession", message: "Choose the option that fits best." });
  } else if (input.profession === "other") {
    const other = (input.professionOther ?? "").trim();
    if (other.length > MAX_PROFESSION_OTHER_LENGTH) {
      errors.push({
        field: "professionOther",
        message: `Keep this under ${MAX_PROFESSION_OTHER_LENGTH} characters.`,
      });
    }
  } else if (
    input.professionOther != null &&
    input.professionOther.trim().length > MAX_PROFESSION_OTHER_LENGTH
  ) {
    errors.push({
      field: "professionOther",
      message: `Keep this under ${MAX_PROFESSION_OTHER_LENGTH} characters.`,
    });
  }

  if (!(CLIENT_COUNT_BANDS as readonly string[]).includes(input.clientCountBand)) {
    errors.push({ field: "clientCountBand", message: "Choose your approximate client count." });
  }

  if (
    !Array.isArray(input.currentSolution) ||
    !hasNoDuplicates(input.currentSolution) ||
    !isAllowedList(input.currentSolution, CURRENT_SOLUTIONS)
  ) {
    errors.push({ field: "currentSolution", message: "Choose at least one option." });
  } else if (input.currentSolution.length === 0) {
    errors.push({ field: "currentSolution", message: "Choose at least one option." });
  }
  if (
    input.currentSolutionOther != null &&
    input.currentSolutionOther.trim().length > MAX_OTHER_LENGTH
  ) {
    errors.push({
      field: "currentSolutionOther",
      message: `Keep this under ${MAX_OTHER_LENGTH} characters.`,
    });
  }

  if (
    !Array.isArray(input.desiredFeatures) ||
    !hasNoDuplicates(input.desiredFeatures) ||
    !isAllowedList(input.desiredFeatures, DESIRED_FEATURES)
  ) {
    errors.push({ field: "desiredFeatures", message: "Choose at least one option." });
  } else if (input.desiredFeatures.length === 0) {
    errors.push({ field: "desiredFeatures", message: "Choose at least one option." });
  }
  if (input.otherFeature != null && input.otherFeature.trim().length > MAX_OTHER_LENGTH) {
    errors.push({
      field: "otherFeature",
      message: `Keep this under ${MAX_OTHER_LENGTH} characters.`,
    });
  }

  if (!(PRICE_BANDS as readonly string[]).includes(input.priceBand)) {
    errors.push({ field: "priceBand", message: "Choose what fits best." });
  } else if (NO_AMOUNT_BANDS.has(input.priceBand)) {
    if (input.quotedPriceMinor != null || input.quotedCurrency != null) {
      errors.push({
        field: "quotedPriceMinor",
        message: "No exact amount is needed for this choice.",
      });
    }
  } else {
    if (input.quotedPriceMinor != null || input.quotedCurrency != null) {
      if (
        input.quotedPriceMinor == null ||
        !Number.isSafeInteger(input.quotedPriceMinor) ||
        input.quotedPriceMinor < 0 ||
        input.quotedPriceMinor > MAX_QUOTED_MINOR
      ) {
        errors.push({ field: "quotedPriceMinor", message: "Enter a valid amount." });
      }
      if (input.quotedCurrency == null || !isCurrencyCode(input.quotedCurrency)) {
        errors.push({ field: "quotedCurrency", message: "Choose a currency." });
      }
    }
  }

  if (input.email != null && input.email.trim().length > 0) {
    const email = input.email.trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: "email", message: "Enter a valid email address." });
    }
  }

  if (input.message != null && input.message.trim().length > MAX_MESSAGE_LENGTH) {
    errors.push({
      field: "message",
      message: `Keep this under ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  return errors;
}
