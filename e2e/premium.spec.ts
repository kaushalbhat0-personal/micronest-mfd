import { expect, test } from "@playwright/test";

const stubAuth = process.env.SUPABASE_E2E === "stub";

/**
 * MFD-78 public validation funnel. The research page is fully public, so
 * every test below runs in the default (unconfigured Supabase) mode —
 * except the live-submission round trip, which needs a real project and is
 * stub-gated like the other authenticated suites.
 */
test.describe("Validation funnel", () => {
  test("marketing page funnels into signup and research", async ({ page }) => {
    await page.goto("/");
    // Both hero and closing CTAs render: wait for the streamed
    // session-aware CTAs to settle so clicks can't hit a detached
    // Suspense fallback node.
    const tryLinks = page.getByRole("link", { name: /try micronest free/i });
    const needLinks = page.getByRole("link", { name: /tell us what you need/i });
    await expect(tryLinks).toHaveCount(2);
    await expect(needLinks).toHaveCount(3);

    await tryLinks.first().click();
    // Cold dev-server compiles /login on demand; allow extra time.
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    await page.goto("/");
    await expect(needLinks.first()).toBeVisible();
    await needLinks.first().click();
    await expect(page).toHaveURL(/\/premium/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: /help shape micronest/i })).toBeVisible();
  });

  test("research form renders every section", async ({ page }) => {
    await page.goto("/premium");
    await expect(page.getByRole("heading", { name: /about you/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /current workflow/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /more useful/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /realistically be worth/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /stay in touch/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /share my feedback/i }),
    ).toBeVisible();
  });

  test("required-field validation blocks an empty submit", async ({ page }) => {
    await page.goto("/premium");
    await page.getByRole("button", { name: /share my feedback/i }).click();
    await expect(page.getByText(/choose your country/i).first()).toBeVisible();
    await expect(page).not.toHaveURL(/workspace/);
  });

  test("feature multi-select and WTP bands behave", async ({ page }) => {
    await page.goto("/premium");

    const followups = page.getByRole("checkbox", { name: /follow-up reminders/i });
    await followups.check();
    await expect(followups).toBeChecked();

    const free = page.getByRole("radio", { name: /^free$/i });
    await free.check();
    await expect(page.locator("#wtp-exact-amount")).toHaveCount(0);

    const band = page.getByRole("radio", { name: /\$10–25/i });
    await band.check();
    await expect(page.locator("#wtp-exact-amount")).toBeVisible();
    await expect(page.locator("#wtp-currency")).toBeVisible();
  });

  test("no sensitive data is written to storage on the funnel pages", async ({ page }) => {
    for (const path of ["/", "/premium"]) {
      await page.goto(path);
      const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
      expect(stored).not.toMatch(/sb-.*-auth-token/);
      const session = await page.evaluate(() => JSON.stringify({ ...window.sessionStorage }));
      expect(session).not.toMatch(/email|message|quoted/i);
    }
  });

  test("submission succeeds end to end", async ({ page }) => {
    test.skip(!stubAuth, "Requires SUPABASE_E2E=stub with a real test project.");
    await page.goto("/premium");
    await page.locator("#wtp-country").selectOption({ index: 1 });
    await page.locator("#wtp-profession").selectOption("consultant");
    await page.locator("#wtp-client-count").selectOption("11-25");
    await page.getByRole("checkbox", { name: /google sheets/i }).check();
    await page.getByRole("checkbox", { name: /follow-up reminders/i }).check();
    await page.getByRole("radio", { name: /\$10–25/i }).check();
    await page.locator("#wtp-exact-amount").fill("20");
    await page.locator("#wtp-currency").selectOption("USD");
    await page.getByRole("button", { name: /share my feedback/i }).click();
    await expect(
      page.getByText(/helps us decide what micronest should become next/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /continue to micronest/i }),
    ).toBeVisible();
  });
});
