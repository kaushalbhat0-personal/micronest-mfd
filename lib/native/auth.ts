/**
 * MFD-64 P0 — native OAuth / deep-link helpers.
 *
 * Web flow is UNCHANGED (GoogleSignInButton keeps window.location.origin +
 * server /auth/callback 302 cookie flow when not native).
 *
 * Native flow:
 *   signInWithOAuth({ redirectTo: micronest://auth/callback, skipBrowserRedirect: true })
 *   → open returned url in system browser (Capacitor Browser)
 *   → Supabase redirects to micronest://auth/callback?code=...&next=...
 *   → appUrlOpen captures it → parseNativeAuthCallback → exchangeCodeForSession
 *
 * Pure parsing functions here are unit-tested; the Browser/supabase
 * side-effects live in provider/clients so tests never touch native APIs.
 */
import { DEFAULT_POST_AUTH_PATH, safeNextPath } from "@/lib/auth/guard";
import { NATIVE_AUTH_CALLBACK } from "./runtime";

export interface NativeAuthCallback {
  /** PKCE authorization code. Single-use; clear after exchange. */
  code: string;
  /** Validated internal post-auth destination. */
  next: string;
}

const processedCodes = new Set<string>();

/** Validate a post-auth destination with the existing web security model. */
export function safeNativeNextPath(value: unknown): string {
  return safeNextPath(value, DEFAULT_POST_AUTH_PATH);
}

/**
 * Parse a captured deep-link URL. Returns null when the URL is not a
 * native auth callback. Never throws. Never accepts arbitrary schemes —
 * only micronest://auth/callback (and path variants under /auth/).
 */
export function parseNativeAuthCallback(url: string): NativeAuthCallback | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const lower = url.toLowerCase();
  if (!lower.startsWith("micronest://auth/")) return null;

  let parsed: URL;
  try {
    // URL() understands custom schemes; use a placeholder for relative safety.
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Restrict to the callback path family — reject micronest://auth-evil etc.
  const path = parsed.pathname.toLowerCase();
  const hostAndPath = `${parsed.hostname.toLowerCase()}${path}`;
  if (!hostAndPath.startsWith("auth/callback") && !path.startsWith("/callback")) {
    // Accept both micronest://auth/callback and micronest:/auth/callback shapes.
    if (parsed.hostname.toLowerCase() !== "auth" && !path.includes("callback")) return null;
  }

  const code = parsed.searchParams.get("code");
  if (!code || code.length === 0) return null;
  const next = safeNativeNextPath(parsed.searchParams.get("next"));
  return { code, next };
}

/**
 * Idempotency guard: each PKCE code must be exchanged exactly once.
 * Returns true the first time a code is seen, false on repeats
 * (e.g. duplicate appUrlOpen delivery on resume).
 */
export function claimAuthCodeOnce(code: string): boolean {
  if (processedCodes.has(code)) return false;
  processedCodes.add(code);
  // Bound memory: codes are single-use; keep the set small.
  if (processedCodes.size > 50) {
    const first = processedCodes.values().next().value;
    if (first) processedCodes.delete(first);
  }
  return true;
}

/** Test-only reset for the in-memory processed-code set. */
export function __resetProcessedCodesForTests(): void {
  processedCodes.clear();
}

/** Build the native redirectTo value used for signInWithOAuth. */
export function buildNativeRedirectTo(next: string): string {
  return `${NATIVE_AUTH_CALLBACK}?next=${encodeURIComponent(safeNativeNextPath(next))}`;
}
