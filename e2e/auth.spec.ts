import { expect, test } from "@playwright/test";

const dummyAuth = process.env.SUPABASE_E2E === "dummy";

/**
 * Phase A foundation coverage. Real Google OAuth cannot run in CI, so these
 * tests verify route behavior, public-tool regression, and the login shell —
 * never a faked OAuth success. Manual OAuth acceptance is documented in the
 * phase report.
 *
 * Two modes (see playwright.config.ts):
 * - default (no Supabase vars): proxy passes through; session-local suites run.
 * - SUPABASE_E2E=dummy: session lookup fails closed; the real proxy redirect
 *   to /login is asserted. Run only this file in dummy mode.
 */
test.describe("Auth foundation", () => {
  test("login page renders with Google CTA and no password form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/laptop and phone/i)).toBeVisible();
  });

  test("public routes stay public without login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /small tools/i })).toBeVisible();

    await page.goto("/tools/message-studio");
    await expect(page.getByRole("button", { name: /generate message/i })).toBeVisible();

    await page.goto("/tools/followups");
    await expect(page.getByRole("heading", { name: /follow-up workspace/i })).toBeVisible();
  });

  test("client radar stays usable session-local when auth is not configured", async ({ page }) => {
    test.skip(dummyAuth, "Fail-open applies only to the default (unconfigured) mode.");
    // No Supabase credentials in this environment: proxy passes through and
    // the existing session-local Radar keeps working (documented fail-open).
    await page.goto("/tools/client-radar");
    await expect(page.getByRole("heading", { name: /client radar/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /download csv template/i })).toBeVisible();
  });

  test("unauthenticated radar redirects to login preserving next", async ({ page }) => {
    test.skip(!dummyAuth, "Requires SUPABASE_E2E=dummy so the proxy enforces auth.");
    await page.goto("/tools/client-radar");
    await expect(page).toHaveURL(/\/login\?next=%2Ftools%2Fclient-radar/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("no client data in storage or URL on public and login pages", async ({ page }) => {
    for (const path of ["/", "/login", "/tools/message-studio"]) {
      await page.goto(path);
      expect(page.url()).not.toMatch(/code=|token=|access_token/);
      const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
      expect(stored).not.toMatch(/sb-.*-auth-token/);
    }
  });
});
