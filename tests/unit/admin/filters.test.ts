import { describe, expect, it } from "vitest";
import {
  excerptMessage,
  formatQuotedAmount,
  isValidUuid,
  parseSuggestionSearchParams,
  suggestionFiltersToQuery,
} from "@/features/admin/filters";

describe("suggestion filters", () => {
  it("parses valid filters and trims whitespace", () => {
    expect(
      parseSuggestionSearchParams({
        q: "  crm  ",
        profession: "coach",
        country: "IN",
        countBand: "1-10",
        priceBand: "under-5",
        authStatus: "anonymous",
        page: "3",
      }),
    ).toEqual({
      q: "crm",
      profession: "coach",
      country: "IN",
      countBand: "1-10",
      priceBand: "under-5",
      authStatus: "anonymous",
      page: 3,
    });
  });

  it("drops unsupported enum values instead of accepting them", () => {
    expect(
      parseSuggestionSearchParams({
        profession: "astronaut",
        countBand: "1-1000",
        priceBand: "under-500",
        authStatus: "superuser",
      }),
    ).toMatchObject({
      profession: "",
      countBand: "",
      priceBand: "",
      authStatus: "all",
    });
  });

  it("defaults empty params to the unfiltered first page", () => {
    expect(parseSuggestionSearchParams({})).toEqual({
      q: "",
      profession: "",
      country: "",
      countBand: "",
      priceBand: "",
      authStatus: "all",
      page: 1,
    });
  });

  it("caps the query length and rejects overlong countries", () => {
    expect(
      parseSuggestionSearchParams({ q: "x".repeat(500), country: "y".repeat(65) }),
    ).toMatchObject({ q: "x".repeat(120), country: "" });
  });

  it("normalizes invalid pages to 1 and caps huge pages", () => {
    expect(parseSuggestionSearchParams({ page: "0" }).page).toBe(1);
    expect(parseSuggestionSearchParams({ page: "-4" }).page).toBe(1);
    expect(parseSuggestionSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseSuggestionSearchParams({ page: "2.9" }).page).toBe(2);
    expect(parseSuggestionSearchParams({ page: "99999" }).page).toBe(1000);
  });

  it("uses the first value when a param repeats", () => {
    expect(parseSuggestionSearchParams({ page: ["2", "5"] }).page).toBe(2);
  });

  it("serializes only non-default filters", () => {
    expect(
      suggestionFiltersToQuery({
        q: "",
        profession: "",
        country: "",
        countBand: "",
        priceBand: "",
        authStatus: "all",
        page: 1,
      }),
    ).toBe("");
    expect(
      suggestionFiltersToQuery({
        q: "crm",
        profession: "coach",
        country: "",
        countBand: "",
        priceBand: "under-5",
        authStatus: "identified",
        page: 2,
      }),
    ).toBe("?q=crm&profession=coach&priceBand=under-5&authStatus=identified&page=2");
  });
});

describe("suggestion UUID validation", () => {
  it("accepts canonical UUIDs", () => {
    expect(isValidUuid("00efbebd-d993-44d4-9d14-cf621f897342")).toBe(true);
    expect(isValidUuid("00EFBEBD-D993-44D4-9D14-CF621F897342")).toBe(true);
  });

  it("rejects malformed ids", () => {
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("00efbebd-d993-44d4-9d14")).toBe(false);
    expect(isValidUuid("{00efbebd-d993-44d4-9d14-cf621f897342}")).toBe(false);
    expect(isValidUuid("00efbebd-d993-44d4-9d14-cf621f89734z")).toBe(false);
    expect(isValidUuid("00efbebd_d993_44d4_9d14_cf621f897342")).toBe(false);
  });
});

describe("message excerpt", () => {
  it("returns null for missing or blank messages", () => {
    expect(excerptMessage(null)).toBeNull();
    expect(excerptMessage("   ")).toBeNull();
  });

  it("keeps short messages intact", () => {
    expect(excerptMessage(" hello ")).toBe("hello");
    expect(excerptMessage("x".repeat(140))).toBe("x".repeat(140));
  });

  it("truncates long messages at 140 chars", () => {
    expect(excerptMessage("y".repeat(200))).toBe("y".repeat(140));
  });
});

describe("quoted amount formatting", () => {
  it("returns null without a complete amount", () => {
    expect(formatQuotedAmount(null, "INR")).toBeNull();
    expect(formatQuotedAmount(50000, null)).toBeNull();
    expect(formatQuotedAmount(undefined, undefined)).toBeNull();
  });

  it("renders minor units as major without conversion", () => {
    expect(formatQuotedAmount(50000, "INR")).toBe("500 INR");
    expect(formatQuotedAmount(505, "USD")).toBe("5.05 USD");
    expect(formatQuotedAmount(0, "EUR")).toBe("0 EUR");
  });
});
