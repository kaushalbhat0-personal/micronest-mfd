import { describe, expect, it } from "vitest";
import { autoMapColumns, normalizeAliasKey } from "@/features/radar/import/aliases";
import { RADAR_HEADERS } from "@/features/radar/template";

describe("normalizeAliasKey", () => {
  it("lowercase-trims and collapses whitespace", () => {
    expect(normalizeAliasKey("  Mobile   Number ")).toBe("mobile number");
  });
});

describe("autoMapColumns", () => {
  it("maps known aliases to canonical fields", () => {
    expect(
      autoMapColumns([
        "Client",
        "Phone Number",
        "Type",
        "Investment Amount",
        "Investment Date",
        "Contact Date",
        "New",
        "Remarks",
      ]),
    ).toEqual([
      "Client Name",
      "Mobile",
      "Investment Type",
      "Amount",
      "Last Invested",
      "Last Contacted",
      "New Client",
      "Note",
    ]);
  });

  it("leaves unknown columns unmapped for manual mapping", () => {
    expect(autoMapColumns(["Client Name", "Folio Number", "PAN"])).toEqual([
      "Client Name",
      null,
      null,
    ]);
  });

  it("never merges two source columns into one canonical field", () => {
    expect(autoMapColumns(["Mobile", "Phone"])).toEqual(["Mobile", null]);
  });

  it("treats blank headers as unmapped", () => {
    expect(autoMapColumns(["Client Name", ""])).toEqual(["Client Name", null]);
  });

  it("auto-maps the exact downloaded template with no manual step needed", () => {
    expect(autoMapColumns([...RADAR_HEADERS])).toEqual([...RADAR_HEADERS]);
  });

  it("maps the split amount columns and keeps the legacy Amount column", () => {
    expect(autoMapColumns(["SIP Amount", "Lumpsum Amount", "Amount"])).toEqual([
      "SIP Amount",
      "Lumpsum Amount",
      "Amount",
    ]);
    // First source column wins; repeats stay unmapped instead of merging.
    expect(autoMapColumns(["Lumpsum Amount", "Lump Sum Amount"])).toEqual(["Lumpsum Amount", null]);
  });
});
