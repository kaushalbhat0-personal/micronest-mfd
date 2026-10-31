/**
 * MFD-64 P0 — native runtime detection.
 *
 * The same Next.js app runs in two contexts:
 * - web: normal browser at https://micronestmicrotools.vercel.app (cookies, proxy.ts)
 * - native: Capacitor WebView loading the remote URL (bridges required)
 *
 * All Capacitor-specific behavior MUST be gated behind isNative().
 * Web behavior stays byte-for-byte unchanged.
 */

/** Remote web app origin. Overridable for dev via NEXT_PUBLIC_WEB_BASE_URL. */
export const PROD_WEB_BASE_URL = "https://micronestmicrotools.vercel.app";

/** Dedicated native auth-callback scheme. No other custom schemes allowed. */
export const NATIVE_AUTH_SCHEME = "micronest://";

export const NATIVE_AUTH_CALLBACK = "micronest://auth/callback";

export function getWebBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_WEB_BASE_URL;
  if (env && env.length > 0) return env.replace(/\/$/, "");
  return PROD_WEB_BASE_URL;
}

/**
 * True only inside the Capacitor native shell.
 * Safe to call on server (returns false) and in unit tests (returns false
 * unless a Capacitor global is stubbed).
 */
export function isNative(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    };
    if (w.Capacitor?.isNativePlatform) return w.Capacitor.isNativePlatform();
    if (w.Capacitor?.getPlatform) return w.Capacitor.getPlatform() !== "web";
    return false;
  } catch {
    return false;
  }
}

/** Platform name when running natively; "web" otherwise. Test-safe. */
export function nativePlatform(): "android" | "ios" | "web" {
  try {
    if (typeof window === "undefined") return "web";
    const w = window as unknown as {
      Capacitor?: { getPlatform?: () => string };
    };
    const p = w.Capacitor?.getPlatform?.();
    if (p === "android" || p === "ios") return p;
    return "web";
  } catch {
    return "web";
  }
}

/** True when native OAuth deep-link flow should be used instead of web 302. */
export function useNativeAuth(): boolean {
  return isNative();
}
