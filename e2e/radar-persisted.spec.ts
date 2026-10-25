import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-radar-stub-001";

function ymd(daysAgo: number): string | null {
  if (daysAgo < 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function adminClient() {
  return createClient(TEST_URL!, TEST_SERVICE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function stubLogin(page: Page, email: string): Promise<boolean> {
  const response = await page.request.post("/api/e2e/auth", {
    data: { email, password: PASSWORD },
  });
  return response.ok();
}

async function seedRows(userId: string) {
  const admin = adminClient();
  await admin.from("radar_clients").delete().eq("user_id", userId);
  const rows = [
    {
      user_id: userId,
      name: "Persist Dev",
      mobile: "9876543210",
      investment_type: "SIP",
      last_invested: null,
      last_contacted: ymd(100),
      is_new_client: false,
      note: "",
    },
    {
      user_id: userId,
      name: "Persist Riya",
      mobile: "",
      investment_type: "Lumpsum",
      last_invested: ymd(5),
      last_contacted: ymd(10),
      is_new_client: false,
      note: "",
    },
  ];
  const { error } = await admin.from("radar_clients").insert(rows);
  expect(error).toBeNull();
}

async function clearRows(userId: string) {
  const admin = adminClient();
  await admin.from("radar_clients").delete().eq("user_id", userId);
}

async function userIdFor(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  expect(error).toBeNull();
  const found = data.users.find((u) => u.email === email);
  if (!found) throw new Error(`stub user missing: ${email}`);
  return found.id;
}

/**
 * Authenticated persistence coverage (RCCF-MFD-16). Runs ONLY with
 * SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials pointing at a dedicated
 * test project — never a production account, never real Google OAuth. The
 * stub route establishes a real Supabase session; every assertion then runs
 * through the same UI and RLS as production.
 *
 * RCCF-MFD-18 Phase A: skipped — the UI under test moved off
 * /tools/client-radar (now a redirect) and /workspace/today is a placeholder
 * shell until Phase B. Helpers and assertions below are preserved untouched
 * for Phase B re-activation against /workspace/today.
 */
test.describe.skip("Client Radar persistence", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  const email = `e2e-radar-${Date.now()}@example.invalid`;

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page, email);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearRows(await userIdFor(email));
  });

  test.afterEach(async () => {
    await clearRows(await userIdFor(email));
  });

  test("authenticated radar loads seeded record with factual reason", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.goto("/tools/client-radar");

    const dev = page.getByRole("article", { name: /persist dev/i });
    await expect(dev).toBeVisible();
    await expect(dev).toContainText(/follow-up due · 100 days since contact/i);
    await expect(page.getByRole("article", { name: /persist riya/i })).toBeVisible();
  });

  test("loading state shows while fetching", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.route("**/rest/v1/radar_clients*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/tools/client-radar");

    await expect(page.getByRole("status").first()).toContainText(/loading your client radar/i);
    await expect(page.getByRole("article", { name: /persist dev/i })).toBeVisible();
  });

  test("mark contacted persists across reload", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.goto("/tools/client-radar");
    const dev = page.getByRole("article", { name: /persist dev/i });
    await expect(dev).toBeVisible();

    await dev.getByRole("button", { name: /mark contacted/i }).click();
    await expect(page.getByRole("status")).toContainText("Marked Persist Dev as contacted.");

    await page.reload();
    await expect(page.getByRole("article", { name: /persist dev/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /attention.*1/i })).toBeVisible();
  });

  test("undo reverts the persisted change", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.goto("/tools/client-radar");
    const dev = page.getByRole("article", { name: /persist dev/i });
    await expect(dev).toBeVisible();

    await dev.getByRole("button", { name: /mark contacted/i }).click();
    await expect(page.getByRole("status")).toContainText("Marked Persist Dev as contacted.");
    await page.getByRole("button", { name: /undo/i }).click();

    // Banner dismissal proves the revert persisted; only then reload.
    const restored = page.getByRole("article", { name: /persist dev/i });
    await expect(restored).toBeVisible();
    await expect(restored).toContainText(/follow-up due · 100 days since contact/i);
    await expect(page.getByRole("button", { name: /undo/i })).toHaveCount(0);

    await page.reload();
    const reloaded = page.getByRole("article", { name: /persist dev/i });
    await expect(reloaded).toBeVisible();
    await expect(reloaded).toContainText(/follow-up due · 100 days since contact/i);
  });

  test("manual refresh keeps radar state", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.goto("/tools/client-radar");
    await expect(page.getByRole("article", { name: /persist dev/i })).toBeVisible();

    await page.getByRole("button", { name: /refresh radar/i }).click();
    await expect(page.getByRole("article", { name: /persist dev/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /persist riya/i })).toBeVisible();
  });

  test("empty account shows the import empty state", async ({ page }) => {
    await page.goto("/tools/client-radar");
    await expect(page.getByRole("heading", { name: /client radar/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /download csv template/i })).toBeVisible();
  });

  test("no client data in localStorage or URL", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.goto("/tools/client-radar");
    await expect(page.getByRole("article", { name: /persist dev/i })).toBeVisible();

    expect(page.url()).not.toContain("Persist");
    const stored = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) out[key] = window.localStorage.getItem(key) ?? "";
      }
      return JSON.stringify(out);
    });
    expect(stored).not.toContain("Persist Dev");
    expect(stored).not.toContain("9876543210");
  });

  test("axe passes on the persisted dashboard", async ({ page }) => {
    await seedRows(await userIdFor(email));
    await page.goto("/tools/client-radar");
    await expect(page.getByRole("article", { name: /persist dev/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
