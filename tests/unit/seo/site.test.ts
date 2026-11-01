import { describe, expect, it, afterEach } from "vitest";
import {
  canonicalUrl,
  siteUrl,
  publicRouteMeta,
  PUBLIC_SITEMAP_PATHS,
} from "@/lib/seo/site";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const KEY = "NEXT_PUBLIC_SITE_URL";
const previous = process.env[KEY];

afterEach(() => {
  if (previous === undefined) delete process.env[KEY];
  else process.env[KEY] = previous;
});

describe("site URL source of truth", () => {
  it("defaults to the current production hostname without a trailing slash", () => {
    delete process.env[KEY];
    expect(siteUrl()).toBe("https://micronest-mfd-six.vercel.app");
  });

  it("honors an explicit override and strips a trailing slash", () => {
    process.env[KEY] = "https://example.com/";
    expect(siteUrl()).toBe("https://example.com");
  });

  it("builds absolute canonical URLs from clean paths", () => {
    delete process.env[KEY];
    expect(canonicalUrl("/privacy")).toBe("https://micronest-mfd-six.vercel.app/privacy");
    expect(canonicalUrl("/")).toBe("https://micronest-mfd-six.vercel.app/");
  });
});

describe("public route metadata helper", () => {
  it("emits title, description, clean canonical, and full OG in one call", () => {
    delete process.env[KEY];
    const meta = publicRouteMeta("/privacy", "Privacy Policy — MicroNest", "How data.");
    expect(meta.title).toBe("Privacy Policy — MicroNest");
    expect(meta.description).toBe("How data.");
    expect(meta.alternates).toEqual({ canonical: "/privacy" });
    expect(meta.openGraph).toMatchObject({
      type: "website",
      locale: "en_US",
      siteName: "MicroNest",
      title: "Privacy Policy — MicroNest",
      description: "How data.",
      url: "https://micronest-mfd-six.vercel.app/privacy",
    });
  });
});

describe("sitemap", () => {
  it("lists only genuinely indexable public pages as absolute URLs", () => {
    delete process.env[KEY];
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual(PUBLIC_SITEMAP_PATHS.map((path) => canonicalUrl(path)));
    for (const url of urls) {
      expect(url.startsWith("https://")).toBe(true);
      expect(url).not.toMatch(/\/login|\/auth|\/workspace|\/api/);
    }
  });
});

describe("robots", () => {
  it("allows public crawling, keeps /api/ out, and references the sitemap", () => {
    delete process.env[KEY];
    const config = robots();
    expect(config.sitemap).toBe("https://micronest-mfd-six.vercel.app/sitemap.xml");
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const wildcard = rules.find(
      (rule) => rule && typeof rule === "object" && "userAgent" in rule,
    ) as { disallow?: string | string[] } | undefined;
    expect(wildcard).toBeDefined();
    const disallow = wildcard?.disallow ?? [];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    expect(list).toContain("/api/");
    // Workspace/auth stay crawlable so their noindex directives are seen;
    // they are excluded from indexing via meta + headers, not robots.
    expect(list.join(" ")).not.toMatch(/\/workspace|\/auth|\/login/);
  });
});
