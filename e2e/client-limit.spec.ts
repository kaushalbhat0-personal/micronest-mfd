import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-limit-stub-001";
const email = `e2e-limit-${Date.now()}@example.invalid`;
const HUNDREDTH = `Limit Hundred ${Date.now().toString(36)}`;
const OVERFLOW = `Limit Overflow ${Date.now().toString(36)}`;

function adminClient() {
  return createClient(TEST_URL!, TEST_SERVICE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function stubLogin(page: Page): Promise<boolean> {
  const response = await page.request.post("/api/e2e/auth", {
    data: { email, password: PASSWORD },
  });
  return response.ok();
}

async function userIdFor(): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  expect(error).toBeNull();
  const found = data.users.find((u) => u.email === email);
  if (!found) throw new Error(`stub user missing: ${email}`);
  return found.id;
}

async function clearAll() {
  const admin = adminClient();
  await admin
    .from("radar_clients")
    .delete()
    .eq("user_id", await userIdFor());
}

/** Seeds N owned clients in one insert; returns their ids. */
async function seedClients(count: number): Promise<string[]> {
  const admin = adminClient();
  const userId = await userIdFor();
  const rows = Array.from({ length: count }, (_, i) => ({
    user_id: userId,
    name: `Limit Seed ${String(i + 1).padStart(3, "0")}`,
  }));
  const { data, error } = await admin.from("radar_clients").insert(rows).select("id");
  expect(error).toBeNull();
  return (data ?? []).map((r) => r.id as string);
}

async function ownedCount(): Promise<number> {
  const admin = adminClient();
  const { count, error } = await admin
    .from("radar_clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", await userIdFor());
  expect(error).toBeNull();
  return count ?? -1;
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

/**
 * Free 100-client validation boundary.
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials.
 * 99 → #100 allowed → #101 blocked (dialog + /premium handoff) →
 * over-limit import rejected whole → updates/follow-ups unaffected.
 */
test.describe("Free client limit", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearAll();
  });

  test.afterEach(async () => {
    await clearAll();
  });

  test("99 → 100 allowed, 101 blocked with research handoff", async ({ page }) => {
    await seedClients(99);
    await page.goto("/workspace/clients");
    await expect(page.getByText("99 / 100 free")).toBeVisible();
    await expect(page.getByText(/getting close to your free 100-client limit/i)).toBeVisible();
    await page.getByRole("button", { name: /dismiss/i }).click();
    await expect(page.getByText(/getting close to your free 100-client limit/i)).toHaveCount(0);

    // Client #100 succeeds through the normal manual flow.
    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByLabel("Client name").fill(HUNDREDTH);
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(page.getByText(HUNDREDTH)).toBeVisible();
    await expect(page.getByText("100 / 100 free")).toBeVisible();
    expect(await ownedCount()).toBe(100);

    // Client #101 is refused with the boundary dialog — nothing inserted.
    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByLabel("Client name").fill(OVERFLOW);
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /you've reached the free limit/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/free for up to 100 clients/i)).toBeVisible();
    await expectAxeClean(page);
    const cta = dialog.getByRole("link", { name: /tell us what you need/i });
    await expect(cta).toHaveAttribute("href", "/premium?context=limit");
    expect(await ownedCount()).toBe(100);
    await expect(page.getByText(OVERFLOW)).toHaveCount(0);

    // The handoff reaches the research form with the limit context.
    await cta.click();
    await expect(page).toHaveURL(/\/premium\?context=limit/);
    await expect(page.getByRole("heading", { name: /help shape micronest/i })).toBeVisible();
    await expect(page.getByLabel("Approximate client count")).toHaveValue("101-250");

    // Back on Clients, the dialog closes and the book is intact.
    await page.goto("/workspace/clients");
    await expect(page.getByText(HUNDREDTH)).toBeVisible();
    await expect(page.getByText("100 / 100 free")).toBeVisible();
  });

  test("over-limit import is rejected whole; updates still apply", async ({ page }) => {
    await seedClients(90);
    await page.goto("/workspace/clients");
    await page.getByRole("button", { name: /add from file/i }).click();
    await page.locator("#import-file").setInputFiles("e2e/fixtures/import-over-limit.csv");
    await expect(page.getByRole("button", { name: /review 11 rows/i })).toBeVisible();
    await page.getByRole("button", { name: /review 11 rows/i }).click();
    await expect(page.getByText("11 rows found")).toBeVisible();
    await page.getByRole("button", { name: /add 11 clients/i }).click();

    // Whole-file refusal with exact numbers; zero writes.
    await expect(page.getByText(/would take you to 101 of 100 free clients/i)).toBeVisible();
    await expect(page.getByText(/remove 11 new clients/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /tell us what you need/i }),
    ).toBeVisible();
    await expectAxeClean(page);
    expect(await ownedCount()).toBe(90);
    await page.keyboard.press("Escape");

    // An updates-only file at the boundary still applies.
    await page.goto("/workspace/clients");
    await page.getByRole("button", { name: /add from file/i }).click();
    await page.locator("#import-file").setInputFiles("e2e/fixtures/import-limit-update.csv");
    await expect(page.getByRole("button", { name: /review 1 rows/i })).toBeVisible();
    await page.getByRole("button", { name: /review 1 rows/i }).click();
    await expect(page.getByText("1 will update")).toBeVisible();
    await page.getByRole("button", { name: /save 1 clients/i }).click();
    await expect(page.getByText("Clients updated")).toBeVisible();
    expect(await ownedCount()).toBe(90);
  });

  test("workflows stay usable at exactly 100", async ({ page }) => {
    const ids = await seedClients(100);
    await page.goto(`/workspace/clients/${ids[0]}`);
    await expect(page.getByRole("heading", { name: /limit seed 001/i })).toBeVisible();

    // Follow-up planning is unaffected by the boundary.
    await page.getByRole("button", { name: /\+ plan follow-up/i }).click();
    await page.getByLabel("Follow up on").fill("2099-01-01");
    await page.getByLabel("Why").fill("Limit check-in");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Limit check-in")).toBeVisible();
    expect(await ownedCount()).toBe(100);
  });
});
