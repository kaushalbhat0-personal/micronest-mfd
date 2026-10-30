/**
 * Navigation primitives (RCCF-MFD-43). Pure pathname → destination mapping
 * for the top header and the mobile bottom nav. No browser or Next.js
 * imports so this stays unit-testable in plain Node.
 */

export type NavDestination = "today" | "clients" | "studio" | null;

/**
 * Which primary destination owns a pathname. Detail and legacy routes
 * resolve to their section (e.g. /workspace/clients/<id> → clients);
 * anything else (/, /login) owns nothing so no tab reads active.
 */
export function activeDestination(pathname: string | null): NavDestination {
  if (!pathname) return null;
  if (pathname === "/workspace/today" || pathname.startsWith("/workspace/today/")) return "today";
  if (pathname.startsWith("/workspace/clients")) return "clients";
  if (pathname.startsWith("/tools/message-studio")) return "studio";
  return null;
}
