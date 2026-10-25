import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { sampleCsvText, uploadCsv, writeCsv } from "./helpers/csv-fixtures";

test.describe("Follow-up Workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tools/followups");
  });

  test("home links to the workspace and the template downloads byte-exact", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /open workspace/i }).click();
    await expect(page).toHaveURL(/\/tools\/followups/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /download follow-up template/i }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    expect(readFileSync(filePath as string, "utf8")).toBe(
      "Client Name,Mobile,Next Follow-up,Reason,Note\n",
    );
  });

  test("import → attention queue → message → WhatsApp → done → undo → reload clears", async ({
    page,
    context,
  }, testInfo) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const filePath = writeCsv(testInfo, "sample.csv", sampleCsvText());

    await page.getByRole("link", { name: /download follow-up template/i }).isVisible();
    await uploadCsv(page, filePath);

    // Import receipt.
    await expect(page.getByRole("region", { name: /import result/i })).toContainText("Imported 4");
    await expect(page.getByRole("region", { name: /import result/i })).toContainText("Warnings: 1");

    // Attention default: overdue + today only.
    await expect(page.getByRole("article", { name: /overdue raj/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /today amit/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /bad phone vikram/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /upcoming sunita/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /overdue.*1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /today.*2/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upcoming.*1/i })).toBeVisible();

    // Row without phone: Message only, no WhatsApp action, small indicator.
    const amitCard = page.getByRole("article", { name: /today amit/i });
    await expect(amitCard.getByRole("link", { name: /whatsapp/i })).toHaveCount(0);
    await expect(amitCard.getByRole("button", { name: /^message$/i })).toBeVisible();
    await expect(amitCard).toContainText("Mobile unavailable");

    // Row with invalid phone: no WhatsApp action, checking indicator.
    const vikramCard = page.getByRole("article", { name: /bad phone vikram/i });
    await expect(vikramCard.getByRole("link", { name: /whatsapp/i })).toHaveCount(0);
    await expect(vikramCard).toContainText("Mobile number needs checking");

    // Filter to upcoming.
    await page.getByRole("button", { name: /upcoming.*1/i }).click();
    await expect(page.getByRole("article", { name: /upcoming sunita/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /overdue raj/i })).toHaveCount(0);
    await page.getByRole("button", { name: /attention/i }).click();

    // Message opens prefilled Message Studio.
    await page
      .getByRole("article", { name: /overdue raj/i })
      .getByRole("button", { name: /^message$/i })
      .click();
    await expect(page.getByLabel("Client name")).toHaveValue("Overdue Raj");
    await expect(page.getByRole("radio", { name: /sip confirmation/i })).toBeChecked();
    await page.getByRole("button", { name: /back to follow-ups/i }).click();
    await expect(page.getByRole("article", { name: /overdue raj/i })).toBeVisible();

    // Direct WhatsApp handoff carries the deterministic text.
    const wa = page
      .getByRole("article", { name: /overdue raj/i })
      .getByRole("link", { name: /whatsapp/i });
    const href = await wa.getAttribute("href");
    expect(href).toContain("https://wa.me/919876543210?text=");
    expect(href).toContain(encodeURIComponent("Hi Overdue Raj, following up regarding SIP."));

    // Done collapses with Undo; reload clears everything.
    await page
      .getByRole("article", { name: /overdue raj/i })
      .getByRole("button", { name: /^done$/i })
      .click();
    await expect(page.getByRole("article", { name: /overdue raj/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /undo/i })).toBeVisible();
    await page.getByRole("button", { name: /undo/i }).click();
    await expect(page.getByRole("article", { name: /overdue raj/i })).toBeVisible();

    await page
      .getByRole("article", { name: /overdue raj/i })
      .getByRole("button", { name: /^done$/i })
      .click();
    await page.reload();
    await expect(page.getByRole("heading", { name: /follow-up workspace/i })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /download follow-up template/i })).toBeVisible();
  });

  test("invalid rows are reported and valid rows still import", async ({ page }) => {
    await uploadCsv(page, "e2e/fixtures/invalid-sample.csv");

    await expect(page.getByRole("region", { name: /import result/i })).toContainText("Imported 1");

    // The single valid row may sit in any bucket depending on the run date.
    for (const chip of [/upcoming/i, /today/i, /overdue/i]) {
      await page.getByRole("button", { name: chip }).first().click();
      if ((await page.getByRole("article", { name: /good client/i }).count()) > 0) break;
    }
    await expect(page.getByRole("article", { name: /good client/i })).toBeVisible();
    const skipped = page.getByText(/skipped rows \(3\)/i);
    await expect(skipped).toBeVisible();
    await page.locator("details summary").click();
    await expect(page.getByText(/row 3/i)).toBeVisible();
  });

  test("no network traffic and no client data in storage or URL", async ({ page }, testInfo) => {
    await page.route(/.*/, (route) => {
      const url = route.request().url();
      if (url.startsWith("http://localhost:") || url.startsWith("ws://localhost")) {
        return route.continue();
      }
      return route.abort();
    });
    await page.goto("/tools/followups");

    const filePath = writeCsv(testInfo, "sample.csv", sampleCsvText());
    await uploadCsv(page, filePath);
    await expect(page.getByRole("article", { name: /overdue raj/i })).toBeVisible();

    expect(page.url()).not.toContain("Raj");
    const stored = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) out[key] = window.localStorage.getItem(key) ?? "";
      }
      return JSON.stringify(out);
    });
    expect(stored).not.toContain("Overdue Raj");
    expect(stored).not.toContain("9876543210");
  });

  test("no horizontal scrolling on mobile dashboard", async ({ page }, testInfo) => {
    const filePath = writeCsv(testInfo, "sample.csv", sampleCsvText());
    await uploadCsv(page, filePath);
    await expect(page.getByRole("article", { name: /overdue raj/i })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
