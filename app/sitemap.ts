import type { MetadataRoute } from "next";
import { PUBLIC_SITEMAP_PATHS, canonicalUrl } from "@/lib/seo/site";

/**
 * Indexable public pages only. Login, auth, workspace, and API surfaces
 * are excluded by construction (see robots + noindex boundaries).
 * Absolute URLs flow from the single SITE_URL source of truth, so the
 * future custom-domain migration re-points the whole sitemap at once.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: canonicalUrl(path),
  }));
}
