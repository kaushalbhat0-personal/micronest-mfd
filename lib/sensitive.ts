export interface SensitiveHit {
  field: string;
  reason: string;
}

/** Matches Indian PAN format (ABCDE1234F). Used only to warn, never stored. */
const PAN_PATTERN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
/** Matches 12 consecutive digits (possible Aadhaar) with or without spaces. */
const AADHAAR_PATTERN = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
const SECRET_KEYWORDS = /\b(otp|password|cvv|atm\s*pin|upi\s*pin)\b/i;

/**
 * Flags values that look like sensitive financial identity data.
 * Used by Message Studio and Follow-up Workspace. Independent from
 * required-field validation and compliance guardrails: this answers
 * "should the user be typing/importing this at all?".
 */
export function detectSensitiveInput(field: string, value: string): SensitiveHit | null {
  if (!value) return null;
  if (PAN_PATTERN.test(value)) {
    return { field, reason: "Looks like a PAN number. Do not enter PAN details here." };
  }
  const digitsOnly = value.replace(/\D/g, "");
  if (AADHAAR_PATTERN.test(value) || (digitsOnly.length === 12 && /^\d{12}$/.test(digitsOnly))) {
    return { field, reason: "Looks like a 12-digit ID number. Do not enter Aadhaar details here." };
  }
  if (SECRET_KEYWORDS.test(value)) {
    return { field, reason: "Contains a sensitive keyword (OTP/password/PIN). Never enter these." };
  }
  return null;
}
