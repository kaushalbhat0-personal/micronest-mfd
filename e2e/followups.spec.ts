import { expect, test } from "@playwright/test";

/**
 * RCCF-MFD-18 Phase A transitional spec.
 *
 * The standalone Follow-up Workspace was retired as a route and must not
 * survive as a second source of truth: the domain helpers
 * (features/followups/*) are preserved untouched and covered by unit tests,
 * and follow-ups return as a first-class workspace capability in Phase C.
 * This file pins the transitional redirect contract only.
 */
test.describe("Follow-up transition", () => {
  test("old route redirects to Today with the followups filter", async ({ page }) => {
    await page.goto("/tools/followups");
    await expect(page).toHaveURL(/\/workspace\/today\?filter=followups/);
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();
  });
});
