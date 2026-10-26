import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-today-stub-001";
const email = `e2e-today-${Date.now()}@example.invalid`;

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
  const userId = await userIdFor();
  await admin.from("client_followups").delete().eq("user_id", userId);
  await admin.from("radar_clients").delete().eq("user_id", userId);
}

/**
 * Today vertical slice (RCCF-MFD-29 Phase B).
 * Runs ONLY with SUPABASE_E2E=stub plus SUPABASE_TEST_* credentials pointing
 * at a dedicated test project. Exercises the real queue: greeting, attention
 * strip, filters, priority cards, mark-contacted + undo, upcoming, completed.
 */
test.describe("Today workspace", () => {
  test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

  test.beforeEach(async ({ page }) => {
    const ok = await stubLogin(page);
    test.skip(!ok, "Stub auth endpoint unavailable.");
    await clearRows();
  });

  test.afterEach(async () => {
    await clearRows();
  });

  async function seedQueue(): Promise<void> {
    const admin = adminClient();
    const userId = await userIdFor();
    const { data: clients, error } = await admin
      .from("radar_clients")
      .insert([
        {
          user_id: userId,
          name: "Today Overdue Owner",
          mobile: "9811111111",
          investment_type: "SIP",
          last_contacted: ymd(-90),
        },
        {
          user_id: userId,
          name: "Today Newcomer",
          mobile: "9822222222",
          investment_type: "Other",
          is_new_client: true,
        },
      ])
      .select("id,name");
    expect(error).toBeNull();
    const overdueId = clients!.find((c) => c.name === "Today Overdue Owner")!.id as string;
    const { error: fuError } = await admin.from("client_followups").insert([
      { user_id: userId, client_id: overdueId, due_date: ymd(-3), reason: "Overdue review call" },
      { user_id: userId, client_id: overdueId, due_date: ymd(5), reason: "Future SIP check" },
    ]);
    expect(fuError).toBeNull();
  }

  test("empty radar shows the warm empty state, never fake clients", async ({ page }) => {
    await page.goto("/workspace/today");
    await expect(
      page.getByRole("heading", { name: /good (morning|afternoon|evening)/i }),
    ).toBeVisible();
    await expect(page.getByText(/relationship radar is clear/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /go to clients/i })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
  });

  test("queue: strip, cards, filters, upcoming, and contact loop", async ({ page }) => {
    await seedQueue();
    await page.goto("/workspace/today");

    // Attention strip renders with counts.
    const strip = page.getByLabel("Attention summary");
    await expect(strip.getByRole("button", { name: /overdue/i })).toContainText("1");
    await expect(strip.getByRole("button", { name: /reconnect/i })).toContainText("1");

    // Priority card leads with why + one primary action.
    const card = page.getByRole("article", { name: /today overdue owner/i });
    await expect(card).toBeVisible();
    await expect(card.getByText(/follow-up overdue/i)).toBeVisible();
    await expect(card.getByRole("link", { name: /^call$/i })).toBeVisible();
    // No four-button grid: WhatsApp hides behind the overflow menu.
    await expect(card.getByRole("link", { name: /^whatsapp$/i })).toHaveCount(0);
    await card.getByRole("button", { name: /more actions/i }).click();
    await expect(card.getByRole("menuitem", { name: /whatsapp/i })).toBeVisible();

    // Filters narrow the queue.
    const filters = page.getByRole("group", { name: /filter today/i });
    await filters.getByRole("button", { name: /new/i }).click();
    await expect(page.getByRole("article", { name: /today newcomer/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /today overdue owner/i })).toHaveCount(0);
    await filters.getByRole("button", { name: /needs attention/i }).click();
    await expect(page.getByRole("article")).toHaveCount(2);

    // Mark contacted → toast → undo restores the queue.
    await page
      .getByRole("article", { name: /today overdue owner/i })
      .getByRole("button", { name: /mark contacted/i })
      .click();
    const status = page.getByRole("status");
    await expect(status).toContainText(/marked today overdue owner as contacted/i);
    await status.getByRole("button", { name: /undo/i }).click();
    await expect(page.getByRole("article", { name: /today overdue owner/i })).toBeVisible();

    // Mark contacted again to verify the completed-today disclosure.
    await page
      .getByRole("article", { name: /today overdue owner/i })
      .getByRole("button", { name: /mark contacted/i })
      .click();
    await expect(page.getByText(/completed today/i)).toBeVisible();

    // Upcoming lists the future follow-up with its reason.
    await expect(page.getByText(/future sip check/i)).toBeVisible();
  });

  test("?filter=followups preselects the Follow-ups chip", async ({ page }) => {
    await seedQueue();
    await page.goto("/workspace/today?filter=followups");
    await expect(
      page
        .getByRole("group", { name: /filter today/i })
        .getByRole("button", { name: /follow-ups/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article", { name: /today overdue owner/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /today newcomer/i })).toHaveCount(0);
  });

  test("no PII in URL or storage; no horizontal overflow", async ({ page }) => {
    await seedQueue();
    await page.goto("/workspace/today");
    expect(page.url()).not.toMatch(/name=|phone=|mobile=|note=|code=|token=/i);
    const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
    expect(stored).not.toMatch(/today overdue owner|9811111111/i);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("axe passes on the populated today view", async ({ page }) => {
    await seedQueue();
    await page.goto("/workspace/today");
    await expect(page.getByRole("article").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("reduced motion keeps every interaction working", async ({ page }) => {
    await seedQueue();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/workspace/today");
    const card = page.getByRole("article", { name: /today overdue owner/i });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /mark contacted/i }).click();
    await expect(page.getByRole("status")).toContainText(/marked today overdue owner/i);
  });
});
