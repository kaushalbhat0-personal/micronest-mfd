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

interface SeedRow {
  id: string;
  name: string;
}

async function seedRows(userId: string): Promise<SeedRow[]> {
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
      mobile: "9123456780",
      investment_type: "Both",
      last_invested: ymd(5),
      last_contacted: null,
      is_new_client: true,
      note: "Seeded for persistence tests",
    },
  ];
  const { data, error } = await admin.from("radar_clients").insert(rows).select("id,name");
  expect(error).toBeNull();
  return (data ?? []) as SeedRow[];
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

function idFor(rows: SeedRow[], name: string): string {
  const found = rows.find((r) => r.name === name);
  if (!found) throw new Error(`seed row missing: ${name}`);
  return found.id;
}

/**
 * Authenticated persistence coverage (RCCF-MFD-16, retargeted in MFD-19).
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials pointing
 * at a dedicated test project — never a production account, never real
 * Google OAuth. The stub route establishes a real Supabase session; every
 * assertion then runs through the same UI and RLS as production.
 *
 * Phase B moved the relationship actions from the retired standalone route
 * to the Client Detail view; these specs assert the same intents there.
 */
test.describe("Client Detail persistence", () => {
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

  test("detail shows factual reasons and working call handoffs", async ({ page }) => {
    const rows = await seedRows(await userIdFor(email));
    await page.goto(`/workspace/clients/${idFor(rows, "Persist Dev")}`);

    await expect(page.getByRole("heading", { name: /persist dev/i })).toBeVisible();
    await expect(page.getByText(/follow-up due · \d+ days since contact/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /^call$/i })).toHaveAttribute("href", /^tel:/);
    await expect(page.getByRole("link", { name: /^whatsapp$/i })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\//,
    );
  });

  test("mark contacted persists across reload", async ({ page }) => {
    const rows = await seedRows(await userIdFor(email));
    await page.goto(`/workspace/clients/${idFor(rows, "Persist Dev")}`);

    await page.getByRole("button", { name: /mark contacted/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /marked persist dev as contacted/i }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText(/follow-up due · \d+ days since contact/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /undo/i })).toHaveCount(0);
  });

  test("undo restores the previous contacted date", async ({ page }) => {
    const rows = await seedRows(await userIdFor(email));
    await page.goto(`/workspace/clients/${idFor(rows, "Persist Dev")}`);

    await page.getByRole("button", { name: /mark contacted/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /marked persist dev as contacted/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /undo/i }).click();

    // Banner dismissal proves the revert persisted; only then reload.
    await expect(page.getByRole("button", { name: /undo/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(/follow-up due · \d+ days since contact/i)).toBeVisible();
  });

  test("undo of a never-contacted client restores null", async ({ page }) => {
    const rows = await seedRows(await userIdFor(email));
    await page.goto(`/workspace/clients/${idFor(rows, "Persist Riya")}`);
    await expect(page.getByText("Both · Never contacted")).toBeVisible();

    await page.getByRole("button", { name: /mark contacted/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /marked persist riya as contacted/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /undo/i }).click();
    await page.reload();
    await expect(page.getByText(/recent investor/i)).toBeVisible();
  });

  test("invalid and unknown ids render cleanly without raw errors", async ({ page }) => {
    await page.goto("/workspace/clients/not-a-client-id");
    await expect(page.getByRole("heading", { name: /couldn't find that client/i })).toBeVisible();

    await page.goto("/workspace/clients/123e4567-e89b-42d3-a456-426614174000");
    await expect(page.getByRole("heading", { name: /couldn't find that client/i })).toBeVisible();
  });

  test("no client data in localStorage or URL on detail pages", async ({ page }) => {
    const rows = await seedRows(await userIdFor(email));
    await page.goto(`/workspace/clients/${idFor(rows, "Persist Dev")}`);
    await expect(page.getByRole("heading", { name: /persist dev/i })).toBeVisible();

    expect(page.url()).not.toContain("Persist");
    expect(page.url()).not.toMatch(/name=|phone=|mobile=|note=/);
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

  test("axe passes on the client detail view", async ({ page }) => {
    const rows = await seedRows(await userIdFor(email));
    await page.goto(`/workspace/clients/${idFor(rows, "Persist Dev")}`);
    await expect(page.getByRole("heading", { name: /persist dev/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
