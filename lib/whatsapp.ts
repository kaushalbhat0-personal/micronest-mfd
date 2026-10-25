export interface PhoneResult {
  ok: boolean;
  /** Full international digits without "+", e.g. 919876543210 */
  digits?: string;
  error?: string;
}

/**
 * Normalises an optional phone number for wa.me links.
 * Empty input is valid (means "let the user pick the contact").
 */
export function normalizePhone(input: string | undefined): PhoneResult {
  if (!input || input.trim().length === 0) return { ok: true };
  const raw = input.trim();
  if (/[a-zA-Z]/.test(raw)) {
    return { ok: false, error: "Phone number should contain digits only (country code allowed)." };
  }
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    // already international
  } else if (digits.length >= 12 && digits.length <= 15) {
    // other international formats, accept as-is
  } else {
    return { ok: false, error: "Enter a valid 10-digit mobile number (with or without +91)." };
  }
  return { ok: true, digits };
}

export function buildWhatsAppUrl(message: string, phone?: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized.ok) return null;
  const encoded = encodeURIComponent(message);
  if (!normalized.digits) return `https://wa.me/?text=${encoded}`;
  return `https://wa.me/${normalized.digits}?text=${encoded}`;
}
