import { describe, expect, it } from "vitest";
import {
  NEW_CLIENT_TRUTHY,
  normalizeInvestmentType,
  parseNewClientFlag,
  RADAR_HEADERS,
} from "@/features/radar/template";

describe("normalizeInvestmentType", () => {
  it.each([
    ["SIP", "SIP"],
    ["sip", "SIP"],
    ["  Lumpsum  ", "Lumpsum"],
    ["lump sum", "Lumpsum"],
    ["LUMPSUM", "Lumpsum"],
    ["BOTH", "Both"],
    ["insurance", "Insurance"],
    ["other", "Other"],
  ])("normalizes %s to %s without warning", (raw, expected) => {
    expect(normalizeInvestmentType(raw)).toEqual({ value: expected, warning: null });
  });

  it("maps blank to Other silently", () => {
    expect(normalizeInvestmentType("")).toEqual({ value: "Other", warning: null });
    expect(normalizeInvestmentType("   ")).toEqual({ value: "Other", warning: null });
  });

  it("maps unknown values to Other with a warning", () => {
    const result = normalizeInvestmentType("Crypto");
    expect(result.value).toBe("Other");
    expect(result.warning).toContain("Other");
  });
});

describe("parseNewClientFlag", () => {
  it.each([...NEW_CLIENT_TRUTHY, "Y", "YES", "1", " y "])("treats %s as true", (raw) => {
    expect(parseNewClientFlag(raw)).toEqual({ value: true, warning: null });
  });

  it("treats blank as false without warning", () => {
    expect(parseNewClientFlag("")).toEqual({ value: false, warning: null });
  });

  it.each(["no", "false", "0", "existing", "n"])("treats %s as an explicit no", (raw) => {
    expect(parseNewClientFlag(raw)).toEqual({ value: false, warning: null });
  });

  it("treats unrecognized values as false with a warning", () => {
    const result = parseNewClientFlag("maybe");
    expect(result.value).toBe(false);
    expect(result.warning).toContain("not recognized");
  });
});

describe("RADAR_HEADERS", () => {
  it("declares the seven-column contract", () => {
    expect(RADAR_HEADERS).toEqual([
      "Client Name",
      "Mobile",
      "Investment Type",
      "Last Invested",
      "Last Contacted",
      "New Client",
      "Note",
    ]);
  });
});
