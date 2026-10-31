import { describe, expect, it } from "vitest";
import { parseCsvSheet } from "@/features/radar/import/workbook";
import { buildPreview, importableRows } from "@/features/radar/import/pipeline";
import { autoMapColumns } from "@/features/radar/import/aliases";
import type { BookRecord, ImportSheet } from "@/features/radar/import/import-types";

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
        "SIP Amount",
        "Lumpsum Amount",
        "Last Invested",
        "Last Contacted",
        "Note",
      ],
      [
        [
          "Rajesh Sharma",
          "9876543210",
          "SIP",
          "5000",
          "",
          "25/10/2026",
          "",
          "Met at branch",
        ],
      ],
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
      sipAmountPaise: 500000,
      lumpsumAmountPaise: null,
    });
    // MFD-70: no lifecycle flag flows into the persistence input.
    expect(preview.rows[0].input).not.toHaveProperty("isNewClient");
    expect(preview.summary).toMatchObject({
      ready: 1,
      attention: 0,
      updated: 0,
      invalid: 0,
      skipped: 0,
    });
  });

  it("accepts a Both row with two independent amounts", () => {
    const sheet = sheetFrom(
      ["Client Name", "Mobile", "Investment Type", "SIP Amount", "Lumpsum Amount"],
      [["Meera", "9876543211", "Both", "10000", "200000"]],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows[0].status).toBe("ready");
    expect(preview.rows[0].input).toMatchObject({
      sipAmountPaise: 1000000,
      lumpsumAmountPaise: 20000000,
    });
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
    expect(preview.rows[0].input).toMatchObject({ name: "Legacy Lal", sipAmountPaise: null });
    // MFD-70: the retired flag column is ignored — the value never
    // reaches the persistence input, so it cannot override the lifecycle.
    expect(preview.rows[0].input).not.toHaveProperty("isNewClient");
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
    expect(preview.rows[1].input).toMatchObject({ lumpsumAmountPaise: 1200000 });
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
    expect(preview.rows[0].reasons.join(" ")).toContain("client's name");
    expect(preview.rows[1].reasons.join(" ")).toContain("Already in your clients");
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
    expect(preview.rows[0].name).toBe("Unnamed client");
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

  it("classifies file repeats with scope and basis, book rows update when book data is present", () => {
    const sheet = sheetFrom(
      ["Client Name", "Mobile", "SIP Amount"],
      [
        ["Rahul Sharma", "9876543210", "5000"],
        ["Rahul Sharma", "9876543210", "9000"],
        ["Book Client", "+91 98111 11111", "7000"],
      ],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [{ mobileKey: "919811111111", nameKey: "book client" }],
      todayYMD: TODAY,
    });
    // Without book records the legacy skip behavior holds, so session-only
    // previews never invent updates they cannot persist.
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "skipped", "skipped"]);
    // First occurrence keeps its amount; repeats carry no input.
    expect(preview.rows[0].input).toMatchObject({ sipAmountPaise: 500000 });
    expect(preview.rows[1].duplicate).toMatchObject({
      scope: "file",
      matchedBy: "mobile",
      firstLine: 2,
    });
    expect(preview.rows[1].reasons.join(" ")).toContain("Duplicate of row 2");
    expect(preview.rows[1].reasons.join(" ")).toContain("Matched by mobile number");
    expect(preview.rows[1].input).toBeUndefined();
    expect(preview.rows[2].duplicate).toMatchObject({ scope: "book", matchedBy: "mobile" });
    expect(preview.rows[2].reasons.join(" ")).toContain("Already in your clients");
    expect(preview.rows[2].input).toBeUndefined();
  });

  it("classifies name-only file repeats by client name with first-wins", () => {
    const sheet = sheetFrom(["Client Name"], [["Asha"], ["asha"], ["Meera"]]);
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "skipped", "ready"]);
    expect(preview.rows[1].duplicate).toMatchObject({
      scope: "file",
      matchedBy: "name",
      firstLine: 2,
    });
    expect(preview.rows[1].input).toBeUndefined();
  });

  it("keeps the same name with different valid mobiles as distinct clients", () => {
    const sheet = sheetFrom(
      ["Client Name", "Mobile"],
      [
        ["Rahul Sharma", "9876543210"],
        ["Rahul Sharma", "9811111111"],
      ],
    );
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "ready"]);
  });

  it("keeps blank-mobile rows with different names distinct", () => {
    const sheet = sheetFrom(["Client Name"], [["Asha"], ["Meera"]]);
    const preview = buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [],
      todayYMD: TODAY,
    });
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "ready"]);
  });
});

