export interface PhoneResult {
  ok: boolean;
  /** Full international digits without "+", e.g. 919876543210 */
  digits?: string;
  error?: string;
}

/**
 * Well-formed E.164 digit string: 8–15 digits, no leading zero. This is a
 * length/format boundary only — never a guess about which country a number
 * belongs to. A real country code never starts with 0.
 */
function isE164Digits(digits: string): boolean {
  return /^[1-9]\d{7,14}$/.test(digits);
}

/**
 * Normalises an optional phone number for wa.me links.
 * Empty input is valid (means "let the user pick the contact").
 *
 * Two paths:
 * - Explicit international format (a leading "+" or "00" country prefix):
 *   the digits that follow must form a well-formed E.164 number (8–15
 *   digits, no leading zero). This accepts valid international numbers of
 *   any country — +44, +1, +61, +33, +81, +65 — without hardcoding lengths
 *   or inferring a country from a digit count. This is the only path that
 *   accepts 11-digit international numbers such as +61 / +33.
 * - National / bare format (no "+" or "00"): region handling (MFD-72).
 *   Bare 10-digit and 0-prefixed 11-digit numbers are explicitly Indian, so
 *   the +91 inference applies only when `defaultRegion` is "IN" (the
 *   default — deterministic on server and in tests). For any other region a
 *   bare 10-digit number is rejected so it is never silently misdialed as
 *   Indian; the user must include the country code. NANP-style 11-digit
 *   (1…) and already-international 12–15 digit forms are accepted as-is.
 */
export function normalizePhone(input: string | undefined, defaultRegion = "IN"): PhoneResult {
  if (!input || input.trim().length === 0) return { ok: true };
  const raw = input.trim();
  if (/[a-zA-Z]/.test(raw)) {
    return { ok: false, error: "Phone number should contain digits only (country code allowed)." };
  }

  // Explicit international marker: "+" or "00". Strip it, then require a
  // well-formed E.164 number. No country inference, no hardcoded lengths.
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const digits = (raw.startsWith("+") ? raw.slice(1) : raw.slice(2)).replace(/\D/g, "");
    if (!isE164Digits(digits)) {
      return {
        ok: false,
        error: "Enter a valid phone number, including the country code, e.g. +1 5551234567.",
      };
    }
    return { ok: true, digits };
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    if (defaultRegion !== "IN") {
      return {
        ok: false,
        error: "Include the country code for this number, e.g. +1 5551234567.",
      };
    }
    return { ok: true, digits: `91${digits}` };
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    if (defaultRegion !== "IN") {
      return {
        ok: false,
        error: "Include the country code for this number, e.g. +1 5551234567.",
      };
    }
    return { ok: true, digits: `91${digits.slice(1)}` };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    // NANP-style country-code-prefixed number (+1 …), accepted as-is.
    return { ok: true, digits };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    // Already international (India), accepted as-is.
    return { ok: true, digits };
  }
  if (digits.length >= 12 && digits.length <= 15) {
    // Other international formats without an explicit marker, accepted as-is.
    return { ok: true, digits };
  }
  return {
    ok: false,
    error: "Enter a valid phone number, including the country code, e.g. +1 5551234567.",
  };
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
