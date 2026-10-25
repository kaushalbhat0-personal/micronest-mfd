import { describe, expect, it } from "vitest";
import { buildMessage, type MessageContext } from "@/lib/message-templates";

const BASE: MessageContext = {
  clientName: "Sharma ji",
  documents: "KYC form, cancelled cheque",
  dueDate: "30 Oct",
  sipAmount: "5000",
  sipDate: "5th of every month",
  meetingDate: "2 Nov",
  meetingTime: "11:30 AM",
  action: "Complete your KYC revalidation",
};

describe("buildMessage", () => {
  it("builds a document request in English (professional)", () => {
    const msg = buildMessage("document-request", BASE, "en", "professional");
    expect(msg).toContain("Sharma ji");
    expect(msg).toContain("KYC form, cancelled cheque");
    expect(msg).toContain("30 Oct");
    expect(msg).toContain("Dear Sharma ji,");
  });

  it("builds a document request in Hinglish (friendly)", () => {
    const msg = buildMessage("document-request", BASE, "hinglish", "friendly");
    expect(msg).toContain("Namaste");
    expect(msg).toContain("Sharma ji");
    expect(msg).toContain("KYC form, cancelled cheque");
  });

  it("builds an SIP confirmation with amount and date", () => {
    const msg = buildMessage(
      "sip-confirmation",
      { ...BASE, includeDisclosure: true },
      "en",
      "professional",
    );
    expect(msg).toContain("5000");
    expect(msg).toContain("5th of every month");
    expect(msg).toContain("Mutual fund investments are subject to market risks");
  });

  it("builds a review invite with date and time", () => {
    const msg = buildMessage("review-invite", BASE, "en", "friendly");
    expect(msg).toContain("2 Nov");
    expect(msg).toContain("11:30 AM");
    expect(msg).toContain("Hello Sharma ji,");
  });

  it("builds a KYC reminder with the action", () => {
    const msg = buildMessage("kyc-reminder", BASE, "hinglish", "professional");
    expect(msg).toContain("Complete your KYC revalidation");
    expect(msg).toContain("Namaste");
  });

  it("appends ARN when provided", () => {
    const msg = buildMessage(
      "document-request",
      { ...BASE, arn: "ARN-123456" },
      "en",
      "professional",
    );
    expect(msg).toContain("ARN: ARN-123456");
  });

  it("is deterministic for identical inputs", () => {
    const a = buildMessage("document-request", BASE, "en", "professional");
    const b = buildMessage("document-request", BASE, "en", "professional");
    expect(a).toBe(b);
  });
});
