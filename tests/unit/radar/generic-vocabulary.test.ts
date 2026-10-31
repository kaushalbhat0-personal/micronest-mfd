import { describe, expect, it } from "vitest";
import { validateClientFields } from "@/features/radar/validation";
import { investmentSummaryLine } from "@/features/radar/template";

const TODAY = "2026-10-26";

/**
 * Phase 2.1: user-facing presentation goes neutral ("Category",
 * "Last activity", "No investment details") while stored MFD data —
 * investment_type, sip/lumpsum paise, last_invested — is byte-identical.
 * No database field was renamed.
 */
describe("generic vocabulary keeps stored MFD data", () => {
  it("stores a full MFD record through neutral presentation", () => {
    const result = validateClientFields(
      {
        name: "Meera",
        phone: "9876543210",
        investmentType: "Both",
        sipAmount: "10000",
        lumpsumAmount: "200000",
        lastInvested: "25/10/2026",
        lastContacted: "",
        note: "",
      },
      TODAY,
      "form",
    );
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      name: "Meera",
      investmentType: "Both",
      sipAmountPaise: 1000000,
      lumpsumAmountPaise: 20000000,
      lastInvested: "2026-10-25",
    });
  });

  it("stores a generic client as the default bucket with no amounts", () => {
    const result = validateClientFields(
      {
        name: "Alex Morgan",
        phone: "+1 5551234567",
        investmentType: "",
        sipAmount: "",
        lumpsumAmount: "",
        lastInvested: "",
        lastContacted: "20/10/2026",
        note: "Prefers morning calls",
      },
      TODAY,
      "csv",
      "US",
    );
    expect(result.error).toBeNull();
    expect(result.row).toMatchObject({
      investmentType: "Other",
      sipAmountPaise: null,
      lumpsumAmountPaise: null,
      lastInvested: null,
      lastContacted: "2026-10-20",
    });
  });
});

describe("investmentSummaryLine", () => {
  it("reads neutrally when nothing investment-related is recorded", () => {
    expect(
      investmentSummaryLine({
        investmentType: "Other",
        sipAmountPaise: null,
        lumpsumAmountPaise: null,
        lastInvested: null,
      }),
    ).toBe("No investment details");
  });

  it("keeps MFD wording for anything recorded", () => {
    expect(
      investmentSummaryLine({
        investmentType: "SIP",
        sipAmountPaise: 500000,
        lumpsumAmountPaise: null,
        lastInvested: null,
      }),
    ).toContain("SIP");
    expect(
      investmentSummaryLine({
        investmentType: "Both",
        sipAmountPaise: 1000000,
        lumpsumAmountPaise: 20000000,
        lastInvested: "2026-10-25",
      }),
    ).toContain("25/10/2026");
    expect(
      investmentSummaryLine({
        investmentType: "Lumpsum",
        sipAmountPaise: null,
        lumpsumAmountPaise: null,
        lastInvested: null,
      }),
    ).toContain("Lumpsum");
  });
});
