/**
 * Pure auth-route helpers. No browser or Next.js runtime imports so these
 * stay unit-testable in plain Node.
 */

/** Paths that require an authenticated session. */
const PROTECTED_PREFIXES = ["/workspace", "/admin"] as const;

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

/** Landing for active Super Admin accounts after authentication. */
export const ADMIN_POST_AUTH_PATH = "/admin";

/**
 * Post-login destination decision (pure; membership is resolved by the
 * caller from `admin_users`, never from client input).
 *
 * - An explicitly requested safe path that is not the generic default is
 *   always honored (deep links, proxy bounces) — for admins and users.
 * - Otherwise admins land on `/admin`, everyone else on the workspace.
 * - Unsafe/missing `next` values can never redirect off-site: they fall
 *   through to the role-appropriate default.
 */
export function resolvePostLoginDestination(
  rawNext: string | null | undefined,
  isAdmin: boolean,
): string {
  const next = safeNextPath(rawNext ?? undefined);
  if (rawNext && rawNext.length > 0 && next !== DEFAULT_POST_AUTH_PATH) return next;
  return isAdmin ? ADMIN_POST_AUTH_PATH : DEFAULT_POST_AUTH_PATH;
}

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
