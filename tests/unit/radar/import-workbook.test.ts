import { describe, expect, it } from "vitest";
import { parseCsvSheet, parseXlsxWorkbook } from "@/features/radar/import/workbook";
import {
  buildErrorCsv,
  buildTemplateCsv,
  TEMPLATE_FILENAME,
} from "@/features/radar/import/template-csv";
import { RADAR_HEADERS } from "@/features/radar/template";

describe("buildTemplateCsv", () => {
  it("emits the exact canonical headers with no sample data", () => {
    expect(buildTemplateCsv()).toBe(`${[...RADAR_HEADERS].join(",")}\n`);
    expect(buildTemplateCsv()).not.toMatch(/[0-9]/);
  });

  it("uses the documented template filename", () => {
    expect(TEMPLATE_FILENAME).toBe("micronest-mfd-client-template.csv");
  });
});

describe("buildErrorCsv", () => {
  it("exports only rows needing attention with reasons", () => {
    const csv = buildErrorCsv([
      {
        key: "row-2",
        line: 2,
        name: "Unnamed row",
        mobile: "—",
        investmentType: "Other",
        status: "invalid",
        reasons: ["Client name is missing."],
        fields: { "Client Name": "", Mobile: "9876543210" },
      },
      {
        key: "row-3",
        line: 3,
        name: "Rajesh",
        mobile: "9876543210",
        investmentType: "SIP",
        status: "ready",
        reasons: [],
        fields: { "Client Name": "Rajesh" },
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(`${[...RADAR_HEADERS].join(",")},Issue`);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Client name is missing.");
  });

  it("quotes cells containing commas", () => {
    const csv = buildErrorCsv([
      {
        key: "row-2",
        line: 2,
        name: "Sharma, Rajesh",
        mobile: "—",
        investmentType: "Other",
        status: "invalid",
        reasons: ["Client name is missing."],
        fields: { Note: "Met, at branch" },
      },
    ]);
    expect(csv).toContain('"Met, at branch"');
  });
});

describe("parseCsvSheet", () => {
  it("reads headers and rows with line numbers", () => {
    const sheet = parseCsvSheet("c.csv", "Client Name,Mobile\nRajesh,9876543210\n");
    expect(sheet.header).toEqual(["Client Name", "Mobile"]);
    expect(sheet.rows).toEqual([{ line: 2, cells: ["Rajesh", "9876543210"] }]);
    expect(sheet.blankCount).toBe(0);
    expect(sheet.malformed).toEqual([]);
  });

  it("reports an empty file with no headers", () => {
    const sheet = parseCsvSheet("empty.csv", "\n\n");
    expect(sheet.header).toEqual([]);
    expect(sheet.rows).toEqual([]);
  });
});

describe("parseXlsxWorkbook", () => {
  async function bufferOf(sheets: Record<string, unknown[][]>): Promise<ArrayBuffer> {
    const { utils, write } = await import("xlsx");
    const workbook = utils.book_new();
    for (const [name, grid] of Object.entries(sheets)) {
      utils.book_append_sheet(workbook, utils.aoa_to_sheet(grid), name);
    }
    const out = write(workbook, { type: "array", bookType: "xlsx" });
    return out instanceof ArrayBuffer ? out : (new Uint8Array(out).buffer as ArrayBuffer);
  }

  it("reads a single-sheet workbook", async () => {
    const buffer = await bufferOf({
      Clients: [
        ["Client Name", "Mobile"],
        ["Rajesh", 9876543210],
        ["Asha", ""],
      ],
    });
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.sheetNames).toEqual(["Clients"]);
    expect(workbook.sheets[0].header).toEqual(["Client Name", "Mobile"]);
    expect(workbook.sheets[0].rows).toHaveLength(2);
    expect(workbook.sheets[0].rows[0].cells).toEqual(["Rajesh", 9876543210]);
  });

  it("keeps every sheet and skips blank rows", async () => {
    const buffer = await bufferOf({
      One: [["Client Name"], ["A"], [], ["B"]],
      Two: [["Client Name"], ["C"]],
    });
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.sheetNames).toEqual(["One", "Two"]);
    expect(workbook.sheets[0].rows.map((r) => r.cells)).toEqual([[`A`], [`B`]]);
    expect(workbook.sheets[0].blankCount).toBe(1);
  });

  it("reports a headerless sheet as unusable", async () => {
    const buffer = await bufferOf({ Empty: [[], []] });
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.sheets[0].header).toEqual([]);
  });
});
