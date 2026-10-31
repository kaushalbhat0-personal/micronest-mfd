/**
 * MFD-64 P0 — single native URL classification boundary.
 *
 * Pure functions (no Capacitor imports) so they stay unit-testable in Node.
 * Web rendering behavior is unchanged; this only decides what the native
 * shell does when it sees a URL.
 */
import { getWebBaseUrl } from "./runtime";

export type UrlKind =
  | "internal"
  | "auth-callback"
  | "tel"
  | "whatsapp"
  | "external-allowed"
  | "blocked";

const WHATSAPP_HOSTS = new Set([
  "wa.me",
  "www.wa.me",
  "api.whatsapp.com",
  "www.whatsapp.com",
  "whatsapp.com",
]);

/**
 * Hosts the native shell is permitted to open in an external browser.
 * Keep this list tight: WhatsApp handoff only. Analytics beacons and
 * Supabase/Google OAuth are handled by their own flows, never by generic
 * anchor interception.
 */
const ALLOWED_EXTERNAL_HOSTS = new Set<string>([...WHATSAPP_HOSTS]);

function safeParseUrl(href: string): URL | null {
  try {
    // Allow custom schemes (tel:, whatsapp://, micronest://) via a base.
    return new URL(href, "https://placeholder.invalid");
  } catch {
    return null;
  }
}

/** Classify any href the app may encounter. Never throws. */
export function classifyUrl(href: string, webBase?: string): UrlKind {
  if (!href || href.trim().length === 0) return "blocked";
  const trimmed = href.trim();

  // Block dangerous schemes outright, including case/whitespace variants.
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return "blocked";
  }

  // Dedicated native auth deep link only — no other custom schemes.
  if (lower.startsWith("micronest://")) {
    return lower.startsWith("micronest://auth/") ? "auth-callback" : "blocked";
  }
  if (lower.startsWith("whatsapp://")) return "whatsapp";

  const parsed = safeParseUrl(trimmed);
  if (!parsed) return "blocked";

  // Telephone handoff — native dialer, never inside the WebView.
  if (parsed.protocol === "tel:") {
    // Require at least one digit so empty/garbage tel: links don't dial.
    return /[0-9]/.test(trimmed) ? "tel" : "blocked";
  }

  // Only http(s) beyond this point.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "blocked";

  const host = parsed.hostname.toLowerCase();

  // WhatsApp hosts (both https short links and api hosts).
  if (WHATSAPP_HOSTS.has(host)) return "whatsapp";

  // Same-origin app URLs stay inside the WebView.
  const base = (webBase ?? getWebBaseUrl()).toLowerCase().replace(/\/$/, "");
  let baseHost = "";
  try {
    baseHost = new URL(base).hostname.toLowerCase();
  } catch {
    baseHost = "";
  }
  if (baseHost && host === baseHost) return "internal";

  // Other HTTPS: only explicitly allowlisted hosts may open externally.
  if (ALLOWED_EXTERNAL_HOSTS.has(host)) return "external-allowed";

  return "blocked";
}

/** True when the URL must stay inside the Capacitor WebView. */
export function isInternalUrl(href: string, webBase?: string): boolean {
  return classifyUrl(href, webBase) === "internal";
}
