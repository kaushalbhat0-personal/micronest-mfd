import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ddmmyyyy } from "./helpers/csv-fixtures";
import { radarCsvText, uploadRadarCsv, writeRadarCsv } from "./helpers/radar-fixtures";

test.describe("Client Radar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tools/client-radar");
  });

  test("empty state shows heading, template, and upload", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /client radar/i })).toBeVisible();
    await expect(page.getByText(/worth talking to this week/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /download csv template/i })).toBeVisible();
    await expect(page.getByLabel(/upload client csv/i)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /download csv template/i }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    expect(readFileSync(filePath as string, "utf8")).toBe(
      "Client Name,Mobile,Investment Type,Last Invested,Last Contacted,New Client,Note\n",
    );
  });

  test("import receipt, counts, and attention default", async ({ page }, testInfo) => {
    const filePath = writeRadarCsv(testInfo, "radar.csv", radarCsvText());
    await uploadRadarCsv(page, filePath);

    await expect(page.getByRole("region", { name: /import result/i })).toContainText(
      "Imported 7 clients",
    );
    await expect(page.getByRole("region", { name: /import result/i })).toContainText("Skipped: 1");
    await page.locator("details summary").click();
    await expect(page.getByText(/row 9/i)).toBeVisible();

    // Summary counts derived from the domain signals.
    await expect(page.getByRole("button", { name: /attention.*6/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /recent investors.*2/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reconnect due.*4/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /new clients.*1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /all clients.*7/i })).toBeVisible();

    // Attention default: highest-value first, quiet clients excluded.
    const attention = [
      "Both Bala",
      "Recent Riya",
      "New Nina",
      "Never Nadia",
      "Badphone Bina",
      "Due Dev",
    ];
    for (const name of attention) {
      await expect(page.getByRole("article", { name: new RegExp(name, "i") })).toBeVisible();
    }
    await expect(page.getByRole("article", { name: /quiet quinn/i })).toHaveCount(0);
  });

  test("why-contact shows factual domain reasons", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));

    const bala = page.getByRole("article", { name: /both bala/i });
    await expect(bala).toContainText(/recent investor · invested/i);
    await expect(bala).toContainText(/follow-up due · 100 days since contact/i);
    await expect(bala).toContainText("SIP");

    const nadia = page.getByRole("article", { name: /never nadia/i });
    await expect(nadia).toContainText("Follow-up due · never contacted");

    const nina = page.getByRole("article", { name: /new nina/i });
    await expect(nina).toContainText("New client");

    await expect(page.getByRole("article", { name: /recent riya/i })).toContainText(
      "Met at review camp",
    );
  });

  test("call and whatsapp actions follow phone validity", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));

    const bala = page.getByRole("article", { name: /both bala/i });
    const callHref = await bala.getByRole("link", { name: /^call$/i }).getAttribute("href");
    expect(callHref).toBe("tel:+919876543210");
    const waHref = await bala.getByRole("link", { name: /whatsapp/i }).getAttribute("href");
    expect(waHref).toContain("https://wa.me/919876543210?text=");
    expect(waHref).toContain(encodeURIComponent("Hi Both Bala, just reconnecting."));

    // Invalid phone: no Call/WhatsApp actions, muted explanation instead.
    const bina = page.getByRole("article", { name: /badphone bina/i });
    await expect(bina.getByRole("link", { name: /^call$/i })).toHaveCount(0);
    await expect(bina.getByRole("link", { name: /whatsapp/i })).toHaveCount(0);
    await expect(bina).toContainText("Phone number needs checking");
    await expect(bina.getByRole("button", { name: /^message$/i })).toBeVisible();
  });

  test("mark contacted clears reconnect and leaves attention, with undo", async ({
    page,
  }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));

    const dev = page.getByRole("article", { name: /due dev/i });
    await expect(dev).toContainText(/follow-up due · 100 days since contact/i);
    await dev.getByRole("button", { name: /mark contacted/i }).click();

    await expect(page.getByRole("article", { name: /due dev/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /attention.*5/i })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Marked Due Dev as contacted.");

    await page.getByRole("button", { name: /undo/i }).click();
    await expect(page.getByRole("article", { name: /due dev/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /due dev/i })).toContainText(
      /follow-up due · 100 days since contact/i,
    );
  });

  test("signal coexistence: recent investor remains after contact", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));

    const bala = page.getByRole("article", { name: /both bala/i });
    await bala.getByRole("button", { name: /mark contacted/i }).click();

    const updated = page.getByRole("article", { name: /both bala/i });
    await expect(updated).toBeVisible();
    await expect(updated).toContainText(/recent investor · invested/i);
    await expect(updated).not.toContainText(/follow-up due/i);
  });

  test("interval change recalculates reconnect signals", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));
    await expect(page.getByRole("button", { name: /reconnect due.*4/i })).toBeVisible();

    await page.getByLabel(/reconnect every/i).selectOption("180");
    await expect(page.getByRole("button", { name: /reconnect due.*1/i })).toBeVisible();

    // Only the never-contacted client is still due at 180 days.
    await page.getByRole("button", { name: /reconnect due.*1/i }).click();
    await expect(page.getByRole("article", { name: /never nadia/i })).toBeVisible();
    await expect(page.getByRole("article", { name: /due dev/i })).toHaveCount(0);
  });

  test("message opens prefilled studio and back preserves state", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));

    await page
      .getByRole("article", { name: /both bala/i })
      .getByRole("button", { name: /^message$/i })
      .click();
    await expect(page.getByLabel("Client name")).toHaveValue("Both Bala");
    await page.getByRole("button", { name: /back to client radar/i }).click();
    await expect(page.getByRole("article", { name: /both bala/i })).toBeVisible();
  });

  test("export reflects contacted state", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));
    await page
      .getByRole("article", { name: /due dev/i })
      .getByRole("button", { name: /mark contacted/i })
      .click();
    await expect(page.getByRole("status")).toContainText("Marked Due Dev as contacted.");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download updated csv/i }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const content = readFileSync(filePath as string, "utf8");

    expect(content.split("\n")[0]).toBe(
      "Client Name,Mobile,Investment Type,Last Invested,Last Contacted,New Client,Note",
    );
    const today = ddmmyyyy(new Date());
    const devLine = content.split("\n").find((line) => line.startsWith("Due Dev,"));
    expect(devLine).toContain(today);
  });

  test("no network traffic and no client data in storage or URL", async ({ page }, testInfo) => {
    await page.route(/.*/, (route) => {
      const url = route.request().url();
      if (url.startsWith("http://localhost:") || url.startsWith("ws://localhost")) {
        return route.continue();
      }
      return route.abort();
    });
    await page.goto("/tools/client-radar");

    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));
    await expect(page.getByRole("article", { name: /both bala/i })).toBeVisible();

    expect(page.url()).not.toContain("Bala");
    const stored = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) out[key] = window.localStorage.getItem(key) ?? "";
      }
      return JSON.stringify(out);
    });
    expect(stored).not.toContain("Both Bala");
    expect(stored).not.toContain("9876543210");
  });

  test("no horizontal scrolling on mobile dashboard", async ({ page }, testInfo) => {
    await uploadRadarCsv(page, writeRadarCsv(testInfo, "radar.csv", radarCsvText()));
    await expect(page.getByRole("article", { name: /both bala/i })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
