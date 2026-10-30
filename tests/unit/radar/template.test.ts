import { describe, expect, it } from "vitest";
import {
  amountHintForType,
  amountLabelForType,
  amountPaiseToInput,
  formatAmountContext,
  formatAmountPaise,
  NEW_CLIENT_TRUTHY,
  normalizeInvestmentType,
  parseAmountInput,
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
    expect(result.warning).toContain("didn't recognise");
  });
});

describe("RADAR_HEADERS", () => {
  it("declares the eight-column contract with Amount after Investment Type", () => {
    expect(RADAR_HEADERS).toEqual([
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
});

describe("parseAmountInput", () => {
  it("treats blank as absent without error", () => {
    expect(parseAmountInput("")).toEqual({ paise: null, error: null });
    expect(parseAmountInput("   ")).toEqual({ paise: null, error: null });
  });

  it("parses plain and grouped rupee text into integer paise", () => {
    expect(parseAmountInput("5000")).toEqual({ paise: 500000, error: null });
    expect(parseAmountInput("5,000")).toEqual({ paise: 500000, error: null });
    expect(parseAmountInput("₹5,000")).toEqual({ paise: 500000, error: null });
    expect(parseAmountInput("Rs. 5000")).toEqual({ paise: 500000, error: null });
    expect(parseAmountInput("5000.50")).toEqual({ paise: 500050, error: null });
    expect(parseAmountInput("5000.5")).toEqual({ paise: 500050, error: null });
  });

  it("rejects malformed, negative, and oversized amounts", () => {
    expect(parseAmountInput("five thousand").error).toContain("Amount");
    expect(parseAmountInput("-500").error).toContain("Amount");
    expect(parseAmountInput("5000.555").error).toContain("Amount");
    expect(parseAmountInput("999999999999").error).toContain("too large");
  });
});

describe("amount presentation", () => {
  it("formats paise with en-IN grouping and no floating point", () => {
    expect(formatAmountPaise(500000)).toBe("₹5,000");
    expect(formatAmountPaise(500050)).toBe("₹5,000.50");
    expect(formatAmountPaise(20000000)).toBe("₹2,00,000");
  });

  it("round-trips through the CSV/form input shape", () => {
    expect(amountPaiseToInput(500000)).toBe("5000");
    expect(amountPaiseToInput(500050)).toBe("5000.5");
    expect(amountPaiseToInput(500005)).toBe("5000.05");
    for (const paise of [0, 1, 10, 500000, 20000000]) {
      expect(parseAmountInput(amountPaiseToInput(paise))).toEqual({ paise, error: null });
    }
  });

  it("scopes Both to the monthly SIP amount and suffixes monthly types", () => {
    expect(formatAmountContext("SIP", 500000)).toBe("₹5,000/month");
    expect(formatAmountContext("Both", 500000)).toBe("₹5,000/month");
    expect(formatAmountContext("Lumpsum", 20000000)).toBe("₹2,00,000");
    expect(formatAmountContext("Other", null)).toBeNull();
    expect(amountLabelForType("Both")).toContain("Monthly SIP");
    expect(amountHintForType("Both")).toContain("lumpsum detail");
  });
});
