import { expect, test } from "@playwright/test";

test.describe("Message Studio smoke", () => {
  test("home links to studio; document request generates and copies", async ({ page, context }) => {
    // Grant clipboard permissions for the copy assertion (Chromium).
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /from first conversation/i })).toBeVisible();
    await page.getByRole("link", { name: /explore messages/i }).click();
    await expect(page).toHaveURL(/\/tools\/message-studio/);

    // Document Request is the default purpose.
    await page.getByLabel("Client name").fill("Test Sharma");
    await page.getByLabel(/required documents/i).fill("KYC form, cancelled cheque");
    await page.getByRole("button", { name: /generate message/i }).click();

    const preview = page.getByRole("region", { name: "Generated message" });
    await expect(preview).toContainText("Test Sharma");
    await expect(preview).toContainText("KYC form, cancelled cheque");

    await page.getByRole("button", { name: /copy message/i }).click();
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.goto("/tools/message-studio");
    await page.getByRole("button", { name: /generate message/i }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
  });
});
