import { detectSensitiveInput, type SensitiveHit } from "@/lib/sensitive";
import { TEMPLATES, type MessageField, type MessagePurpose } from "./templates";

export type FieldErrors = Partial<Record<MessageField, string>>;

export interface ValidationResult {
  ok: boolean;
  errors: FieldErrors;
  sensitive: SensitiveHit[];
}

/** Maximum custom-message size in Unicode code points (emoji-safe). */
export const CUSTOM_MESSAGE_MAX_LENGTH = 1000;

/** Counts user-perceived characters as Unicode code points, not UTF-16 units. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export interface CustomValidationResult {
  ok: boolean;
  /** Single message-field error, if any. */
  error: string | null;
  sensitive: SensitiveHit[];
}

/**
 * Validates a user-written custom message. Content is treated as opaque
 * text: no language detection, no normalization, no transformation.
 * Length is measured in code points so emoji/scripts count fairly.
 */
export function validateCustomMessage(text: string): CustomValidationResult {
  const sensitive: SensitiveHit[] = [];
  if (text.trim().length === 0) {
    return { ok: false, error: "Please type your message first.", sensitive };
  }
  if (countChars(text) > CUSTOM_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Message must be within ${CUSTOM_MESSAGE_MAX_LENGTH} characters (currently ${countChars(text)}).`,
      sensitive,
    };
  }
  const hit = detectSensitiveInput("message", text);
  if (hit) sensitive.push(hit);
  return { ok: sensitive.length === 0, error: null, sensitive };
}

const FIELD_LABELS: Record<MessageField, string> = {
  clientName: "Client name",
  documents: "Required documents",
  dueDate: "Date",
  sipAmount: "SIP amount",
  sipDate: "SIP date",
  meetingDate: "Proposed date",
  meetingTime: "Proposed time",
  action: "Required action",
};

const FIELD_MAXLEN: Record<MessageField, number> = {
  clientName: 60,
  documents: 300,
  dueDate: 120,
  sipAmount: 120,
  sipDate: 120,
  meetingDate: 120,
  meetingTime: 120,
  action: 300,
};

/**
 * Validates a single required field: presence, length, and any
 * field-specific format rule. Answers "is this field usable?".
 */
export function validateField(field: MessageField, rawValue: string | undefined): string | null {
  const value = rawValue ?? "";
  if (value.trim().length === 0) return `${FIELD_LABELS[field]} is required.`;
  if (value.trim().length > FIELD_MAXLEN[field]) {
    return `${FIELD_LABELS[field]} must be under ${FIELD_MAXLEN[field]} characters.`;
  }
  if (field === "sipAmount") {
    const amount = value.replace(/[₹,\s]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      return "SIP amount should be a number, e.g. 5000.";
    }
  }
  return null;
}

/**
 * Validates all required fields for a purpose (read from the template
 * registry, so no per-purpose switch is needed) and screens every
 * provided value for sensitive data. The two concerns stay separate in
 * the result: `errors` vs `sensitive`.
 */
export function validateMessageInput(
  purpose: MessagePurpose,
  fields: Partial<Record<MessageField, string>>,
): ValidationResult {
  const errors: FieldErrors = {};
  const sensitive: SensitiveHit[] = [];
  const required = TEMPLATES[purpose].requiredFields;

  for (const field of required) {
    const error = validateField(field, fields[field]);
    if (error) errors[field] = error;
    const hit = detectSensitiveInput(field, fields[field] ?? "");
    if (hit) sensitive.push(hit);
  }

  // Optional fields are not required, but still get sensitive-data screening.
  for (const [field, value] of Object.entries(fields)) {
    if (!value || required.includes(field as MessageField)) continue;
    if (sensitive.some((s) => s.field === field)) continue;
    const hit = detectSensitiveInput(field, value);
    if (hit) sensitive.push(hit);
  }

  return { ok: Object.keys(errors).length === 0 && sensitive.length === 0, errors, sensitive };
}
