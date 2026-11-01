import { canonicalUrl } from "@/lib/seo/site";

/**
 * Homepage entity grounding: WebSite + minimal Organization.
 * Facts only (name + canonical URL) — no registration details, address,
 * founders, contact, socials, or logo claims. No SearchAction (the site
 * has no search). Mounted on `/` only.
 */
export function StructuredData() {
  const url = canonicalUrl("/");
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MicroNest",
    url,
  };
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MicroNest",
    url,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  );
}
