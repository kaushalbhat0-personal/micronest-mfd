import { describe, expect, it } from "vitest";
import { detectSensitiveInput } from "@/lib/sensitive";
import { validateMessageInput } from "@/features/message-studio/validation";

describe("validateMessageInput", () => {
  it("requires client name and documents for document requests", () => {
    const result = validateMessageInput("document-request", { clientName: "", documents: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.clientName).toBeTruthy();
    expect(result.errors.documents).toBeTruthy();
  });

  it("accepts a complete document request", () => {
    const result = validateMessageInput("document-request", {
      clientName: "Sharma ji",
      documents: "KYC form",
      dueDate: "30 Oct",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects non-numeric SIP amounts", () => {
    const result = validateMessageInput("sip-confirmation", {
      clientName: "Sharma ji",
      sipAmount: "five thousand",
      sipDate: "5th",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.sipAmount).toBeTruthy();
  });

  it("accepts formatted SIP amounts", () => {
    const result = validateMessageInput("sip-confirmation", {
      clientName: "Sharma ji",
      sipAmount: "₹5,000",
      sipDate: "5th",
    });
    expect(result.ok).toBe(true);
  });

  it("requires meeting date for review invites and action for KYC reminders", () => {
    expect(validateMessageInput("review-invite", { clientName: "A" }).ok).toBe(false);
    expect(
      validateMessageInput("kyc-reminder", { clientName: "A", action: "Update nominee" }).ok,
    ).toBe(true);
  });

  it("blocks PAN-like content anywhere", () => {
    const result = validateMessageInput("document-request", {
      clientName: "Sharma ji",
      documents: "PAN ABCDE1234F copy",
    });
    expect(result.ok).toBe(false);
    expect(result.sensitive.length).toBeGreaterThan(0);
  });

  it("blocks OTP/password keywords", () => {
    const result = validateMessageInput("kyc-reminder", {
      clientName: "Sharma ji",
      action: "Share your OTP to verify",
    });
    expect(result.ok).toBe(false);
  });
});

describe("detectSensitiveInput", () => {
  it("returns null for ordinary text", () => {
    expect(detectSensitiveInput("documents", "KYC form, cancelled cheque")).toBeNull();
  });

  it("detects 12-digit numbers", () => {
    expect(detectSensitiveInput("action", "Aadhaar 1234 5678 9012")).not.toBeNull();
  });

  it("still flags a bare contiguous 12-digit Aadhaar without a +", () => {
    expect(detectSensitiveInput("action", "my id is 123456789012")).not.toBeNull();
  });

  it("still flags PAN and OTP/password keywords", () => {
    expect(detectSensitiveInput("note", "PAN ABCDE1234F")).not.toBeNull();
    expect(detectSensitiveInput("note", "share the 123456789012 OTP")).not.toBeNull();
  });

  it("does not misflag an international phone number in a note", () => {
    // 12-digit international phone-like sequences with a "+" are not Aadhaar.
    expect(detectSensitiveInput("note", "+44 7911 123456")).toBeNull();
    expect(detectSensitiveInput("note", "+91 98765 43210")).toBeNull();
    expect(detectSensitiveInput("note", "+447911123456")).toBeNull();
    expect(detectSensitiveInput("note", "call me on +61 412 345 678")).toBeNull();
  });
});
