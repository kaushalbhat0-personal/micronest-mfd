import { describe, expect, it } from "vitest";
import { parseXlsxWorkbook } from "@/features/radar/import/workbook";
import { GENERAL_TEMPLATE_HEADERS, RADAR_HEADERS } from "@/features/radar/template";
import {
  buildGeneralTemplateXlsx,
  buildTemplateXlsx,
  CLIENTS_SHEET_NAME,
  GENERAL_GUIDE_ROWS,
  GUIDE_SHEET_NAME,
  IMPORT_GUIDE_ROWS,
  TEMPLATE_XLSX_FILENAME,
  GENERAL_TEMPLATE_XLSX_FILENAME,
} from "@/features/radar/import/template-xlsx";

describe("buildTemplateXlsx", () => {
  it("uses the documented xlsx filename", () => {
    expect(TEMPLATE_XLSX_FILENAME).toBe("micronest-mfd-client-template.xlsx");
  });

  it("documents every canonical header in the guide with no fake client rows", async () => {
    const buffer = await buildTemplateXlsx();
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.sheetNames).toEqual([CLIENTS_SHEET_NAME, GUIDE_SHEET_NAME]);

    const clients = workbook.sheets[0];
    expect(clients.header).toEqual([...RADAR_HEADERS]);
    expect(clients.rows).toHaveLength(0);

    const guide = workbook.sheets[1];
    expect(guide.header).toEqual(["Column", "Required?", "What to enter", "Example"]);
    const guideText = guide.rows.map((row) => String(row.cells[0] ?? ""));
    for (const header of RADAR_HEADERS) {
      expect(guideText.some((line) => line === header)).toBe(true);
    }
    expect(guideText.join("\n")).not.toMatch(/[0-9]{10}/);
    expect(IMPORT_GUIDE_ROWS).toHaveLength(RADAR_HEADERS.length);
    expect(IMPORT_GUIDE_ROWS.map((row) => row.column)).toEqual([...RADAR_HEADERS]);
  });

  it("the Clients sheet auto-maps with no manual step", async () => {
    const { autoMapColumns } = await import("@/features/radar/import/aliases");
    const buffer = await buildTemplateXlsx();
    const workbook = await parseXlsxWorkbook(buffer);
    expect(autoMapColumns(workbook.sheets[0].header)).toEqual([...RADAR_HEADERS]);
  });
});

describe("buildGeneralTemplateXlsx", () => {
  it("uses the documented generic xlsx filename", () => {
    expect(GENERAL_TEMPLATE_XLSX_FILENAME).toBe("micronest-general-client-template.xlsx");
  });

  it("has the exact five generic columns with no sample data rows", async () => {
    const buffer = await buildGeneralTemplateXlsx();
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.sheetNames).toEqual([CLIENTS_SHEET_NAME, GUIDE_SHEET_NAME]);
    expect(workbook.sheets[0].header).toEqual([...GENERAL_TEMPLATE_HEADERS]);
    expect(workbook.sheets[0].rows).toHaveLength(0);
  });

  it("documents every generic column with neutral, international examples", async () => {
    const buffer = await buildGeneralTemplateXlsx();
    const workbook = await parseXlsxWorkbook(buffer);
    const guide = workbook.sheets[1];
    expect(guide.header).toEqual(["Column", "Required?", "What to enter", "Example"]);
    const guideText = guide.rows.map((row) => String(row.cells[0] ?? "")).join("\n");
    for (const header of GENERAL_TEMPLATE_HEADERS) {
      expect(guideText).toContain(header);
    }
    // Only Client Name is required.
    expect(GENERAL_GUIDE_ROWS.filter((r) => r.required === "Yes").map((r) => r.column)).toEqual([
      "Client Name",
    ]);
    // The per-column guidance is internationally neutral: no ₹ and no MFD
    // product terms. (The closing note may point MFD-intent users at the
    // MFD template by name.)
    const columnCopy = GENERAL_GUIDE_ROWS.map((r) => `${r.what} ${r.example}`).join("\n");
    expect(columnCopy).not.toMatch(/₹|SIP|Lumpsum|Investment Type/);
    // Internationally neutral examples — no Indian names.
    expect(columnCopy).not.toMatch(/Rahul|Sharma|Meera|Rajesh/);
    // Explains day-first dates and international phone handling.
    expect(guideText).toMatch(/day-first/i);
    expect(guideText).toMatch(/\+44/);
    expect(guideText).toMatch(/Check now/i);
  });

  it("the generic Clients sheet auto-maps with no manual step", async () => {
    const { autoMapColumns } = await import("@/features/radar/import/aliases");
    const buffer = await buildGeneralTemplateXlsx();
    const workbook = await parseXlsxWorkbook(buffer);
    expect(autoMapColumns(workbook.sheets[0].header)).toEqual([
      "Client Name",
      "Mobile",
      "Last Invested",
      "Last Contacted",
      "Note",
    ]);
  });
});
