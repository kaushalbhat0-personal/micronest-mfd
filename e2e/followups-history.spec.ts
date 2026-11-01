import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-followups-global-001";
const email = `e2e-followups-global-${Date.now()}@example.invalid`;
const REASON = `Global review ${Date.now().toString(36)}`;

function futureYMD(daysAhead = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

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

async function seedClient(): Promise<string> {
  const admin = adminClient();
  const userId = await userIdFor();
  await admin.from("radar_clients").delete().eq("user_id", userId);
  const { data, error } = await admin
    .from("radar_clients")
    .insert({ user_id: userId, name: "Global History Owner" })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function clearAll() {
  const admin = adminClient();
  await admin
    .from("radar_clients")
    .delete()
    .eq("user_id", await userIdFor());
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

/**
 * Global Follow-ups relationship memory.
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials.
 * Active (global Done) → Completed (history) → Client Detail Done (same
 * record) → Open again (back to Active), one row throughout, no stale
 * Today state.
 */
test.describe("Global follow-ups history", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearAll();
  });

  test.afterEach(async () => {
    await clearAll();
  });

  test("today always links to follow-ups, even with nothing coming up", async ({ page }) => {
    // Regression: the entry point must not vanish when there are no
    // upcoming follow-ups (clearAll leaves the account empty).
    await page.goto("/workspace/today");
    await expect(page.getByRole("heading", { name: /^today$/i })).toBeVisible();
    const entry = page.getByRole("link", { name: /view all follow-ups/i });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page).toHaveURL(/\/workspace\/followups$/);
    await expect(page.getByRole("heading", { name: /^follow-ups$/i })).toBeVisible();
    await expectAxeClean(page);
  });

  test("global done → completed history → detail parity → reopen", async ({ page }) => {
    const clientId = await seedClient();
    const due = futureYMD(30);

    // 1-2. Create on Client A, verify it reaches the global Active view.
    await page.goto(`/workspace/clients/${clientId}`);
    await page.getByRole("button", { name: /\+ plan follow-up/i }).click();
    await page.getByLabel("Follow up on").fill(due);
    await page.getByLabel("Why").fill(REASON);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(REASON)).toBeVisible();

    await page.goto("/workspace/followups");
    await expect(page.getByRole("heading", { name: /^follow-ups$/i })).toBeVisible();
    await expect(page.getByText("Global History Owner").first()).toBeVisible();
    await expect(page.getByText(REASON)).toBeVisible();
    await expectAxeClean(page);

    // 3-5. Mark Done from the global Active view; it leaves Active and is
    // one click away under Completed.
    await page.getByRole("button", { name: new RegExp(`mark ${REASON} done`, "i") }).click();
    await expect(page.getByRole("status").filter({ hasText: /follow-up marked done/i })).toBeVisible();
    await expect(page.getByText(REASON)).toBeHidden();
    await page.getByRole("link", { name: /view in completed/i }).click();

    // 6-8. Completed shows the same follow-up with client + dates.
    await expect(page.getByText(REASON)).toBeVisible();
    await expect(page.getByText("Global History Owner").first()).toBeVisible();
    await expect(page.getByText(/completed/i).first()).toBeVisible();
    await expectAxeClean(page);

    // 9-12. Client Detail Done shows the same single record (same id).
    await page.goto(`/workspace/clients/${clientId}`);
    await page.getByText(new RegExp(`done \\(1\\)`, "i")).click();
    await expect(page.getByText(REASON)).toBeVisible();

    const admin = adminClient();
    const { data: rows, error: rowsError } = await admin
      .from("client_followups")
      .select("id,completed_at")
      .eq("user_id", await userIdFor());
    expect(rowsError).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0].completed_at).not.toBeNull();
    const followupId = rows![0].id as string;

    // 13-15. Open again from Completed returns it to Active (same row).
    await page.goto("/workspace/followups?tab=completed");
    await page.getByRole("button", { name: new RegExp(`open ${REASON} again`, "i") }).click();
    await expect(page.getByRole("status").filter({ hasText: /follow-up reopened/i })).toBeVisible();
    await expect(page.getByText(REASON)).toBeHidden();
    await page.getByRole("link", { name: /view in active/i }).click();
    await expect(page.getByText(REASON)).toBeVisible();

    const { data: reopened, error: reopenError } = await admin
      .from("client_followups")
      .select("id,completed_at")
      .eq("id", followupId);
    expect(reopenError).toBeNull();
    expect(reopened).toHaveLength(1);
    expect(reopened![0].completed_at).toBeNull();

    // 16. Today reflects the live open set after refresh — no stale state.
    await page.goto("/workspace/today");
    await page.reload();
    const card = page.getByRole("article", { name: /global history owner/i });
    await expect(card).toBeVisible();
  });
});
