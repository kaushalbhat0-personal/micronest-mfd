import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Accessibility", () => {
  for (const path of [
    "/",
    "/tools/message-studio",
    "/workspace/today",
    "/workspace/clients",
    "/workspace/clients/123e4567-e89b-42d3-a456-426614174000",
    "/login",
  ]) {
    test(`0 serious/critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }

  test("0 serious/critical violations in Write a message mode", async ({ page }) => {
    await page.goto("/tools/message-studio");
    await page.getByRole("radio", { name: /write a message/i }).check();
    await page.getByLabel("Your message").fill("नमस्कार राहुल जी, SIP confirm झाले आहे. 🙏");
    await page.getByRole("button", { name: /prepare message/i }).click();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
