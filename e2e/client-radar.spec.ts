import { expect, test } from "@playwright/test";

/**
 * RCCF-MFD-18 Phase A transitional spec.
 *
 * The standalone Client Radar import/triage UI was retired as a route: the
 * domain engine (features/radar/*) is preserved untouched and covered by
 * unit tests, and the UI returns in Phase B at /workspace/today.
 * This file pins the transitional redirect contract only.
 */
test.describe("Client Radar transition", () => {
  test("old route redirects to the Today workspace", async ({ page }) => {
    await page.goto("/tools/client-radar");
    await expect(page).toHaveURL(/\/workspace\/today/);
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();
  });
});
