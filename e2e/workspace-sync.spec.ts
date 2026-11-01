import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-sync-stub-001";
const email = `e2e-sync-${Date.now()}@example.invalid`;

function ymd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
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

async function clearRows() {
  const admin = adminClient();
  await admin.from("radar_clients").delete().eq("user_id", await userIdFor());
}

async function seedQuietClient(): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from("radar_clients").insert([
    {
      user_id: await userIdFor(),
      name: "Sync Nav Owner",
      mobile: "9811111111",
      investment_type: "SIP",
      // Quiet beyond the default 90-day reconnect interval: needs attention.
      last_invested: null,
      last_contacted: ymd(-100),
      is_new_client: false,
      note: "",
    },
  ]);
  expect(error).toBeNull();
}

/**
 * Cross-route state synchronization (RCCF-MFD cross-route sync audit).
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials pointing
 * at a dedicated test project — never production, never real OAuth.
 *
 * Regression for: "I spoke to them" persisted and updated Today, but
 * Clients still showed the pre-mutation attention count, and navigating
 * back to Today resurrected it, until a hard refresh. Navigation uses
 * the in-app links (not page.goto) so the App Router cache path that
 * caused the staleness is actually exercised.
 */
test.describe("Today <-> Clients attention sync", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearRows();
  });

  test.afterEach(async () => {
    await clearRows();
  });

  test("contacting a client syncs the attention count across Today, Clients, and back", async ({
    page,
  }) => {
    await seedQuietClient();
    await page.goto("/workspace/today");

    const todayStrip = page.getByLabel("Attention summary");
    await expect(todayStrip.getByRole("button", { name: /needs attention/i })).toContainText(
      "1",
    );

    // Mark contacted on Today: the optimistic update already worked before
    // the fix — this step records the post-mutation baseline.
    await page
      .getByRole("article", { name: /sync nav owner/i })
      .getByRole("button", { name: /i spoke to them/i })
      .click();
    await expect(page.getByRole("status")).toContainText(/you spoke to sync nav owner/i);
    await expect(todayStrip.getByRole("button", { name: /needs attention/i })).toContainText(
      "0",
    );

    // Navigate to Clients through the application navigation (exercises
    // the router cache): the pre-mutation count must not reappear.
    await page.getByRole("link", { name: /^clients$/i }).first().click();
    await expect(page).toHaveURL(/\/workspace\/clients$/);
    const clientsStrip = page.getByLabel("Attention summary");
    await expect(
      clientsStrip.getByRole("button", { name: /needs attention/i }),
    ).toContainText("0");

    // Navigate back to Today through the application navigation: the
    // stale pre-mutation snapshot must not be resurrected.
    await page.getByRole("link", { name: /^today$/i }).first().click();
    await expect(page).toHaveURL(/\/workspace\/today$/);
    await expect(
      page.getByLabel("Attention summary").getByRole("button", { name: /needs attention/i }),
    ).toContainText("0");

    // A hard refresh must agree with everything above.
    await page.reload();
    await expect(
      page.getByLabel("Attention summary").getByRole("button", { name: /needs attention/i }),
    ).toContainText("0");
  });
});
