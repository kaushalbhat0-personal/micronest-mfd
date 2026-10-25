import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function ddmmyyyy(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function shiftDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

/** Builds a valid sample CSV dated relative to "now" so tests never rot. */
export function sampleCsvText(now: Date = new Date()): string {
  const rows = [
    ["Overdue Raj", "9876543210", ddmmyyyy(shiftDays(now, -2)), "SIP", "Mandate pending"],
    ["Today Amit", "", ddmmyyyy(now), "KYC", "Call after 11am"],
    ["Upcoming Sunita", "919876543210", ddmmyyyy(shiftDays(now, 1)), "Review", "Annual review"],
    ["Bad Phone Vikram", "abc123", ddmmyyyy(now), "Call back", ""],
  ];
  return `Client Name,Mobile,Next Follow-up,Reason,Note\n${rows.map((r) => r.join(",")).join("\n")}\n`;
}

/** Writes CSV text to the test output dir and returns the file path. */
export function writeCsv(testInfo: TestInfo, fileName: string, text: string): string {
  mkdirSync(testInfo.outputDir, { recursive: true });
  const filePath = join(testInfo.outputDir, fileName);
  writeFileSync(filePath, text, "utf8");
  return filePath;
}

export async function uploadCsv(page: Page, filePath: string): Promise<void> {
  await page.locator("#fu-file").setInputFiles(filePath);
}
