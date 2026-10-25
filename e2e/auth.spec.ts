import { expect, test } from "@playwright/test";

const dummyAuth = process.env.SUPABASE_E2E === "dummy";

/**
 * RCCF-MFD-18 Phase A coverage. Real Google OAuth cannot run in CI, so these
 * tests verify route behavior, public-tool regression, and the login shell —
 * never a faked OAuth success. Manual OAuth acceptance is documented in the
 * phase report.
 *
 * Two modes (see playwright.config.ts):
 * - default (no Supabase vars): proxy passes through; the workspace shells
 *   render their placeholders without a session.
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
    await expect(page.getByRole("heading", { name: /mfd relationship workspace/i })).toBeVisible();

    await page.goto("/tools/message-studio");
    await expect(page.getByRole("button", { name: /generate message/i })).toBeVisible();
  });

  test("workspace shells render without login when auth is not configured", async ({ page }) => {
    test.skip(
      dummyAuth || process.env.SUPABASE_E2E === "stub",
      "Fail-open applies only to the default (unconfigured) mode.",
    );
    // No Supabase credentials in this environment: proxy passes through and
    // the Phase A shells render (documented fail-open).
    await page.goto("/workspace/today");
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();

    await page.goto("/workspace/clients");
    await expect(page.getByRole("heading", { name: /^clients$/i })).toBeVisible();
  });

  test("unauthenticated workspace redirects to login preserving next", async ({ page }) => {
    test.skip(!dummyAuth, "Requires SUPABASE_E2E=dummy so the proxy enforces auth.");
    await page.goto("/workspace/today");
    await expect(page).toHaveURL(/\/login\?next=%2Fworkspace%2Ftoday/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("unauthenticated client detail redirects to login", async ({ page }) => {
    test.skip(!dummyAuth, "Requires SUPABASE_E2E=dummy so the proxy enforces auth.");
    await page.goto("/workspace/clients/123e4567-e89b-42d3-a456-426614174000");
    await expect(page).toHaveURL(/\/login\?next=.*workspace.*clients/);
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
