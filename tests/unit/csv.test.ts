import { describe, expect, it } from "vitest";
import { detectCsvDelimiter, parseCsv } from "@/lib/csv";

describe("detectCsvDelimiter", () => {
  it("detects comma (the default and tie-break winner)", () => {
    expect(detectCsvDelimiter("Client Name,Phone,Last Contacted,Note")).toBe(",");
  });

  it("detects semicolon-delimited headers", () => {
    expect(detectCsvDelimiter("Client Name;Phone;Last Contacted;Note")).toBe(";");
  });

  it("detects tab-delimited headers", () => {
    expect(detectCsvDelimiter("Client Name\tPhone\tLast Contacted\tNote")).toBe("\t");
  });

  it("prefers comma on a tie and never guesses on empty input", () => {
    expect(detectCsvDelimiter("A,B;C")).toBe(",");
    expect(detectCsvDelimiter("")).toBe(",");
    expect(detectCsvDelimiter("\n\n")).toBe(",");
  });

  it("ignores delimiters inside quoted header cells", () => {
    expect(detectCsvDelimiter('"Client Name;alias",Phone')).toBe(",");
  });
});

describe("parseCsv delimiter handling", () => {
  it("parses comma-delimited rows", () => {
    const parsed = parseCsv("Client Name,Phone,Last Contacted,Note\nAlex,+44 7911 123456,20/10/2026,Prefers morning\n");
    expect(parsed.header).toEqual(["Client Name", "Phone", "Last Contacted", "Note"]);
    expect(parsed.rows[0].fields).toEqual(["Alex", "+44 7911 123456", "20/10/2026", "Prefers morning"]);
  });

  it("parses semicolon-delimited rows", () => {
    const parsed = parseCsv("Client Name;Phone;Last Contacted;Note\nAlex;+44 7911 123456;20/10/2026;Prefers morning\n");
    expect(parsed.header).toEqual(["Client Name", "Phone", "Last Contacted", "Note"]);
    expect(parsed.rows[0].fields).toEqual(["Alex", "+44 7911 123456", "20/10/2026", "Prefers morning"]);
  });

  it("parses tab-delimited rows", () => {
    const parsed = parseCsv("Client Name\tPhone\tNote\nAlex\t+44 7911 123456\tPrefers morning\n");
    expect(parsed.header).toEqual(["Client Name", "Phone", "Note"]);
    expect(parsed.rows[0].fields).toEqual(["Alex", "+44 7911 123456", "Prefers morning"]);
  });

  it("keeps quoted notes containing the other delimiter intact", () => {
    const parsed = parseCsv("Client Name;Note\nAlex;\"Met, at branch\"\n");
    expect(parsed.rows[0].fields).toEqual(["Alex", "Met, at branch"]);
  });

  it("still handles quoted commas and escaped quotes in comma CSV", () => {
    const parsed = parseCsv('Name,Note\n"Sharma, R","Said ""call later"", ok"\n');
    expect(parsed.rows[0].fields).toEqual(["Sharma, R", 'Said "call later", ok']);
  });

  it("does not regress existing comma behavior with CRLF and BOM", () => {
    const parsed = parseCsv("\uFEFFA,B\r\n1,2\r\n3,4\r\n");
    expect(parsed.header).toEqual(["A", "B"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.blankCount).toBe(0);
  });
});
