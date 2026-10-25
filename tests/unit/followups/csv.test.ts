import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses the template header and simple rows", () => {
    const result = parseCsv(
      "Client Name,Mobile,Next Follow-up,Reason,Note\nRajesh,9876543210,25/10/2026,SIP,Hi\n",
    );
    expect(result.header).toEqual(["Client Name", "Mobile", "Next Follow-up", "Reason", "Note"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].fields).toEqual(["Rajesh", "9876543210", "25/10/2026", "SIP", "Hi"]);
    expect(result.rows[0].line).toBe(2);
    expect(result.malformed).toEqual([]);
    expect(result.blankCount).toBe(0);
  });

  it("handles quoted commas and escaped quotes", () => {
    const result = parseCsv('Name,Note\n"Sharma, R","Said ""call later"", ok"\n');
    expect(result.rows[0].fields).toEqual(["Sharma, R", 'Said "call later", ok']);
  });

  it("strips BOM and handles CRLF and LF", () => {
    const crlf = "\uFEFFA,B\r\n1,2\r\n3,4\r\n";
    expect(parseCsv(crlf).header).toEqual(["A", "B"]);
    expect(parseCsv("A,B\n1,2\n3,4\n").rows).toHaveLength(2);
  });

  it("skips blank lines and counts them", () => {
    const result = parseCsv("A,B\n1,2\n\n   \n3,4\n");
    expect(result.rows).toHaveLength(2);
    expect(result.blankCount).toBe(2);
  });

  it("flags unbalanced quotes as malformed with line numbers", () => {
    const result = parseCsv('A,B\n1,2\n"oops,3\n4,5\n');
    expect(result.malformed).toEqual([3]);
    expect(result.rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("returns empty header for empty input", () => {
    expect(parseCsv("")).toEqual({ header: [], rows: [], malformed: [], blankCount: 0 });
    expect(parseCsv("\n\n").header).toEqual([]);
  });
});
