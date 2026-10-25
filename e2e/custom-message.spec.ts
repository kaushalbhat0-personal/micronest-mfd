import { expect, test } from "@playwright/test";

const HINDI_MESSAGE = "नमस्कार राहुल जी,\nआपका SIP अगले हफ्ते process होना है. 🙏";

test.describe("Custom Message mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tools/message-studio");
    await page.getByRole("radio", { name: /custom message/i }).check();
  });

  test("prepares a native-language message and copies it exactly", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.getByLabel("Recipient name (optional)").fill("Rahul");
    await page.getByLabel("Your message").fill(HINDI_MESSAGE);
    await page.getByRole("button", { name: /prepare message/i }).click();

    const preview = page.getByRole("region", { name: "Generated message" });
    await expect(preview).toContainText("For: Rahul");
    // Exact content preserved: script, line break, emoji.
    await expect(preview.locator("output")).toHaveText(HINDI_MESSAGE);

    await page.getByRole("button", { name: /copy message/i }).click();
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();
  });

  test("shows WhatsApp action only with a valid phone", async ({ page }) => {
    await page.getByLabel("Your message").fill("Hello, please call me back.");
    await page.getByRole("button", { name: /prepare message/i }).click();

    // No phone: Copy only, no WhatsApp action.
    await expect(page.getByRole("button", { name: /copy message/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /open whatsapp/i })).toHaveCount(0);

    // Valid phone: WhatsApp handoff appears with encoded message.
    await page.getByLabel(/whatsapp number/i).fill("9876543210");
    const wa = page.getByRole("link", { name: /open whatsapp/i });
    await expect(wa).toBeVisible();
    const href = await wa.getAttribute("href");
    expect(href).toContain("https://wa.me/919876543210?text=");
    expect(href).toContain(encodeURIComponent("Hello, please call me back."));
  });

  test("blocks sensitive data from being prepared", async ({ page }) => {
    await page.getByLabel("Your message").fill("Please share PAN ABCDE1234F copy.");
    await page.getByRole("button", { name: /prepare message/i }).click();

    await expect(page.getByRole("alert").first()).toContainText(/pan/i);
    await expect(page.getByRole("region", { name: "Generated message" })).toHaveCount(0);
  });

  test("guardrail blocks copy and WhatsApp on promise wording", async ({ page }) => {
    await page.getByLabel("Your message").fill("This fund gives guaranteed returns every year.");
    await page.getByLabel(/whatsapp number/i).fill("9876543210");
    await page.getByRole("button", { name: /prepare message/i }).click();

    const preview = page.getByRole("region", { name: "Generated message" });
    await expect(preview).toContainText(/check wording/i);
    await expect(page.getByRole("button", { name: /copy message/i })).toBeDisabled();
    await expect(page.getByRole("link", { name: /open whatsapp/i })).toHaveCount(0);
  });

  test("rejects empty messages and enforces the character limit", async ({ page }) => {
    await page.getByRole("button", { name: /prepare message/i }).click();
    await expect(page.getByRole("alert").first()).toContainText(/type your message/i);

    await page.getByLabel("Your message").fill("a".repeat(1001));
    await expect(page.getByText(/1001 \/ 1000/)).toBeVisible();
    await page.getByRole("button", { name: /prepare message/i }).click();
    await expect(page.getByRole("alert").first()).toContainText(/within 1000 characters/i);
  });

  test("does not persist custom content across reload", async ({ page }) => {
    await page.getByLabel("Recipient name (optional)").fill("Rahul");
    await page.getByLabel(/whatsapp number/i).fill("9876543210");
    await page.getByLabel("Your message").fill(HINDI_MESSAGE);
    await page.getByRole("button", { name: /prepare message/i }).click();
    await expect(page.getByRole("region", { name: "Generated message" })).toBeVisible();

    await page.reload();
    // Mode (a UI pref) may persist, but content must not.
    await expect(page.getByLabel("Recipient name (optional)")).toHaveValue("");
    await expect(page.getByLabel("Your message")).toHaveValue("");
    await expect(page.getByRole("region", { name: "Generated message" })).toHaveCount(0);
  });
});
