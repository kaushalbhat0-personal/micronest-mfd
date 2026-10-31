import { describe, expect, it } from "vitest";
import {
  EMPTY_FIELDS,
  TEMPLATE_ORDER,
  TEMPLATES,
  buildMessage,
  type TemplateOptions,
} from "@/features/message-studio/templates";
import { validateMessageInput } from "@/features/message-studio/validation";

const EN_PRO: TemplateOptions = {
  language: "en",
  tone: "professional",
  arn: "",
  includeDisclosure: false,
};

/**
 * Phase 2.3: two generic purposes join the studio; every existing
 * MFD/Hinglish purpose keeps working exactly as before.
 */
describe("generic message purposes", () => {
  it("lists Check-in and Thank You alongside the MFD purposes", () => {
    expect(TEMPLATE_ORDER).toContain("check-in");
    expect(TEMPLATE_ORDER).toContain("thank-you");
    expect(TEMPLATES["check-in"].label).toBe("Check-in");
    expect(TEMPLATES["thank-you"].label).toBe("Thank You");
    for (const id of TEMPLATE_ORDER) {
      expect(TEMPLATES[id].id).toBe(id);
      expect(TEMPLATES[id].requiredFields).toContain("clientName");
    }
  });

  it("keeps every existing MFD purpose in the registry", () => {
    expect(TEMPLATES["sip-confirmation"].label).toBe("SIP Confirmation");
    expect(TEMPLATES["kyc-reminder"].label).toBe("KYC / Service Reminder");
    expect(TEMPLATES["document-request"].label).toBe("Document Request");
    expect(TEMPLATES["review-invite"].label).toBe("Review Meeting Invitation");
  });

  it("builds a check-in with no product content", () => {
    const msg = buildMessage("check-in", { ...EMPTY_FIELDS, clientName: "Alex" }, EN_PRO);
    expect(msg).toContain("Alex");
    expect(msg).not.toContain("SIP");
    expect(msg).not.toContain("KYC");
  });

  it("builds a thank-you in Hinglish", () => {
    const msg = buildMessage(
      "thank-you",
      { ...EMPTY_FIELDS, clientName: "Alex" },
      { ...EN_PRO, language: "hinglish", tone: "friendly" },
    );
    expect(msg).toContain("Namaste");
    expect(msg).toContain("Alex");
  });

  it("validates generic purposes on the client name only", () => {
    expect(validateMessageInput("check-in", { clientName: "Alex" }).ok).toBe(true);
    expect(validateMessageInput("thank-you", { clientName: "  " }).ok).toBe(false);
    expect(validateMessageInput("thank-you", { clientName: "  " }).errors.clientName).toContain(
      "required",
    );
  });

  it("still builds the existing SIP confirmation with disclosure", () => {
    const msg = buildMessage(
      "sip-confirmation",
      { ...EMPTY_FIELDS, clientName: "Meera", sipAmount: "5000", sipDate: "5th" },
      { ...EN_PRO, includeDisclosure: true },
    );
    expect(msg).toContain("5000");
    expect(msg).toContain("Mutual fund investments are subject to market risks");
  });
});
