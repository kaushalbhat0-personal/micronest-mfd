import type { Metadata } from "next";

/**
 * SEO/site source of truth (domain-portable).
 *
 * SITE_URL is the canonical public origin. It is the CURRENT production
 * Vercel hostname — intentionally NOT a permanent brand claim. When the
 * final custom domain is purchased, changing this ONE constant (plus the
 * native-shell URL, a separate release decision) re-points metadataBase,
 * canonicals, sitemap, robots, OG URLs, and JSON-LD together.
 *
 * Override with NEXT_PUBLIC_SITE_URL only for preview/ephemeral checks;
 * never point it at a host you do not want indexed.
 */

const FALLBACK_SITE_URL = "https://micronest-mfd-six.vercel.app";

/** Canonical public origin, no trailing slash. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  const value = raw && raw.trim().length > 0 ? raw.trim() : FALLBACK_SITE_URL;
  return value.replace(/\/$/, "");
}

/** Absolute canonical URL for a clean app path (leading slash required). */
export function canonicalUrl(path: string): string {
  return `${siteUrl()}${path}`;
}

/**
 * Complete metadata for an indexable public route: title, description,
 * clean canonical, and full Open Graph (title/description/type/url plus
 * the shared site defaults). One call per route keeps every public page
 * consistent without repetitive literals.
 *
 * Next.js replaces (not deep-merges) a route's openGraph over the root
 * layout's, so the full OG set must be declared here per route.
 */
export function publicRouteMeta(
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "MicroNest",
      title,
      description,
      url: canonicalUrl(path),
    },
  };
}

/**
 * Genuinely indexable public pages. Login, auth, workspace, and API
 * surfaces are deliberately absent (see robots + noindex boundaries).
 */
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/premium",
  "/privacy",
  "/terms",
  "/support",
  "/tools/message-studio",
] as const;
