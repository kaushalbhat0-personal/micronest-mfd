import { describe, expect, it } from "vitest";
import { parseXlsxWorkbook } from "@/features/radar/import/workbook";
import { RADAR_HEADERS } from "@/features/radar/template";
import {
  buildTemplateXlsx,
  CLIENTS_SHEET_NAME,
  GUIDE_SHEET_NAME,
  IMPORT_GUIDE_ROWS,
  TEMPLATE_XLSX_FILENAME,
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
