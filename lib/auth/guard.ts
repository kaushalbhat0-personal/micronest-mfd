/**
 * Pure auth-route helpers. No browser or Next.js runtime imports so these
 * stay unit-testable in plain Node.
 */

/** Paths that require an authenticated session. */
const PROTECTED_PREFIXES = ["/tools/client-radar"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Accepts only same-origin absolute paths ("/tools/client-radar").
 * Rejects external URLs, protocol-relative URLs, and backslash tricks —
 * anything else becomes "/". Never trust a raw `next` query parameter.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  const second = value.charAt(1);
  if (second === "\\" || second === "/") return "/";
  if (value.includes("://")) return "/";
  return value;
}

/** Login URL preserving the originally requested internal path. */
export function loginUrlFor(pathnameWithSearch: string): string {
  const [pathname, search] = pathnameWithSearch.split("?");
  const next = search ? `${pathname}?${search}` : pathname;
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}
