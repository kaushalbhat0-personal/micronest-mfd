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

const SUGG_EMAIL = `e2e-sugg-${Date.now()}@example.invalid`;
const SUGG_PREFIX = `e2ep1a-${Date.now()}`;

async function seedSuggestion(
  admin: ReturnType<typeof adminClient>,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.from("wtp_interest").insert(row).select("id").single();
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

async function cleanupSuggestions(admin: ReturnType<typeof adminClient>): Promise<void> {
  const { data } = await admin
    .from("wtp_interest")
    .select("id")
    .ilike("message", `%${SUGG_PREFIX}%`);
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length > 0) await admin.from("wtp_interest").delete().in("id", ids);
}

/**
 * Super Admin P1A suggestions workspace.
 *
 * - Signed-out tests run in every mode (layout redirects to login).
 * - Authenticated tests run ONLY with SUPABASE_E2E=stub plus
 *   SUPABASE_TEST_* credentials against the isolated test project.
 */
test.describe("Admin suggestions", () => {
  test("signed-out /admin/suggestions redirects to login", async ({ page }) => {
    await page.goto("/admin/suggestions");
    // Configured proxy preserves the full path (next=%2Fadmin%2Fsuggestions);
    // the layout backstop in unconfigured mode lands on /admin. Both keep
    // the admin surface closed.
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("plain authenticated user gets 404 on suggestions routes", async ({ page }) => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
    expect(await stubLogin(page, PLAIN_EMAIL)).toBe(true);
    try {
      await page.goto("/admin/suggestions");
      await expect(page.getByText(/page could not be found|not found/i).first()).toBeVisible();
      expect(await page.content()).not.toContain("Research submissions");
      await page.goto("/admin/suggestions/00efbebd-d993-44d4-9d14-cf621f897342");
      await expect(page.getByText(/page could not be found|not found/i).first()).toBeVisible();
    } finally {
      await cleanupUser(PLAIN_EMAIL);
    }
  });

  test("admin browses, searches, filters, and opens a submission", async ({ page }) => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
    expect(await stubLogin(page, SUGG_EMAIL)).toBe(true);
    const admin = adminClient();
    const adminId = await userIdFor(SUGG_EMAIL);
    expect(
      await admin.from("admin_users").insert({ user_id: adminId, role: "admin" }),
    ).toMatchObject({
      error: null,
    });
    const identifiedId = await seedSuggestion(admin, {
      user_id: adminId,
      email: SUGG_EMAIL,
      country: "IN",
      profession: "coach",
      profession_other: null,
      client_count_band: "11-25",
      current_solution: ["excel"],
      current_solution_other: null,
      desired_features: ["followup-reminders"],
      other_feature: null,
      quoted_price_minor: 50000,
      quoted_currency: "INR",
      price_band: "5-10",
      message: `${SUGG_PREFIX} identified coach seeks followups`,
    });
    const anonymousId = await seedSuggestion(admin, {
      user_id: null,
      email: null,
      country: "US",
      profession: "freelancer",
      profession_other: null,
      client_count_band: "1-10",
      current_solution: ["notes"],
      current_solution_other: null,
      desired_features: ["reports-analytics"],
      other_feature: `${SUGG_PREFIX} custom export view`,
      quoted_price_minor: null,
      quoted_currency: null,
      price_band: "free",
      message: `${SUGG_PREFIX} anonymous asks for reports`,
    });
    try {
      await page.goto("/admin/suggestions");
      await expect(page.getByRole("heading", { name: /research submissions/i })).toBeVisible();

      // Search narrows to the seeded identified row.
      await page.getByLabel("Search submissions").fill("identified coach seeks");
      await page.getByRole("button", { name: /^search$/i }).click();
      await expect(page.getByText(/showing 1 of 1/i)).toBeVisible();
      await expect(page.getByText("coach")).toBeVisible();

      // Profession filter link resets the search and narrows by enum.
      await page
        .getByRole("group", { name: "Profession" })
        .getByRole("link", { name: "freelancer" })
        .click();
      await expect(page).toHaveURL(/profession=freelancer/);
      await expect(page.getByText(/anonymous asks for reports/i)).toBeVisible();

      // Detail opens the seeded submission with full fields and user context.
      await page.goto(`/admin/suggestions/${identifiedId}`);
      await expect(page.getByRole("heading", { name: /submission ·/i })).toBeVisible();
      await expect(page.getByText("Provided email")).toBeVisible();
      await expect(page.getByText(SUGG_EMAIL)).toBeVisible();
      await expect(page.getByText("500 INR")).toBeVisible();
      await expect(page.getByText("User page arrives in P1B")).toBeVisible();
      await expect(await page.content()).not.toContain("service_role");

      // Anonymous detail shows no user block.
      await page.goto(`/admin/suggestions/${anonymousId}`);
      await expect(page.getByRole("heading", { name: /submission ·/i })).toBeVisible();
      await expect(page.getByText(/no signed-in account is attached/i)).toBeVisible();

      // Back navigation returns to the list.
      await page.getByRole("link", { name: /all suggestions/i }).click();
      await expect(page.getByRole("heading", { name: /research submissions/i })).toBeVisible();
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots ?? "").toContain("noindex");
    } finally {
      await cleanupSuggestions(admin);
      await cleanupUser(SUGG_EMAIL);
    }
  });

  test("admin suggestions stay usable on a small viewport", async ({ page }) => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await stubLogin(page, SUGG_EMAIL)).toBe(true);
    const admin = adminClient();
    const adminId = await userIdFor(SUGG_EMAIL);
    await admin.from("admin_users").insert({ user_id: adminId, role: "admin" });
    const seededId = await seedSuggestion(admin, {
      user_id: null,
      email: null,
      country: "IN",
      profession: "coach",
      profession_other: null,
      client_count_band: "1-10",
      current_solution: ["notes"],
      current_solution_other: null,
      desired_features: ["followup-reminders"],
      other_feature: null,
      quoted_price_minor: null,
      quoted_currency: null,
      price_band: "free",
      message: `${SUGG_PREFIX} mobile readability check`,
    });
    try {
      await page.goto("/admin/suggestions");
      await expect(page.getByRole("heading", { name: /research submissions/i })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      expect(overflow).toBe(true);
      await page.getByLabel("Search submissions").fill("mobile readability check");
      await page.getByRole("button", { name: /^search$/i }).click();
      await expect(page.getByText(/showing 1 of 1/i)).toBeVisible();
      await page.goto(`/admin/suggestions/${seededId}`);
      await expect(page.getByRole("heading", { name: /submission ·/i })).toBeVisible();
      const detailOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      expect(detailOverflow).toBe(true);
    } finally {
      await cleanupSuggestions(admin);
      await cleanupUser(SUGG_EMAIL);
    }
  });
});
