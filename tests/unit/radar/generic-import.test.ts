import { describe, expect, it } from "vitest";
import { parseCsvSheet } from "@/features/radar/import/workbook";
import { buildPreview } from "@/features/radar/import/pipeline";
import { autoMapColumns } from "@/features/radar/import/aliases";
import { buildGeneralTemplateCsv, GENERAL_TEMPLATE_FILENAME } from "@/features/radar/import/template-csv";
import { GENERAL_TEMPLATE_HEADERS } from "@/features/radar/template";
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

/**
 * Phase 2.2: a plain relationship list (Client Name, Phone, Last
 * Contacted, Note) imports through the exact same pipeline, limits,
 * dedup, and blank-safe behavior as the MFD template. The existing
 * MFD template keeps working unchanged.
 */
describe("generic import template", () => {
  it("defines the four-column generic header set", () => {
    expect(GENERAL_TEMPLATE_HEADERS).toEqual([
      "Client Name",
      "Phone",
      "Last Contacted",
      "Note",
    ]);
    expect(buildGeneralTemplateCsv()).toBe("Client Name,Phone,Last Contacted,Note\n");
    expect(GENERAL_TEMPLATE_FILENAME).toBe("micronest-general-client-template.csv");
  });

  it("auto-maps generic headers onto the canonical fields", () => {
    expect(autoMapColumns(["Client Name", "Phone", "Last Contacted", "Note"])).toEqual([
      "Client Name",
      "Mobile",
      "Last Contacted",
      "Note",
    ]);
  });

  it("imports a generic row with an international number", () => {
    const sheet = sheetFrom(
      ["Client Name", "Phone", "Last Contacted", "Note"],
      [["Alex Morgan", "+1 5551234567", "20/10/2026", "Prefers morning calls"]],
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
      name: "Alex Morgan",
      // Neutral presentation, MFD storage shape: no investment columns
      // means the default bucket, not a new schema or field.
      investmentType: "Other",
      sipAmountPaise: null,
      lumpsumAmountPaise: null,
      lastInvested: null,
      lastContacted: "2026-10-20",
      note: "Prefers morning calls",
    });
    expect(preview.rows[0].input).toMatchObject({ phone: "+1 5551234567" });
    expect(preview.rows[0].reasons).toEqual([]);
  });

  it("imports a generic row with a blank phone and note", () => {
    const sheet = sheetFrom(
      ["Client Name", "Phone", "Last Contacted", "Note"],
      [["Sofia Ramos", "", "", ""]],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("ready");
    expect(preview.rows[0].input).toMatchObject({ name: "Sofia Ramos" });
  });

  it("still imports the full MFD template with amounts and types", () => {
    const sheet = sheetFrom(
      ["Client Name", "Mobile", "Investment Type", "SIP Amount", "Lumpsum Amount", "Last Invested"],
      [["Meera", "9876543211", "Both", "10000", "200000", "25/10/2026"]],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("ready");
    expect(preview.rows[0].input).toMatchObject({
      investmentType: "Both",
      sipAmountPaise: 1000000,
      lumpsumAmountPaise: 20000000,
      lastInvested: "2026-10-25",
    });
  });

  it("parses the generic CSV text through the real CSV parser", () => {
    const parsed = parseCsvSheet(
      "general.csv",
      `${buildGeneralTemplateCsv()}Alex Morgan,+1 5551234567,20/10/2026,Hello\n`,
    );
    expect(parsed.header).toEqual(["Client Name", "Phone", "Last Contacted", "Note"]);
    expect(parsed.rows).toHaveLength(1);
  });
});
