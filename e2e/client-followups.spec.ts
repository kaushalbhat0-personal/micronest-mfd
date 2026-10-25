import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-followups-stub-001";
const email = `e2e-followups-${Date.now()}@example.invalid`;
const REASON = `SIP review ${Date.now().toString(36)}`;

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
    .insert({ user_id: userId, name: "Followup C2 Owner" })
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

/**
 * Client Detail follow-ups daily loop (RCCF-MFD-24, C2).
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials.
 * Exercises the full Add → Done → reload → Completed → Reopen loop
 * through the real UI and RLS; one query (listFollowupsForClient) backs
 * every refresh, never optimistic state.
 */
test.describe("Client Detail follow-ups", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearAll();
  });

  test.afterEach(async () => {
    await clearAll();
  });

  test("add → done → reload → completed history → reopen", async ({ page }) => {
    const clientId = await seedClient();
    const due = futureYMD(30);
    await page.goto(`/workspace/clients/${clientId}`);
    await expect(page.getByRole("heading", { name: /followup c2 owner/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^follow-ups$/i })).toBeVisible();
    await expect(page.getByText("No follow-ups yet.")).toBeVisible();

    await page.getByRole("button", { name: /\+ add follow-up/i }).click();
    await page.getByLabel("Due date").fill(due);
    await page.getByLabel("Reason").fill(REASON);
    await page.getByLabel(/note/i).fill("Prefers evening calls");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.getByText(REASON)).toBeVisible();
    await expect(page.getByRole("heading", { name: /follow-ups 1/i })).toBeVisible();

    // Axe with the add-form closed and an open row present.
    const openAxe = await new AxeBuilder({ page }).analyze();
    expect(
      openAxe.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);

    await page.getByRole("button", { name: new RegExp(`mark ${REASON} done`, "i") }).click();
    await expect(page.getByRole("status").filter({ hasText: /marked done/i })).toBeVisible();
    await expect(page.getByText("No follow-ups yet.")).toBeVisible();
    // The completed history row exists in the DOM (collapsed <details>), so
    // assert hidden rather than absent — the open list no longer shows it.
    await expect(page.getByText(REASON)).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { name: /^follow-ups$/i })).toBeVisible();
    await expect(page.getByText("No follow-ups yet.")).toBeVisible();
    // Completed history survives reload, collapsed by default.
    await expect(page.getByText(REASON)).toBeHidden();
    await page.getByText(new RegExp(`completed \\(1\\)`, "i")).click();
    await expect(page.getByText(REASON)).toBeVisible();

    const historyAxe = await new AxeBuilder({ page }).analyze();
    expect(
      historyAxe.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);

    await page.getByRole("button", { name: new RegExp(`reopen ${REASON}`, "i") }).click();
    await expect(page.getByText(REASON)).toBeVisible();
    await expect(page.getByRole("heading", { name: /follow-ups 1/i })).toBeVisible();

    await page.reload();
    await expect(page.getByText(REASON)).toBeVisible();
    await expect(page.getByRole("heading", { name: /follow-ups 1/i })).toBeVisible();
  });

  test("undo after Done restores the open row without reload", async ({ page }) => {
    const clientId = await seedClient();
    await page.goto(`/workspace/clients/${clientId}`);
    await page.getByRole("button", { name: /\+ add follow-up/i }).click();
    await page.getByLabel("Due date").fill(futureYMD(31));
    await page.getByLabel("Reason").fill(REASON);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(REASON)).toBeVisible();

    await page.getByRole("button", { name: new RegExp(`mark ${REASON} done`, "i") }).click();
    await expect(page.getByRole("status").filter({ hasText: /marked done/i })).toBeVisible();
    await page.getByRole("button", { name: /undo/i }).click();
    await expect(page.getByText(REASON)).toBeVisible();
    await expect(page.getByRole("heading", { name: /follow-ups 1/i })).toBeVisible();
  });

  test("past due dates are rejected without persisting", async ({ page }) => {
    const clientId = await seedClient();
    await page.goto(`/workspace/clients/${clientId}`);
    await page.getByRole("button", { name: /\+ add follow-up/i }).click();
    await page.getByLabel("Due date").fill("2020-01-01");
    await page.getByLabel("Reason").fill(REASON);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // Scope to the field error: Next.js renders its own route-announcer with
    // role="alert", so an unscoped getByRole("alert") is ambiguous.
    await expect(
      page.getByRole("alert").filter({ hasText: /cannot be in the past/i }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(REASON)).toHaveCount(0);
    await expect(page.getByText("No follow-ups yet.")).toBeVisible();
  });
});
