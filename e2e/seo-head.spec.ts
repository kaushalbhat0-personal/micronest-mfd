import { expect, test } from "@playwright/test";

/**
 * SEO head contract (technical foundation phase).
 * Runs against any server mode: public head output does not depend on auth.
 */
test.describe("SEO head + crawl files", () => {
  test("homepage head carries title, description, canonical, OG, Twitter, JSON-LD", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/MicroNest/);
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /.+/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /micronest-mfd-six\.vercel\.app\/?$/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /.+/,
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "website",
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary",
    );
    const ldJson = page.locator('script[type="application/ld+json"]');
    await expect(ldJson.first()).toBeAttached();
    const types: string[] = await ldJson.evaluateAll((nodes) =>
      nodes.map((node) => {
        try {
          return JSON.parse(node.textContent ?? "{}")["@type"] ?? "";
        } catch {
          return "";
        }
      }),
    );
    expect(types).toContain("WebSite");
    expect(types).toContain("Organization");
    expect(types).not.toContain("FAQPage");
    expect(types).not.toContain("Product");
  });

  test("public routes expose clean canonicals", async ({ page }) => {
    for (const [path, suffix] of [
      ["/privacy", "/privacy"],
      ["/terms", "/terms"],
      ["/support", "/support"],
      ["/premium", "/premium"],
      ["/tools/message-studio", "/tools/message-studio"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`micronest-mfd-six\\.vercel\\.app${suffix}$`),
      );
    }
  });

  test("login is explicitly noindex", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("robots.txt allows public and references the sitemap", async ({ page }) => {
    const response = await page.request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toMatch(/User-Agent: \*/);
    expect(body).toMatch(/Disallow: \/api\//);
    expect(body).toMatch(/micronest-mfd-six\.vercel\.app\/sitemap\.xml/);
  });

  test("sitemap.xml lists only indexable public pages", async ({ page }) => {
    const response = await page.request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    for (const path of ["/", "/premium", "/privacy", "/terms", "/support"]) {
      expect(body).toContain(`micronest-mfd-six.vercel.app${path === "/" ? "/" : path}`);
    }
    expect(body).toContain("tools/message-studio");
    expect(body).not.toMatch(/\/login|\/auth|\/workspace|\/api/);
  });

  test("icon and manifest resolve", async ({ page }) => {
    // SVG icon convention: served at /icon.svg and linked from <head> in
    // production builds (verified in build output; dev HMR can lag new
    // route files, so only the 200 is asserted live here).
    // /favicon.ico intentionally has no raster asset yet (see P2 carryover).
    expect((await page.request.get("/icon.svg")).ok()).toBe(true);
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const json = await manifest.json();
    expect(json.name).toBe("MicroNest");
  });

  test("workspace stays auth-gated (no private content to crawlers)", async ({
    page,
  }) => {
    await page.goto("/workspace/today");
    // Unconfigured/dev servers render the signed-out shell; a configured
    // server redirects to login. Either way no client data is exposed.
    const url = page.url();
    const isLogin = /\/login/.test(url);
    const isWorkspace = /\/workspace\/today/.test(url);
    expect(isLogin || isWorkspace).toBe(true);
    await expect(page.locator("article")).toHaveCount(0);
  });
});
