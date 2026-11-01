import { expect, test } from "@playwright/test";

/**
 * Public marketing surface contract (marketing UX correction):
 * - header shows brand + Sign in, never workspace navigation
 * - hero + closing CTA + Android strip are centered on mobile,
 *   left-aligned on desktop
 * - Android CTA stays hidden until NEXT_PUBLIC_ANDROID_APK_URL is set
 *   (E2E never sets it, so absence is asserted here)
 */
test.describe("Marketing public surface", () => {
  test("no workspace navigation or bottom nav on /", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: /^sign in$/i })).toBeVisible();
    for (const name of [/^today$/i, /^messages$/i, /^clients$/i, /^follow-ups$/i]) {
      await expect(header.getByRole("link", { name })).toHaveCount(0);
    }
    await expect(page.getByTestId("mobile-bottom-nav")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^go to today$/i })).toHaveCount(0);
  });

  test("hero composition follows the breakpoint", async ({ page }, testInfo) => {
    await page.goto("/");
    const heading = page.locator("#home-heading");
    await expect(heading).toBeVisible();
    const align = await heading.evaluate((el) => getComputedStyle(el).textAlign);
    const ctaAlign = await page
      .locator("#home-heading")
      .locator("..")
      .evaluate((el) => getComputedStyle(el).textAlign);
    if (testInfo.project.name === "mobile") {
      expect(align).toBe("center");
      expect(ctaAlign).toBe("center");
    } else {
      expect(align).toBe("left");
      expect(ctaAlign).toBe("left");
    }
  });

  test("closing CTA composition follows the breakpoint", async ({ page }, testInfo) => {
    await page.goto("/");
    // PPR streams the CTA block twice (shell + streamed CTAs); assert on
    // the first — both carry the same composition classes.
    const section = page.locator('section[aria-labelledby="cta-heading"]').first();
    await expect(section).toBeVisible();
    const align = await section.evaluate((el) => getComputedStyle(el).textAlign);
    if (testInfo.project.name === "mobile") {
      expect(align).toBe("center");
    } else {
      expect(align).toBe("left");
    }
  });

  test("page has no horizontal overflow on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Overflow check is a mobile concern.");
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("android CTA stays hidden without a configured URL", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /download android app/i })).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="android-app-heading"]')).toHaveCount(
      0,
    );
  });
});
