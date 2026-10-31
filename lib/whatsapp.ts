export interface PhoneResult {
  ok: boolean;
  /** Full international digits without "+", e.g. 919876543210 */
  digits?: string;
  error?: string;
}

/**
 * Normalises an optional phone number for wa.me links.
 * Empty input is valid (means "let the user pick the contact").
 *
 * Region handling (MFD-72): bare 10-digit numbers and 0-prefixed 11-digit
 * numbers are an explicitly Indian format, so the +91 inference applies
 * only when `defaultRegion` is "IN" (the default — existing behavior,
 * deterministic on server and in tests). For any other region a bare
 * 10-digit number is rejected so it can never be silently misdialed as
 * Indian; the user must include the country code. Explicitly prefixed
 * numbers (+91…, 12-digit 91…, other 12–15 digit international formats)
 * are accepted regardless of region.
 */
export function normalizePhone(input: string | undefined, defaultRegion = "IN"): PhoneResult {
  if (!input || input.trim().length === 0) return { ok: true };
  const raw = input.trim();
  if (/[a-zA-Z]/.test(raw)) {
    return { ok: false, error: "Phone number should contain digits only (country code allowed)." };
  }
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    if (defaultRegion !== "IN") {
      return {
        ok: false,
        error: "Include the country code for this number, e.g. +1 5551234567.",
      };
    }
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    if (defaultRegion !== "IN") {
      return {
        ok: false,
        error: "Include the country code for this number, e.g. +1 5551234567.",
      };
    }
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    // NANP-style country-code-prefixed number (+1 …), accepted as-is.
  } else if (digits.length === 12 && digits.startsWith("91")) {
    // already international
  } else if (digits.length >= 12 && digits.length <= 15) {
    // other international formats, accept as-is
  } else {
    return {
      ok: false,
      error: "Enter a valid phone number, including the country code when outside India.",
    };
  }
  return { ok: true, digits };
}

export function buildWhatsAppUrl(
  message: string,
  phone?: string,
  defaultRegion = "IN",
): string | null {
  const normalized = normalizePhone(phone, defaultRegion);
  if (!normalized.ok) return null;
  const encoded = encodeURIComponent(message);
  if (!normalized.digits) return `https://wa.me/?text=${encoded}`;
  return `https://wa.me/${normalized.digits}?text=${encoded}`;
}

/**
 * Builds a device-native telephone handoff URL. The OS dialer (phone app,
 * FaceTime, Skype) handles the actual call — no telephony provider involved.
 * Returns null for missing/invalid numbers so no dead action is rendered.
 */
export function buildCallUrl(phone?: string, defaultRegion = "IN"): string | null {
  const normalized = normalizePhone(phone, defaultRegion);
  if (!normalized.ok || !normalized.digits) return null;
  return `tel:+${normalized.digits}`;
}
