import { describe, expect, it } from "vitest";
import { hasGuardIssue, scanMessage } from "@/features/message-studio/compliance";

describe("scanMessage", () => {
  it.each([
    "Your money will get guaranteed returns of 15%.",
    "This offers assured returns every year.",
    "A risk-free investment with great profit.",
    "We will double your money in 3 years.",
    "Guaranteed profit on this scheme.",
    "100% safe investment, no risk at all.",
    "Fixed returns of 12% per annum.",
  ])("flags unsafe wording: %s", (text) => {
    expect(hasGuardIssue(text)).toBe(true);
    expect(scanMessage(text).length).toBeGreaterThan(0);
  });

  it.each([
    "Could you please share your KYC form and cancelled cheque?",
    "This is to confirm your SIP of 5000 on the 5th of every month.",
    "Mutual fund investments are subject to market risks.",
    "I would like to invite you for a review of your investments.",
    "The fixed date for our meeting is 2 Nov.", // "fixed date" must not trip "fixed returns"
  ])("does not flag ordinary wording: %s", (text) => {
    expect(hasGuardIssue(text)).toBe(false);
  });
});
