import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-radar-stub-001";
const email = `e2e-crud-${Date.now()}@example.invalid`;

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
  await admin
    .from("radar_clients")
    .delete()
    .eq("user_id", await userIdFor());
}

/**
 * Phase B client management E2E (RCCF-MFD-19).
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials pointing
 * at a dedicated test project. Exercises the full Add → Edit → Delete
 * lifecycle through the real UI and RLS.
 */
test.describe("Client management", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearRows();
  });

  test.afterEach(async () => {
    await clearRows();
  });

  test("empty, add, and search", async ({ page }) => {
    await page.goto("/workspace/clients");
    await expect(page.getByText(/bring your client book/i)).toBeVisible();

    await page.getByRole("button", { name: /add your first client/i }).click();
    await page.getByLabel("Client name").fill("Crud Arjun");
    await page.getByLabel(/mobile/i).fill("9876543210");
    await page.getByLabel("Investment type").selectOption("SIP");
    await page.getByLabel(/last invested/i).fill("2026-10-12");
    await page.getByLabel("New client").check();
    await page.getByLabel(/note/i).fill("Prefers evening calls");
    await page.getByRole("button", { name: "Add client", exact: true }).click();

    const entry = page.getByRole("link", { name: /crud arjun/i });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("SIP");

    await page.reload();
    await expect(page.getByRole("link", { name: /crud arjun/i })).toBeVisible();

    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByLabel("Client name").fill("Zoya Khan");
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(page.getByRole("link", { name: /zoya khan/i })).toBeVisible();

    await page.getByLabel("Search clients").fill("zoy");
    await expect(page.getByRole("link", { name: /zoya khan/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /crud arjun/i })).toHaveCount(0);
    await expect(page.url()).not.toMatch(/zoy/i);

    await page.getByLabel("Search clients").fill("no-such-client");
    await expect(page.getByText(/no clients found/i)).toBeVisible();
  });

  test("add validation rejects bad input without persisting", async ({ page }) => {
    await page.goto("/workspace/clients");
    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/client name is missing/i);

    await page.getByLabel("Client name").fill("No Save");
    await page.getByLabel(/mobile/i).fill("not-a-phone");
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await expect(page.getByRole("link", { name: /no save/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: /no save/i })).toBeVisible();
  });

  test("edit persists across reload", async ({ page }) => {
    await page.goto("/workspace/clients");
    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByLabel("Client name").fill("Edit Meera");
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await page.getByRole("link", { name: /edit meera/i }).click();

    await expect(page.getByRole("heading", { name: /edit meera/i })).toBeVisible();
    await page.getByRole("button", { name: /^edit$/i }).click();
    await page.getByLabel("Client name").fill("Edit Meera Renamed");
    await page.getByLabel(/note/i).fill("Updated note");
    await page.getByRole("button", { name: /save changes/i }).click();

    await expect(page.getByRole("heading", { name: /edit meera renamed/i })).toBeVisible();
    await expect(page.getByText(/updated note/i)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: /edit meera renamed/i })).toBeVisible();
    await expect(page.getByText(/updated note/i)).toBeVisible();
  });

  test("delete requires confirmation and persists", async ({ page }) => {
    await page.goto("/workspace/clients");
    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByLabel("Client name").fill("Delete Kabir");
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await page.getByRole("link", { name: /delete kabir/i }).click();

    await page.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    // Backing out keeps the client.
    await page.getByRole("button", { name: /keep client/i }).click();
    await expect(page.getByRole("heading", { name: /delete kabir/i })).toBeVisible();

    await page.getByRole("button", { name: /^delete$/i }).click();
    await page.getByRole("button", { name: /yes, delete/i }).click();
    await expect(page).toHaveURL(/\/workspace\/clients$/);
    await expect(page.getByRole("link", { name: /delete kabir/i })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("link", { name: /delete kabir/i })).toHaveCount(0);
  });

  test("privacy: no PII in URL or storage, no service-role exposure", async ({ page }) => {
    await page.goto("/workspace/clients");
    await page.getByRole("button", { name: /^add client$/i }).click();
    await page.getByLabel("Client name").fill("Private Mohan");
    await page.getByLabel(/mobile/i).fill("9812345678");
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    await page.getByRole("link", { name: /private mohan/i }).click();
    await expect(page.getByRole("heading", { name: /private mohan/i })).toBeVisible();

    expect(page.url()).not.toMatch(/mohan|9812345678|note=/i);
    const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
    expect(stored).not.toMatch(/mohan|9812345678/i);
    const html = await page.content();
    expect(html).not.toContain("service_role");
    expect(html).not.toContain("service-role");
  });

  test("axe passes on the clients list", async ({ page }) => {
    await page.goto("/workspace/clients");
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
