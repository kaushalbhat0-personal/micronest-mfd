/**
 * Pure auth-route helpers. No browser or Next.js runtime imports so these
 * stay unit-testable in plain Node.
 */

/** Paths that require an authenticated session. */
const PROTECTED_PREFIXES = ["/workspace"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Where post-auth flows land when no valid destination was requested.
 * The workspace — never the marketing homepage — so a dropped `next`
 * can never strand a signed-in user on the public site.
 */
export const DEFAULT_POST_AUTH_PATH = "/workspace/today";

/**
 * Accepts only same-origin absolute paths ("/workspace/today").
 * Rejects external URLs, protocol-relative URLs, and backslash tricks —
 * anything else becomes the fallback. Never trust a raw `next` query parameter.
 */
export function safeNextPath(value: unknown, fallback: string = DEFAULT_POST_AUTH_PATH): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  const second = value.charAt(1);
  if (second === "\\" || second === "/") return fallback;
  if (value.includes("://")) return fallback;
  return value;
}

/** Login URL preserving the originally requested internal path. */
export function loginUrlFor(pathnameWithSearch: string): string {
  const [pathname, search] = pathnameWithSearch.split("?");
  const next = search ? `${pathname}?${search}` : pathname;
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}
