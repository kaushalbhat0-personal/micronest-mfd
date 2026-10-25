import { describe, expect, it } from "vitest";
import {
  EMPTY_FIELDS,
  TEMPLATE_ORDER,
  TEMPLATES,
  buildMessage,
  type MessageFields,
  type TemplateOptions,
} from "@/features/message-studio/templates";

const FIELDS: MessageFields = {
  ...EMPTY_FIELDS,
  clientName: "Sharma ji",
  documents: "KYC form, cancelled cheque",
  dueDate: "30 Oct",
  sipAmount: "5000",
  sipDate: "5th of every month",
  meetingDate: "2 Nov",
  meetingTime: "11:30 AM",
  action: "Complete your KYC revalidation",
};

const EN_PRO: TemplateOptions = {
  language: "en",
  tone: "professional",
  arn: "",
  includeDisclosure: false,
};

describe("template registry", () => {
  it("covers every purpose in display order with required fields", () => {
    expect(TEMPLATE_ORDER).toHaveLength(4);
    for (const id of TEMPLATE_ORDER) {
      expect(TEMPLATES[id].id).toBe(id);
      expect(TEMPLATES[id].label.length).toBeGreaterThan(0);
      expect(TEMPLATES[id].requiredFields).toContain("clientName");
    }
  });
});

describe("buildMessage", () => {
  it("builds a document request in English (professional)", () => {
    const msg = buildMessage("document-request", FIELDS, EN_PRO);
    expect(msg).toContain("Dear Sharma ji,");
    expect(msg).toContain("KYC form, cancelled cheque");
    expect(msg).toContain("30 Oct");
  });

  it("builds a document request in Hinglish (friendly)", () => {
    const msg = buildMessage("document-request", FIELDS, {
      ...EN_PRO,
      language: "hinglish",
      tone: "friendly",
    });
    expect(msg).toContain("Namaste");
    expect(msg).toContain("Sharma ji");
    expect(msg).toContain("KYC form, cancelled cheque");
  });

  it("builds an SIP confirmation with amount, date and disclosure", () => {
    const msg = buildMessage("sip-confirmation", FIELDS, { ...EN_PRO, includeDisclosure: true });
    expect(msg).toContain("5000");
    expect(msg).toContain("5th of every month");
    expect(msg).toContain("Mutual fund investments are subject to market risks");
  });

  it("builds a review invite with date and time", () => {
    const msg = buildMessage("review-invite", FIELDS, {
      language: "en",
      tone: "friendly",
      arn: "",
      includeDisclosure: false,
    });
    expect(msg).toContain("2 Nov");
    expect(msg).toContain("11:30 AM");
    expect(msg).toContain("Hello Sharma ji,");
  });

  it("builds a KYC reminder with the action", () => {
    const msg = buildMessage("kyc-reminder", FIELDS, { ...EN_PRO, language: "hinglish" });
    expect(msg).toContain("Complete your KYC revalidation");
    expect(msg).toContain("Namaste");
  });

  it("appends ARN when provided", () => {
    const msg = buildMessage("document-request", FIELDS, { ...EN_PRO, arn: "ARN-123456" });
    expect(msg).toContain("ARN: ARN-123456");
  });

  it("is deterministic for identical inputs", () => {
    expect(buildMessage("document-request", FIELDS, EN_PRO)).toBe(
      buildMessage("document-request", FIELDS, EN_PRO),
    );
  });
});
