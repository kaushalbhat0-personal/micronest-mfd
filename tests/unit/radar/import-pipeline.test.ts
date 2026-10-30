import { describe, expect, it } from "vitest";
import { parseCsvSheet } from "@/features/radar/import/workbook";
import { buildPreview } from "@/features/radar/import/pipeline";
import { autoMapColumns } from "@/features/radar/import/aliases";
import type { ImportSheet } from "@/features/radar/import/import-types";

const TODAY = "2026-10-26";

function sheetFrom(header: string[], lines: string[][]): ImportSheet {
  return {
    name: "test.csv",
    header,
    rows: lines.map((cells, i) => ({ line: i + 2, cells })),
    blankCount: 0,
    malformed: [],
  };
}

describe("buildPreview", () => {
  it("marks clean rows ready with persistence input", () => {
    const sheet = sheetFrom(
      [
        "Client Name",
        "Mobile",
        "Investment Type",
        "Amount",
        "Last Invested",
        "Last Contacted",
        "New Client",
        "Note",
      ],
      [["Rajesh Sharma", "9876543210", "SIP", "5000", "25/10/2026", "", "yes", "Met at branch"]],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].status).toBe("ready");
    expect(preview.rows[0].input).toMatchObject({
      name: "Rajesh Sharma",
      investmentType: "SIP",
      amountPaise: 500000,
    });
    expect(preview.summary).toMatchObject({ ready: 1, attention: 0, invalid: 0, skipped: 0 });
  });

  it("imports legacy seven-column files with a blank amount", () => {
    const sheet = sheetFrom(
      [
        "Client Name",
        "Mobile",
        "Investment Type",
        "Last Invested",
        "Last Contacted",
        "New Client",
        "Note",
      ],
      [["Legacy Lal", "9876543210", "SIP", "25/10/2026", "", "yes", "Old template"]],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("ready");
    expect(preview.rows[0].input).toMatchObject({ name: "Legacy Lal", amountPaise: null });
  });

  it("rejects malformed amounts and maps amount aliases", () => {
    const sheet = sheetFrom(
      ["Client", "Investment Amount"],
      [
        ["Bad Money", "not money"],
        ["Good Money", "₹12,000"],
      ],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].reasons.join(" ")).toContain("Amount");
    expect(preview.rows[1].status).toBe("ready");
    expect(preview.rows[1].input).toMatchObject({ amountPaise: 1200000 });
  });

  it("maps aliases and flags warnings as needing attention", () => {
    const sheet = sheetFrom(
      ["Client", "Phone Number", "Type"],
      [["Asha", "not-a-number", "Crypto"]],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("attention");
    expect(preview.rows[0].reasons.join(" ")).toContain("Phone number");
    expect(preview.rows[0].input).toBeDefined();
  });

  it("marks missing names invalid and existing clients skipped", () => {
    const sheet = sheetFrom(
      ["Client Name", "Mobile"],
      [
        ["", "9811111111"],
        ["Old Client", "+91 98765 43210"],
        ["Old Client", ""],
      ],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [{ mobileKey: "919876543210", nameKey: "old client" }],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.status)).toEqual(["invalid", "skipped", "skipped"]);
    expect(preview.rows[0].reasons.join(" ")).toContain("missing");
    expect(preview.rows[1].reasons.join(" ")).toContain("Already in your client book");
  });

  it("rejects sensitive names without echoing them", () => {
    const pan = "ABCDE1234F";
    const sheet = sheetFrom(["Client Name"], [[`holder ${pan}`]]);
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].name).toBe("Unnamed row");
    expect(preview.rows[0].reasons.join(" ")).not.toContain(pan);
  });

  it("normalizes spreadsheet dates and rejects impossible ones", () => {
    const sheet = sheetFrom(
      ["Client Name", "Last Invested"],
      [
        ["A", "25-10-2026"],
        ["B", "2026-10-25"],
        ["C", "99/99/9999"],
      ],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "ready", "invalid"]);
    expect(preview.rows[0].input?.lastInvested).toBe("2026-10-25");
  });

  it("surfaces malformed CSV lines as skipped", () => {
    const parsed = parseCsvSheet(
      "bad.csv",
      'Client Name,Mobile\nRajesh,9876543210\n"broken,123\nAsha,9822222222\n',
    );
    expect(parsed.malformed).toEqual([3]);
    const preview = buildPreview({
      sheet: parsed,
      mapping: autoMapColumns(parsed.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "skipped", "ready"]);
  });

  it("handles quoted commas and empty rows in CSV", () => {
    const parsed = parseCsvSheet(
      "q.csv",
      'Client Name,Note\n"Sharma, Rajesh","Met, at branch"\n\nAsha,\n',
    );
    expect(parsed.header).toEqual(["Client Name", "Note"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.blankCount).toBe(1);
    const preview = buildPreview({
      sheet: parsed,
      mapping: autoMapColumns(parsed.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.name)).toEqual(["Sharma, Rajesh", "Asha"]);
  });
});
