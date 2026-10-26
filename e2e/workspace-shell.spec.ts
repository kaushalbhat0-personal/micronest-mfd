import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const dummyAuth = process.env.SUPABASE_E2E === "dummy";

/**
 * RCCF-MFD-18 Phase A: workspace shell, transitional redirects, navigation,
 * and privacy. Runs in the default (unconfigured Supabase) mode, where the
 * proxy passes through and the shells render placeholders.
 */
test.describe("Workspace shell", () => {
  test.skip(dummyAuth, "Shell rendering asserts the default fail-open mode.");

  test.beforeEach(async () => {
    test.skip(
      Boolean(process.env.SUPABASE_E2E),
      "Shell placeholders assert the default unconfigured mode.",
    );
  });

  test("home presents the workspace as the product, not three tools", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /know who to call/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^get started$/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /open message studio/i }).first()).toBeVisible();
    // Retired standalone products are no longer advertised.
    await expect(page.getByRole("heading", { name: /^client radar$/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^follow-up workspace$/i })).toHaveCount(0);
  });

  test("retired client-radar route redirects to today", async ({ page }) => {
    await page.goto("/tools/client-radar");
    await expect(page).toHaveURL(/\/workspace\/today/);
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();
  });

  test("retired follow-ups route redirects to today with filter", async ({ page }) => {
    await page.goto("/tools/followups");
    await expect(page).toHaveURL(/\/workspace\/today\?filter=followups/);
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();
  });

  test("today renders the signed-out shell with an honest empty state", async ({ page }) => {
    await page.goto("/workspace/today");
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();
    await expect(page.getByText(/who should you talk to today/i)).toBeVisible();
    await expect(page.getByText(/your today list lives here/i)).toBeVisible();
    // No mock clients must ever appear in the shell.
    await expect(page.locator("article")).toHaveCount(0);
  });

  test("clients shell and invalid detail id render cleanly", async ({ page }) => {
    await page.goto("/workspace/clients");
    await expect(page.getByRole("heading", { name: /^clients$/i })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);

    await page.goto("/workspace/clients/not-a-client-id");
    await expect(page.getByText(/couldn't find that client/i)).toBeVisible();

    // A well-formed but unknown id resolves safely: with no backend in this
    // mode it renders the same clean not-found state (never a raw error).
    await page.goto("/workspace/clients/123e4567-e89b-42d3-a456-426614174000");
    await expect(page.getByText(/couldn't find that client/i)).toBeVisible();
    // The opaque id must not leak client data — and is not echoed back.
    expect(page.url()).not.toMatch(/name=|phone=|mobile=|note=/);
  });

  test("single header navigation links workspace and studio with touch targets", async ({
    page,
  }) => {
    await page.goto("/workspace/today");
    // Phase A: the header is the only navigation system — no in-page pills.
    const navs = page.getByRole("navigation");
    await expect(navs).toHaveCount(1);
    const nav = page.getByRole("navigation", { name: /primary/i });
    await expect(nav.getByRole("link", { name: /^workspace$/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^message studio$/i })).toBeVisible();
    for (const name of [/^workspace$/i, /^message studio$/i]) {
      const box = await nav.getByRole("link", { name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await nav.getByRole("link", { name: /^message studio$/i }).click();
    await expect(page).toHaveURL(/\/tools\/message-studio/);
  });

  test("no client PII in workspace URLs or localStorage", async ({ page }) => {
    for (const path of [
      "/workspace/today",
      "/workspace/clients",
      "/workspace/clients/123e4567-e89b-42d3-a456-426614174000",
    ]) {
      await page.goto(path);
      expect(page.url()).not.toMatch(/name=|phone=|mobile=|note=|code=|token=/);
      const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
      expect(stored).not.toMatch(/client|radar|followup|sb-.*-auth-token/i);
    }
  });

  test("0 serious/critical axe violations on workspace shells", async ({ page }) => {
    for (const path of [
      "/",
      "/workspace/today",
      "/workspace/clients",
      "/workspace/clients/123e4567-e89b-42d3-a456-426614174000",
      "/tools/message-studio",
      "/login",
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    }
  });
});
