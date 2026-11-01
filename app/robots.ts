import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/lib/seo/site";

/**
 * Crawl/index control.
 * - Public marketing/content stays crawlable (sitemap lists it).
 * - /api/* is disallowed (route handlers carry no metadata of their own).
 * - Authenticated/auth routes are NOT disallowed here: Googlebot must be
 *   able to fetch them to observe their noindex directives (meta on
 *   /login + /workspace/*, X-Robots-Tag on /auth/* + /api/*).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${canonicalUrl("/sitemap.xml")}`,
  };
}
