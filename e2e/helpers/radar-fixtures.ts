import type { Page, TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ddmmyyyy, shiftDays } from "./csv-fixtures";

/**
 * Deterministic radar fixture dated relative to "now" so tests never rot.
 * At the default 90-day interval (MFD-70 derived lifecycle):
 * - Both Bala: recent-investor + reconnect-due (contacted 100d ago)
 * - Recent Riya: recent-investor only (contacted 10d ago)
 * - New Nina: new-client + recent-investor (invested 5d ago, never contacted)
 * - Never Nadia: reconnect-due (never contacted, older investment history)
 * - Due Dev: reconnect-due only (100 days)
 * - Badphone Bina: reconnect-due, invalid phone (120 days)
 * - Quiet Quinn: no signals (contacted 5d ago, no history)
 * - Row 9: skipped (missing name)
 */
export function radarCsvText(now: Date = new Date()): string {
  const rows = [
    [
      "Both Bala",
      "9876543210",
      "SIP",
      ddmmyyyy(shiftDays(now, -10)),
      ddmmyyyy(shiftDays(now, -100)),
      "",
      "",
    ],
    [
      "Recent Riya",
      "9876543211",
      "Lumpsum",
      ddmmyyyy(shiftDays(now, -5)),
      ddmmyyyy(shiftDays(now, -10)),
      "",
      "Met at review camp",
    ],
    ["New Nina", "9876543212", "Insurance", ddmmyyyy(shiftDays(now, -5)), "", "", ""],
    ["Never Nadia", "9876543213", "Other", ddmmyyyy(shiftDays(now, -100)), "", "", ""],
    ["Due Dev", "9876543214", "Both", "", ddmmyyyy(shiftDays(now, -100)), "", ""],
    ["Badphone Bina", "abc123", "SIP", "", ddmmyyyy(shiftDays(now, -120)), "", ""],
    ["Quiet Quinn", "9876543215", "SIP", "", ddmmyyyy(shiftDays(now, -5)), "", ""],
    ["", "9876543216", "SIP", "", "", "", ""],
  ];
  return `Client Name,Mobile,Investment Type,Last Invested,Last Contacted,New Client,Note\n${rows.map((r) => r.join(",")).join("\n")}\n`;
}

export function writeRadarCsv(testInfo: TestInfo, fileName: string, text: string): string {
  mkdirSync(testInfo.outputDir, { recursive: true });
  const filePath = join(testInfo.outputDir, fileName);
  writeFileSync(filePath, text, "utf8");
  return filePath;
}

export async function uploadRadarCsv(page: Page, filePath: string): Promise<void> {
  await page.locator("#radar-file").setInputFiles(filePath);
}
