import { canonicalUrl } from "@/lib/seo/site";

/**
 * Homepage entity grounding: WebSite (product) + minimal Organization (operator).
 * Facts only (name + canonical URL) — no registration details, address,
 * founders, contact, socials, or logo claims. No SearchAction (the site
 * has no search). Mounted on `/` only.
 *
 * Identity model: the WebSite is the product ("MicroNest"); the Organization
 * is the operator (NEXT_PUBLIC_OPERATOR_NAME, e.g. "MicroNest Services").
 * When the operator name is unset, the Organization safely falls back to
 * "MicroNest" and nothing is fabricated.
 */
export function StructuredData() {
  const url = canonicalUrl("/");
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MicroNest",
    url,
  };
  const configuredOperator = process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() ?? "";
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: configuredOperator.length > 0 ? configuredOperator : "MicroNest",
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
