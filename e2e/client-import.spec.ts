import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const stubMode = process.env.SUPABASE_E2E === "stub";
const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_ANON = process.env.SUPABASE_TEST_ANON_KEY;
const TEST_SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const stubConfigured = stubMode && Boolean(TEST_URL && TEST_ANON && TEST_SERVICE);

const PASSWORD = "e2e-import-stub-001";
const email = `e2e-import-${Date.now()}@example.invalid`;

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

async function openImport(page: Page, name: RegExp = /^import$/i) {
  await page.goto("/workspace/clients");
  const trigger = page.getByRole("button", { name }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /import your client book/i })).toBeVisible();
}

async function upload(page: Page, fileName: string) {
  await page.locator("#import-file").setInputFiles(`e2e/fixtures/${fileName}`);
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

/**
 * Bulk client import (RCCF-MFD-44). Without a session the entry point
 * stays hidden; every dialog flow below runs with a real stub session and
 * is skipped without SUPABASE_TEST_* credentials (real OAuth stays manual).
 */
test.describe("Client import", () => {
  test.describe("preview without a session", () => {
    test.skip(
      Boolean(process.env.SUPABASE_E2E),
      "Preview flows assert the default unconfigured mode.",
    );

    test("entry, template, mapping, preview, and validation", async ({ page }) => {
      await openImport(page, /try import preview/i);

      // Template downloads the canonical blank contract.
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: /download csv template/i }).click();
      const template = await download;
      expect(template.suggestedFilename()).toBe("micronest-mfd-client-template.csv");

      await upload(page, "import-valid.csv");
      // Single sheet jumps straight to column mapping.
      await expect(page.getByRole("button", { name: /review 3 rows/i })).toBeVisible();
      const selects = page
        .getByRole("dialog", { name: /import your client book/i })
        .locator("select");
      await expect(selects.first()).toHaveValue("Client Name");
      // Exact template headers: all seven map automatically, no manual step.
      const mappedCount = await selects.evaluateAll(
        (elements) => elements.filter((el) => (el as HTMLSelectElement).value !== "").length,
      );
      expect(mappedCount).toBe(7);

      await page.getByRole("button", { name: /review 3 rows/i }).click();
      await expect(page.getByText("3 rows found")).toBeVisible();
      await expect(page.getByRole("button", { name: /import 3 clients/i })).toBeDisabled();
      await expect(page.getByText(/sign in to save imported clients/i)).toBeVisible();
      await expect(page.getByText("Rajesh Sharma")).toBeVisible();
      await expectAxeClean(page);

      await page.getByRole("button", { name: /^back$/i }).click();
      await expect(page.getByRole("button", { name: /review 3 rows/i })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: /import your client book/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /try import preview/i })).toBeFocused();
    });

    test("aliases, mixed rows, invalid files, and sheet selection", async ({ page }) => {
      await openImport(page, /try import preview/i);

      await upload(page, "import-alias.csv");
      await expect(page.getByRole("button", { name: /review 2 rows/i })).toBeVisible();
      await page.getByRole("button", { name: /review 2 rows/i }).click();
      await expect(page.getByText("2 rows found")).toBeVisible();
      await expect(page.getByText("Kavita Rao")).toBeVisible();
      await page.getByRole("button", { name: /^back$/i }).click();
      await page.getByRole("button", { name: /^back$/i }).click();
      await expect(page.getByText("Download the template").first()).toBeVisible();

      await upload(page, "import-mixed.csv");
      await expect(page.getByRole("button", { name: /review 5 rows/i })).toBeVisible();
      await page.getByRole("button", { name: /review 5 rows/i }).click();
      await expect(page.getByText("5 rows found")).toBeVisible();
      await expect(page.getByText("Client name is missing.")).toBeVisible();
      await expect(page.getByText(/duplicate of row 2/i).first()).toBeVisible();

      const errorDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: /download rows needing attention/i })
        .first()
        .click();
      const errors = await errorDownload;
      expect(errors.suggestedFilename()).toBe("import-needs-attention.csv");
      await expectAxeClean(page);
      await page.keyboard.press("Escape");

      await openImport(page, /try import preview/i);
      await upload(page, "import-invalid.txt");
      await expect(page.getByText(/please upload a .csv or .xlsx file/i)).toBeVisible();
      await page.keyboard.press("Escape");

      await openImport(page, /try import preview/i);
      await upload(page, "import-multi.xlsx");
      await expect(page.getByRole("radiogroup", { name: /choose a sheet/i })).toBeVisible();
      await page.getByRole("radio", { name: /archive/i }).click();
      await page.getByRole("button", { name: /continue with this sheet/i }).click();
      await expect(page.getByRole("button", { name: /review 1 rows/i })).toBeVisible();
      await page.getByRole("button", { name: /review 1 rows/i }).click();
      await expect(page.getByText("1 rows found")).toBeVisible();
      await expect(page.getByRole("button", { name: /import 1 clients/i })).toBeDisabled();
    });
  });

  test.describe("authenticated", () => {
    test.skip(!stubConfigured, "Requires SUPABASE_E2E=stub with SUPABASE_TEST_* credentials.");

    test.beforeEach(async ({ page }) => {
      const ok = await stubLogin(page);
      test.skip(!ok, "Stub auth endpoint unavailable.");
      await clearRows();
    });

    test.afterEach(async () => {
      await clearRows();
    });

    test("template, mapping, preview, import, and receipt", async ({ page }) => {
      await page.goto("/workspace/clients");
      await expect(page.getByText(/bring your client book/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /import client list/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /download template/i })).toBeVisible();

      await openImport(page);

      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: /download csv template/i }).click();
      const template = await download;
      expect(template.suggestedFilename()).toBe("micronest-mfd-client-template.csv");

      await upload(page, "import-valid.csv");
      await expect(page.getByRole("button", { name: /review 3 rows/i })).toBeVisible();
      const selects = page
        .getByRole("dialog", { name: /import your client book/i })
        .locator("select");
      await expect(selects.first()).toHaveValue("Client Name");
      // Exact template headers: all seven map automatically, no manual step.
      const mappedCount = await selects.evaluateAll(
        (elements) => elements.filter((el) => (el as HTMLSelectElement).value !== "").length,
      );
      expect(mappedCount).toBe(7);

      await page.getByRole("button", { name: /review 3 rows/i }).click();
      await expect(page.getByText("3 rows found")).toBeVisible();
      await expect(page.getByRole("button", { name: /import 3 clients/i })).toBeEnabled();
      await expect(page.getByText("Rajesh Sharma")).toBeVisible();
      await expectAxeClean(page);

      await page.getByRole("button", { name: /import 3 clients/i }).click();
      await expect(page.getByText("Import complete")).toBeVisible();
      await page.getByRole("button", { name: /view clients/i }).click();
      await expect(page.getByRole("dialog", { name: /import your client book/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /rajesh sharma/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /priya mehta/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /amit shah/i })).toBeVisible();
    });

    test("aliases resolve, mixed rows explain themselves, errors export", async ({ page }) => {
      await openImport(page);
      await upload(page, "import-alias.csv");
      await expect(page.getByRole("button", { name: /review 2 rows/i })).toBeVisible();
      await page.getByRole("button", { name: /review 2 rows/i }).click();
      await expect(page.getByText("2 rows found")).toBeVisible();
      await expect(page.getByText("Kavita Rao")).toBeVisible();
      await expect(page.getByText("lump sum", { exact: false })).toHaveCount(0);
      await page.keyboard.press("Escape");

      await openImport(page);
      await upload(page, "import-mixed.csv");
      await page.getByRole("button", { name: /review 5 rows/i }).click();
      await expect(page.getByText("5 rows found")).toBeVisible();
      await expect(page.getByText("Client name is missing.")).toBeVisible();
      await expect(page.getByText(/duplicate of row 2/i).first()).toBeVisible();

      const errorDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: /download rows needing attention/i })
        .first()
        .click();
      const errors = await errorDownload;
      expect(errors.suggestedFilename()).toBe("import-needs-attention.csv");
      await expectAxeClean(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^import$/i })).toBeFocused();
    });

    test("invalid files and multi-sheet workbooks are handled", async ({ page }) => {
      await openImport(page);
      await upload(page, "import-invalid.txt");
      await expect(page.getByText(/please upload a .csv or .xlsx file/i)).toBeVisible();
      await page.keyboard.press("Escape");

      await openImport(page);
      await upload(page, "import-multi.xlsx");
      await expect(page.getByRole("radiogroup", { name: /choose a sheet/i })).toBeVisible();
      await page.getByRole("radio", { name: /archive/i }).click();
      await page.getByRole("button", { name: /continue with this sheet/i }).click();
      await expect(page.getByRole("button", { name: /review 1 rows/i })).toBeVisible();
      await page.getByRole("button", { name: /review 1 rows/i }).click();
      await expect(page.getByText("1 rows found")).toBeVisible();
      await expect(page.getByRole("button", { name: /import 1 clients/i })).toBeEnabled();
    });

    test("re-importing skips every existing client", async ({ page }) => {
      await openImport(page);
      await upload(page, "import-valid.csv");
      await page.getByRole("button", { name: /review 3 rows/i }).click();
      await page.getByRole("button", { name: /import 3 clients/i }).click();
      await expect(page.getByText("Import complete")).toBeVisible();
      await page.getByRole("button", { name: /view clients/i }).click();

      await openImport(page);
      await upload(page, "import-valid.csv");
      await page.getByRole("button", { name: /review 3 rows/i }).click();
      await expect(page.getByText(/already in your client book/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /nothing to import/i })).toBeDisabled();
    });
  });
});
