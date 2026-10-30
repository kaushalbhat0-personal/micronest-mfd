import { parseCsv } from "@/lib/csv";
import type { CellValue, ImportRow, ImportSheet } from "./import-types";

export const IMPORTABLE_EXTENSIONS = [".csv", ".xlsx"] as const;

function isBlankCell(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  );
}

/** First row containing at least one non-blank cell; -1 when none. */
function headerRowIndex(grid: unknown[][]): number {
  return grid.findIndex((row) => row.some((cell) => !isBlankCell(cell)));
}

function toCell(value: unknown): CellValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function sheetFromGrid(name: string, grid: unknown[][]): ImportSheet {
  const headerIndex = headerRowIndex(grid);
  if (headerIndex === -1) {
    return { name, header: [], rows: [], blankCount: 0, malformed: [] };
  }
  const header = grid[headerIndex].map((cell) =>
    typeof cell === "string" ? cell : cell === null || cell === undefined ? "" : String(cell),
  );
  const rows: ImportRow[] = [];
  let blankCount = 0;
  grid.slice(headerIndex + 1).forEach((row, offset) => {
    if (row.every(isBlankCell)) {
      blankCount += 1;
      return;
    }
    rows.push({ line: headerIndex + offset + 2, cells: row.map(toCell) });
  });
  return { name, header, rows, blankCount, malformed: [] };
}

/** Parses CSV text with the shared RFC-4180 parser. Always one sheet. */
export function parseCsvSheet(fileName: string, text: string): ImportSheet {
  const parsed = parseCsv(text);
  const rows: ImportRow[] = parsed.rows.map((row) => ({ line: row.line, cells: row.fields }));
  return {
    name: fileName,
    header: parsed.header,
    rows,
    blankCount: parsed.blankCount,
    malformed: parsed.malformed,
  };
}

export interface XlsxWorkbook {
  sheetNames: string[];
  sheets: ImportSheet[];
}

/**
 * Parses an XLSX buffer locally in the browser. The `xlsx` dependency is
 * loaded on demand so the main bundle never carries the parser. Nothing
 * leaves the device: no upload, no storage, no telemetry.
 */
export async function parseXlsxWorkbook(buffer: ArrayBuffer): Promise<XlsxWorkbook> {
  const { read, utils } = await import("xlsx");
  const workbook = read(buffer, { type: "array", cellDates: false });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const grid = utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    return sheetFromGrid(sheetName, grid);
  });
  return { sheetNames: workbook.SheetNames, sheets };
}
