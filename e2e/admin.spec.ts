import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-admin-stub-001";
const PLAIN_EMAIL = `e2e-admin-plain-${Date.now()}@example.invalid`;
const ADMIN_EMAIL = `e2e-admin-root-${Date.now()}@example.invalid`;

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

async function userIdFor(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  expect(error).toBeNull();
  const found = data.users.find((u) => u.email === email);
  if (!found) throw new Error(`stub user missing: ${email}`);
  return found.id;
}

async function cleanupUser(email: string): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers();
  const found = data.users.find((u) => u.email === email);
  if (!found) return;
  await admin.from("admin_users").delete().eq("user_id", found.id);
  await admin.auth.admin.deleteUser(found.id);
}

/**
 * Super Admin P0 access control.
 *
 * - Signed-out behavior runs in every mode (the admin layout redirects to
 *   login when no session exists, even when the proxy fail-open passes the
 *   request through).
 * - Authenticated allow/deny runs ONLY with SUPABASE_E2E=stub plus
 *   SUPABASE_TEST_* credentials: a plain user must get 404 (never admin
 *   data), an admin_users member must see the real dashboard.
 */
test.describe("Admin foundation", () => {
  test("signed-out /admin redirects to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("plain authenticated user gets 404 on /admin", async ({ page }) => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
    expect(await stubLogin(page, PLAIN_EMAIL)).toBe(true);
    try {
      await page.goto("/admin");
      await expect(page.getByText(/page could not be found|not found/i).first()).toBeVisible();
      expect(await page.content()).not.toContain("Admin overview");
    } finally {
      await cleanupUser(PLAIN_EMAIL);
    }
  });

  test("admin sees metrics, recent submissions, and noindex", async ({ page }) => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
    expect(await stubLogin(page, ADMIN_EMAIL)).toBe(true);
    const admin = adminClient();
    const adminId = await userIdFor(ADMIN_EMAIL);
    const { error } = await admin.from("admin_users").insert({ user_id: adminId, role: "admin" });
    expect(error).toBeNull();
    try {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: /admin overview/i })).toBeVisible();
      await expect(page.getByText("Total users")).toBeVisible();
      await expect(page.getByText("Research submissions")).toBeVisible();
      await expect(page.getByText("Recent submissions")).toBeVisible();
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots ?? "").toContain("noindex");
      expect(await page.content()).not.toContain("service_role");
    } finally {
      await cleanupUser(ADMIN_EMAIL);
    }
  });

  test("admin overview stays usable on a small viewport", async ({ page }) => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await stubLogin(page, ADMIN_EMAIL)).toBe(true);
    const admin = adminClient();
    const adminId = await userIdFor(ADMIN_EMAIL);
    await admin.from("admin_users").insert({ user_id: adminId, role: "admin" });
    try {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: /admin overview/i })).toBeVisible();
      await expect(page.getByText("Total users")).toBeVisible();
      await expect(page.getByRole("navigation", { name: /admin sections/i })).toBeVisible();
    } finally {
      await cleanupUser(ADMIN_EMAIL);
    }
  });
});
