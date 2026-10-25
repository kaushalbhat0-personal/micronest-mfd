import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_HEADERS } from "@/features/followups/template";
import {
  buildDirectMessage,
  buildStudioHandoff,
  formatDisplayDate,
  hashString,
  inferPurpose,
  parseAndBuildWorkspace,
} from "@/features/followups/model";
import { validateFileHeaders } from "@/features/followups/validation";

const HEADER = "Client Name,Mobile,Next Follow-up,Reason,Note";

describe("template file contract", () => {
  it("public template exists with exactly the canonical header", () => {
    const raw = readFileSync(join(process.cwd(), "public", "followup-template.csv"), "utf8");
    const firstLine = raw.replace(/^\uFEFF/, "").split(/\r?\n/)[0];
    expect(firstLine).toBe(TEMPLATE_HEADERS.join(","));
    // The validator must accept the shipped template.
    expect(validateFileHeaders(firstLine.split(",")).error).toBeNull();
  });
});

describe("hashString", () => {
  it("is deterministic and distinguishes inputs", () => {
    expect(hashString("a|b|c")).toBe(hashString("a|b|c"));
    expect(hashString("a|b|c")).not.toBe(hashString("a|b|d"));
  });
});

describe("inferPurpose", () => {
  it.each([
    ["SIP mandate pending", "sip-confirmation"],
    ["please complete kyc", "document-request"],
    ["Nominee update", "document-request"],
    ["Annual review meeting", "review-invite"],
    ["call back", "kyc-reminder"],
    ["", "kyc-reminder"],
  ])("maps %s to %s", (reason, expected) => {
    expect(inferPurpose(reason)).toBe(expected);
  });
});

describe("buildWorkspace", () => {
  const csv = (body: string) => parseAndBuildWorkspace(`${HEADER}\n${body}`, "2026-10-26");

  it("classifies statuses and sorts overdue-desc, today, upcoming-asc", () => {
    const report = csv(
      [
        "Today One,,26/10/2026,,",
        "Overdue Old,,20/10/2026,,",
        "Upcoming Later,,30/10/2026,,",
        "Overdue Recent,,25/10/2026,,",
        "Upcoming Soon,,27/10/2026,,",
      ].join("\n"),
    );
    expect(report.fileError).toBeNull();
    expect(report.rows.map((r) => r.name)).toEqual([
      "Overdue Old",
      "Overdue Recent",
      "Today One",
      "Upcoming Soon",
      "Upcoming Later",
    ]);
    expect(report.rows[0]).toMatchObject({ status: "overdue", daysOverdue: 6 });
  });

  it("accepts partial imports and reports invalid rows by spreadsheet number", () => {
    const report = csv(
      ["Good,,26/10/2026,,", ",,26/10/2026,,", "Bad Date,,99/99/9999,,"].join("\n"),
    );
    expect(report.fileError).toBeNull();
    expect(report.rows).toHaveLength(1);
    expect(report.invalid).toEqual([
      { rowNumber: 3, reason: "Client name is missing." },
      { rowNumber: 4, reason: expect.stringContaining("not a valid") },
    ]);
  });

  it("rejects files with zero valid rows", () => {
    const report = csv(",,,\n,,99/99/9999,,");
    expect(report.rows).toHaveLength(0);
    expect(report.fileError).toContain("No valid follow-up rows");
  });

  it("flags malformed lines and counts blanks", () => {
    const report = parseAndBuildWorkspace(
      `${HEADER}\nGood,,26/10/2026,,\n"broken,26/10/2026\n\n`,
      "2026-10-26",
    );
    expect(report.rows.map((r) => r.name)).toEqual(["Good"]);
    expect(report.invalid.some((i) => i.reason.includes("commas and quotes"))).toBe(true);
    expect(report.skippedBlank).toBe(1);
  });

  it("never projects extra columns into the model", () => {
    const report = parseAndBuildWorkspace(
      `Client Name,Mobile,Next Follow-up,Reason,Note,PAN,Folio\nRajesh,9876543210,26/10/2026,SIP,,ABCDE1234F,123`,
      "2026-10-26",
    );
    expect(report.fileError).toBeNull();
    expect(report.ignoredColumns).toEqual(["PAN", "Folio"]);
    expect(report.rows[0]).not.toHaveProperty("PAN");
    expect(JSON.stringify(report.rows[0])).not.toContain("ABCDE1234F");
  });

  it("rejects files over the row ceiling", () => {
    const body = Array.from({ length: 501 }, (_, i) => `Name${i},,26/10/2026,,`).join("\n");
    const report = parseAndBuildWorkspace(`${HEADER}\n${body}`, "2026-10-26");
    expect(report.fileError).toContain("500");
    expect(report.rows).toHaveLength(0);
  });

  it("marks invalid phones without dropping rows", () => {
    const report = csv("Rajesh,abc,26/10/2026,,");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].phoneValid).toBe(false);
  });
});

describe("buildStudioHandoff", () => {
  it("prefills name, phone, and purpose-specific fields", () => {
    const report = parseAndBuildWorkspace(
      `${HEADER}\nRajesh,9876543210,26/10/2026,SIP mandate,\n`,
      "2026-10-26",
    );
    const handoff = buildStudioHandoff(report.rows[0]);
    expect(handoff.purpose).toBe("sip-confirmation");
    expect(handoff.fields.clientName).toBe("Rajesh");
    expect(handoff.fields.sipDate).toBe("26/10/2026");
    expect(handoff.phone).toBe("9876543210");
  });
});

describe("buildDirectMessage", () => {
  it("falls back to generic paperwork wording without a reason", () => {
    const report = parseAndBuildWorkspace(
      `${HEADER}\nRajesh,9876543210,26/10/2026,,\n`,
      "2026-10-26",
    );
    expect(buildDirectMessage(report.rows[0])).toBe(
      "Hi Rajesh, following up regarding your investment paperwork.",
    );
  });

  it("uses the reason when present", () => {
    const report = parseAndBuildWorkspace(`${HEADER}\nRajesh,,26/10/2026,KYC,\n`, "2026-10-26");
    expect(buildDirectMessage(report.rows[0])).toBe("Hi Rajesh, following up regarding KYC.");
  });
});

describe("formatDisplayDate", () => {
  it("renders DD/MM/YYYY", () => {
    expect(formatDisplayDate("2026-10-25")).toBe("25/10/2026");
  });
});