describe("buildPreview upserts", () => {
  const BOOK: BookRecord[] = [
    {
      id: "stored-1",
      name: "Book Client",
      phone: "9811111111",
      investmentType: "SIP",
      sipAmountPaise: 500000,
      lumpsumAmountPaise: null,
      lastInvested: "2026-09-01",
      lastContacted: "2026-09-10",
      note: "Keeps this note",
    },
    {
      id: "stored-2",
      name: "Nameless Match",
      phone: "",
      investmentType: "Other",
      sipAmountPaise: null,
      lumpsumAmountPaise: null,
      lastInvested: null,
      lastContacted: null,
      note: "",
    },
  ];

  function previewFor(header: string[], lines: string[][]) {
    const sheet = sheetFrom(header, lines);
    return buildPreview({
      sheet,
      mapping: autoMapColumns(sheet.header),
      existing: [
        { mobileKey: "919811111111", nameKey: "book client" },
        { mobileKey: null, nameKey: "nameless match" },
      ],
      book: BOOK,
      todayYMD: TODAY,
    });
  }

  it("updates the existing record by mobile instead of skipping or duplicating", () => {
    const preview = previewFor(
      ["Client Name", "Mobile", "SIP Amount"],
      [["Book Client", "9811111111", "9000"]],
    );
    expect(preview.rows[0].status).toBe("update");
    expect(preview.rows[0].match).toMatchObject({
      existingId: "stored-1",
      matchedBy: "mobile",
    });
    // Supplied fields win; blank cells inherit the stored record.
    expect(preview.rows[0].input).toMatchObject({
      name: "Book Client",
      phone: "9811111111",
      investmentType: "SIP",
      sipAmountPaise: 900000,
      lastInvested: "2026-09-01",
      lastContacted: "2026-09-10",
      note: "Keeps this note",
    });
    expect(preview.summary).toMatchObject({ updated: 1, ready: 0, skipped: 0 });
  });

  it("updates by exact normalized name when the upload has no mobile", () => {
    const preview = previewFor(
      ["Client Name", "Lumpsum Amount"],
      [["Nameless Match", "200000"]],
    );
    expect(preview.rows[0].status).toBe("update");
    expect(preview.rows[0].match).toMatchObject({
      existingId: "stored-2",
      matchedBy: "name",
    });
    expect(preview.rows[0].input).toMatchObject({
      lumpsumAmountPaise: 20000000,
      sipAmountPaise: null,
    });
  });

  it("never wipes stored data with blank upload cells", () => {
    const preview = previewFor(["Client Name", "Mobile"], [["Book Client", "9811111111"]]);
    expect(preview.rows[0].status).toBe("update");
    expect(preview.rows[0].input).toMatchObject({
      name: "Book Client",
      sipAmountPaise: 500000,
      lastInvested: "2026-09-01",
      lastContacted: "2026-09-10",
      note: "Keeps this note",
    });
  });

  it("marks invalid update rows invalid instead of writing them", () => {
    const preview = previewFor(
      ["Client Name", "Mobile", "SIP Amount"],
      [["Book Client", "9811111111", "not money"]],
    );
    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].input).toBeUndefined();
  });

  it("treats the first file occurrence as the update and skips repeats", () => {
    const preview = previewFor(
      ["Client Name", "Mobile", "Note"],
      [
        ["Book Client", "9811111111", "first wins"],
        ["Book Client", "9811111111", "second loses"],
      ],
    );
    expect(preview.rows.map((r) => r.status)).toEqual(["update", "skipped"]);
    expect(preview.rows[0].input).toMatchObject({ note: "first wins" });
    expect(preview.rows[1].duplicate).toMatchObject({ scope: "file" });
    expect(preview.rows[1].input).toBeUndefined();
  });

  it("counts updates separately from inserts in importable rows", () => {
    const preview = previewFor(
      ["Client Name", "Mobile"],
      [
        ["Brand New", "9800000001"],
        ["Book Client", "9811111111"],
      ],
    );
    expect(preview.rows.map((r) => r.status)).toEqual(["ready", "update"]);
    expect(importableRows(preview.rows)).toHaveLength(2);
  });
});
