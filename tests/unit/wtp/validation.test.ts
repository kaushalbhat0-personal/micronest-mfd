import { describe, expect, it } from "vitest";
import {
  parseExactAmountToMinor,
  validateWtpSubmission,
  type WtpSubmissionInput,
} from "@/features/wtp/validation";
import { parsePerfBeacon } from "@/lib/perf/schema";

function validInput(overrides: Partial<WtpSubmissionInput> = {}): WtpSubmissionInput {
  return {
    email: null,
    country: "US",
    profession: "consultant",
    professionOther: null,
    clientCountBand: "11-25",
    currentSolution: ["excel"],
    currentSolutionOther: null,
    desiredFeatures: ["followup-reminders"],
    otherFeature: null,
    quotedPriceMinor: null,
    quotedCurrency: null,
    priceBand: "10-25",
    message: null,
    ...overrides,
  };
}

describe("wtp validation (MFD-78)", () => {
  it("accepts a complete valid submission", () => {
    expect(validateWtpSubmission(validInput())).toEqual([]);
  });

  it("requires country, profession, and client-count band", () => {
    const errors = validateWtpSubmission(
      validInput({ country: "", profession: "astronaut", clientCountBand: "many" }),
    );
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("country");
    expect(fields).toContain("profession");
    expect(fields).toContain("clientCountBand");
  });

  it("rejects an unknown client-count band", () => {
    const errors = validateWtpSubmission(validInput({ clientCountBand: "0-5" }));
    expect(errors.map((e) => e.field)).toContain("clientCountBand");
  });

  it("accepts every documented profession, including other with free text", () => {
    for (const profession of [
      "consultant",
      "coach",
      "insurance-advisor",
      "financial-professional",
      "real-estate-professional",
      "agency",
      "education-training",
      "healthcare-wellness",
      "freelancer",
    ]) {
      expect(validateWtpSubmission(validInput({ profession }))).toEqual([]);
    }
    expect(
      validateWtpSubmission(validInput({ profession: "other", professionOther: "Planner" })),
    ).toEqual([]);
  });

  it("requires at least one current solution and one desired feature", () => {
    const errors = validateWtpSubmission(validInput({ currentSolution: [], desiredFeatures: [] }));
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("currentSolution");
    expect(fields).toContain("desiredFeatures");
  });

  it("rejects unknown or duplicated multi-select values", () => {
    expect(
      validateWtpSubmission(validInput({ currentSolution: ["excel", "telepathy"] })).map(
        (e) => e.field,
      ),
    ).toContain("currentSolution");
    expect(
      validateWtpSubmission(
        validInput({ desiredFeatures: ["automations", "automations"] }),
      ).map((e) => e.field),
    ).toContain("desiredFeatures");
  });

  it("requires an exact amount and currency together, never one without the other", () => {
    expect(
      validateWtpSubmission(validInput({ quotedPriceMinor: 2500, quotedCurrency: null })).map(
        (e) => e.field,
      ),
    ).toContain("quotedCurrency");
    expect(
      validateWtpSubmission(validInput({ quotedPriceMinor: null, quotedCurrency: "USD" })).map(
        (e) => e.field,
      ),
    ).toContain("quotedPriceMinor");
  });

  it("rejects non-ISO currency codes", () => {
    expect(
      validateWtpSubmission(
        validInput({ quotedPriceMinor: 2500, quotedCurrency: "usd" }),
      ).map((e) => e.field),
    ).toContain("quotedCurrency");
    expect(
      validateWtpSubmission(
        validInput({ quotedPriceMinor: 2500, quotedCurrency: "DOLLAR" }),
      ).map((e) => e.field),
    ).toContain("quotedCurrency");
  });

  it("treats free and not-sure as amount-free bands", () => {
    expect(validateWtpSubmission(validInput({ priceBand: "free" }))).toEqual([]);
    expect(validateWtpSubmission(validInput({ priceBand: "not-sure" }))).toEqual([]);
    const withAmount = validateWtpSubmission(
      validInput({ priceBand: "free", quotedPriceMinor: 0, quotedCurrency: "USD" }),
    );
    expect(withAmount.map((e) => e.field)).toContain("quotedPriceMinor");
  });

  it("bounds free-text lengths", () => {
    const errors = validateWtpSubmission(
      validInput({ otherFeature: "x".repeat(201), message: "y".repeat(1001) }),
    );
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("otherFeature");
    expect(fields).toContain("message");
    expect(validateWtpSubmission(validInput({ message: "z".repeat(1000) }))).toEqual([]);
  });

  it("rejects malformed optional emails but allows absence", () => {
    expect(validateWtpSubmission(validInput({ email: "not-an-email" })).map((e) => e.field)).toContain(
      "email",
    );
    expect(validateWtpSubmission(validInput({ email: null }))).toEqual([]);
    expect(validateWtpSubmission(validInput({ email: "  " }))).toEqual([]);
  });
});

describe("exact amount minor-unit conversion (MFD-78)", () => {
  it("converts dollars without floating-point drift", () => {
    expect(parseExactAmountToMinor("25")).toEqual({ minor: 2500, error: null });
    expect(parseExactAmountToMinor("25.50")).toEqual({ minor: 2550, error: null });
    expect(parseExactAmountToMinor("1,250.75")).toEqual({ minor: 125075, error: null });
  });

  it("handles INR and GBP inputs as opaque decimals — no conversion", () => {
    // ₹1,999.50 and £9.99 are stored as their own minor units; the
    // currency tag travels alongside, so no FX math ever happens here.
    expect(parseExactAmountToMinor("1999.50")).toEqual({ minor: 199950, error: null });
    expect(parseExactAmountToMinor("9.99")).toEqual({ minor: 999, error: null });
    expect(
      validateWtpSubmission(
        validInput({ quotedPriceMinor: 199950, quotedCurrency: "INR" }),
      ),
    ).toEqual([]);
    expect(
      validateWtpSubmission(validInput({ quotedPriceMinor: 999, quotedCurrency: "GBP" })),
    ).toEqual([]);
  });

  it("treats blank as absent and rejects malformed input", () => {
    expect(parseExactAmountToMinor("   ")).toEqual({ minor: null, error: null });
    expect(parseExactAmountToMinor("abc").error).not.toBeNull();
    expect(parseExactAmountToMinor("25.999").error).not.toBeNull();
  });

  it("accepts either side of the paid bands without an exact amount", () => {
    expect(validateWtpSubmission(validInput({ priceBand: "under-5" }))).toEqual([]);
    expect(validateWtpSubmission(validInput({ priceBand: "50-plus" }))).toEqual([]);
  });
});

describe("validation funnel analytics allow-list (MFD-78)", () => {
  it("accepts the three funnel events as bare aggregates", () => {
    for (const event of [
      "validation_page_viewed",
      "validation_form_started",
      "validation_form_submitted",
    ]) {
      expect(parsePerfBeacon({ op: "validation.event", event })).toEqual({
        op: "validation.event",
        event,
      });
    }
  });

  it("still rejects PII-shaped extras on the funnel events", () => {
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "validation_form_submitted",
        email: "a@b.com",
      }),
    ).toBeNull();
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "validation_form_submitted",
        message: "hello",
      }),
    ).toBeNull();
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "validation_page_viewed",
        price_band: "10-25",
      }),
    ).toBeNull();
  });
});
