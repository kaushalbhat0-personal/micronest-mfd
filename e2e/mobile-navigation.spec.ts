import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const stubMode = process.env.SUPABASE_E2E === "stub";
const stubConfigured =
  stubMode &&
  Boolean(
    process.env.SUPABASE_TEST_URL &&
    process.env.SUPABASE_TEST_ANON_KEY &&
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
  );

const PASSWORD = "e2e-nav-stub-001";
const email = `e2e-nav-${Date.now()}@example.invalid`;

async function stubLogin(page: Page): Promise<boolean> {
  const response = await page.request.post("/api/e2e/auth", {
    data: { email, password: PASSWORD },
  });
  return response.ok();
}

/**
 * Premium brand header + mobile bottom navigation (RCCF-MFD-43).
 * Signed-out assertions run everywhere; the authenticated bottom-nav flow
 * needs a real stub session and is skipped without SUPABASE_TEST_*
 * credentials (real OAuth stays manual-only — never faked here).
 */
test.describe("Navigation brand + mobile bottom nav", () => {
  test("brand lockup is MicroNest with an MFD badge, never the old lockup", async ({ page }) => {
    await page.goto("/");
    const brand = page.getByTestId("brand-mark");
    await expect(brand).toBeVisible();
    await expect(brand).toContainText("MicroNest");
    await expect(brand).toContainText("MFD");
    await expect(page.getByText("MicroNest · MFD Workspace", { exact: true })).toHaveCount(0);
  });

  test("signed-out pages never render the authenticated bottom nav", async ({ page }) => {
    for (const path of [
      "/",
      "/login",
      "/tools/message-studio",
      "/workspace/today",
      "/workspace/clients",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("mobile-bottom-nav")).toHaveCount(0);
    }
  });

  test("signed-out primary links keep 44px+ touch targets", async ({ page }) => {
    await page.goto("/");
    for (const name of [/^workspace$/i, /^message studio$/i, /^sign in$/i]) {
      const box = await page.getByRole("link", { name }).first().boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("0 serious/critical axe violations with the new header", async ({ page }) => {
    for (const path of ["/", "/login", "/tools/message-studio"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    }
  });

  test.describe("authenticated", () => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

    test("mobile bottom nav: active states, keyboard, More sheet, sign out", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "Bottom nav is a mobile-only surface.");
      test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
      expect(await stubLogin(page)).toBe(true);

      await page.goto("/workspace/today");
      const bottom = page.getByTestId("mobile-bottom-nav");
      await expect(bottom).toBeVisible();
      // Phase A: exactly one navigation per viewport — the top header nav
      // stays hidden on mobile, the bottom nav never renders on desktop.
      await expect(page.locator("header nav")).toBeHidden();

      // Active state is never color alone: indicator + weight + aria-current.
      const today = bottom.getByRole("link", { name: /^today$/i });
      await expect(today).toHaveAttribute("aria-current", "page");
      const clients = bottom.getByRole("link", { name: /^client book$/i });
      const studio = bottom.getByRole("link", { name: /^messages$/i });
      await expect(studio).toContainText("Messages");

      for (const item of [
        today,
        clients,
        studio,
        bottom.getByRole("button", { name: /^more$/i }),
      ]) {
        const box = await item.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
      }

      // Keyboard: Enter activates the focused destination.
      await clients.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/workspace\/clients/);
      await expect(
        page.getByTestId("mobile-bottom-nav").getByRole("link", { name: /^client book$/i }),
      ).toHaveAttribute("aria-current", "page");

      await studio.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/tools\/message-studio/);
      await expect(
        page.getByTestId("mobile-bottom-nav").getByRole("link", { name: /^messages$/i }),
      ).toHaveAttribute("aria-current", "page");

      // More sheet: identity, Escape, focus return.
      const more = page.getByTestId("mobile-bottom-nav").getByRole("button", { name: /^more$/i });
      await more.click();
      const sheet = page.getByRole("dialog", { name: /account/i });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText(email)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(more).toBeFocused();

      // Sign out through the sheet returns the signed-out header.
      await more.click();
      await expect(page.getByRole("dialog", { name: /account/i })).toBeVisible();
      await page
        .getByRole("dialog", { name: /account/i })
        .getByRole("button", { name: /sign out/i })
        .click();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("link", { name: /^sign in$/i })).toBeVisible();
      await expect(page.getByTestId("mobile-bottom-nav")).toHaveCount(0);
    });

    test("mobile bottom nav never covers page content", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "Bottom nav is a mobile-only surface.");
      test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
      expect(await stubLogin(page)).toBe(true);

      await page.goto("/workspace/clients");
      const bottom = page.getByTestId("mobile-bottom-nav");
      await expect(bottom).toBeVisible();
      const navBox = await bottom.boundingBox();
      // Scroll to the very end: the last content must sit above the nav.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const addButton = page.getByRole("button", { name: /add client/i }).last();
      const contentBox = await addButton.boundingBox();
      expect(contentBox).not.toBeNull();
      expect(contentBox!.y + contentBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
    });

    test("desktop keeps the top header and never shows the bottom nav", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Desktop-only composition.");
      test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
      expect(await stubLogin(page)).toBe(true);

      await page.goto("/workspace/today");
      await expect(page.getByTestId("mobile-bottom-nav")).toBeHidden();
      // Phase A: the header is the only navigation system on desktop.
      await expect(page.getByRole("navigation")).toHaveCount(1);
      const nav = page.getByRole("navigation", { name: /primary/i });
      await expect(nav.getByRole("link", { name: /^today$/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /^client book$/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /^messages$/i })).toBeVisible();
      await expect(nav.getByRole("link", { name: /^today$/i })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.getByRole("button", { name: /account:/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);

      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  });
});
