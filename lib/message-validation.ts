import type { MessagePurpose } from "./message-templates";

export type FieldErrors = Record<string, string>;

const MAX_NAME = 60;
const MAX_FREE_TEXT = 300;
const MAX_SHORT = 120;

/** Matches Indian PAN format (ABCDE1234F). Used only to warn, never stored. */
const PAN_PATTERN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
/** Matches 12 consecutive digits (possible Aadhaar) with or without spaces. */
const AADHAAR_PATTERN = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
const SECRET_KEYWORDS = /\b(otp|password|cvv|atm\s*pin|upi\s*pin)\b/i;

export interface SensitiveHit {
  field: string;
  reason: string;
}

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

export interface ValidationResult {
  ok: boolean;
  errors: FieldErrors;
  sensitive: SensitiveHit[];
}

function required(value: string | undefined, label: string, max: number): string | null {
  if (!value || value.trim().length === 0) return `${label} is required.`;
  if (value.trim().length > max) return `${label} must be under ${max} characters.`;
  return null;
}

export function validateMessageInput(
  purpose: MessagePurpose,
  fields: {
    clientName?: string;
    documents?: string;
    dueDate?: string;
    sipAmount?: string;
    sipDate?: string;
    meetingDate?: string;
    meetingTime?: string;
    action?: string;
  },
): ValidationResult {
  const errors: FieldErrors = {};
  const sensitive: SensitiveHit[] = [];

  const nameErr = required(fields.clientName, "Client name", MAX_NAME);
  if (nameErr) errors.clientName = nameErr;

  const check = (field: string, value: string | undefined, label: string, max: number) => {
    const err = required(value, label, max);
    if (err) errors[field] = err;
    const hit = detectSensitiveInput(field, value ?? "");
    if (hit) sensitive.push(hit);
  };

  switch (purpose) {
    case "document-request":
      check("documents", fields.documents, "Required documents", MAX_FREE_TEXT);
      break;
    case "sip-confirmation": {
      check("sipAmount", fields.sipAmount, "SIP amount", MAX_SHORT);
      check("sipDate", fields.sipDate, "SIP date", MAX_SHORT);
      const amt = (fields.sipAmount ?? "").replace(/[₹,\s]/g, "");
      if (!errors.sipAmount && amt !== "" && !/^\d+(\.\d{1,2})?$/.test(amt)) {
        errors.sipAmount = "SIP amount should be a number, e.g. 5000.";
      }
      break;
    }
    case "review-invite":
      check("meetingDate", fields.meetingDate, "Proposed date", MAX_SHORT);
      break;
    case "kyc-reminder":
      check("action", fields.action, "Required action", MAX_FREE_TEXT);
      break;
  }

  // Optional fields still get sensitive-data screening.
  for (const [field, value] of Object.entries(fields)) {
    if (value && !sensitive.some((s) => s.field === field)) {
      const hit = detectSensitiveInput(field, value);
      if (hit) sensitive.push(hit);
    }
  }
  // Name itself must never carry ID-like content.
  if (!sensitive.some((s) => s.field === "clientName")) {
    const hit = detectSensitiveInput("clientName", fields.clientName ?? "");
    if (hit) sensitive.push(hit);
  }

  return { ok: Object.keys(errors).length === 0 && sensitive.length === 0, errors, sensitive };
}
