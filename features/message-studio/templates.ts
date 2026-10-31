export type MessagePurpose =
  | "check-in"
  | "thank-you"
  | "document-request"
  | "sip-confirmation"
  | "review-invite"
  | "kyc-reminder";

export type MessageLanguage = "en" | "hinglish";
export type MessageTone = "professional" | "friendly";

/** Every editable text field in the studio. Optional inputs are empty strings. */
export interface MessageFields {
  clientName: string;
  /** Document Request */
  documents: string;
  /** Optional date/deadline (free text, e.g. "30 Oct") */
  dueDate: string;
  /** SIP Confirmation */
  sipAmount: string;
  sipDate: string;
  /** Review Meeting Invitation */
  meetingDate: string;
  meetingTime: string;
  /** KYC / Service Reminder */
  action: string;
}

export type MessageField = keyof MessageFields;

export const EMPTY_FIELDS: MessageFields = {
  clientName: "",
  documents: "",
  dueDate: "",
  sipAmount: "",
  sipDate: "",
  meetingDate: "",
  meetingTime: "",
  action: "",
};

export interface TemplateOptions {
  language: MessageLanguage;
  tone: MessageTone;
  /** Optional ARN placeholder (never a real ARN by default) */
  arn: string;
  includeDisclosure: boolean;
}

export interface TemplateDef {
  id: MessagePurpose;
  label: string;
  shortDescription: string;
  requiredFields: MessageField[];
  build: (fields: MessageFields, opts: TemplateOptions) => string;
}

export const RISK_DISCLOSURE =
  "Mutual fund investments are subject to market risks. Please read all scheme related documents carefully.";

function greeting(name: string, language: MessageLanguage, friendly: boolean): string {
  const clean = name.trim();
  if (language === "hinglish") {
    return `Namaste ${clean} ji,`;
  }
  return friendly ? `Hello ${clean},` : `Dear ${clean},`;
}

function closing(language: MessageLanguage, friendly: boolean): string {
  if (language === "hinglish") {
    return friendly ? "Dhanyavaad!" : "Dhanyavaad.";
  }
  return friendly ? "Thank you!" : "Thank you.";
}

function footer(arn: string, includeDisclosure: boolean): string {
  const lines: string[] = [];
  if (arn.trim().length > 0) {
    lines.push(`ARN: ${arn.trim()}`);
  }
  if (includeDisclosure) {
    lines.push(RISK_DISCLOSURE);
  }
  return lines.length > 0 ? `\n\n${lines.join("\n")}` : "";
}

function buildDocumentRequest(fields: MessageFields, opts: TemplateOptions): string {
  const friendly = opts.tone === "friendly";
  const docs = fields.documents.trim();
  const due = fields.dueDate.trim();
  const head = greeting(fields.clientName, opts.language, friendly);
  let body: string;
  if (opts.language === "hinglish") {
    body = friendly
      ? `Aapse request hai ki ye documents share kar dein: ${docs}.`
      : `Kripya nimnlikhit documents pradaan karein: ${docs}.`;
    if (due) body += ` Sambhav ho to ${due} tak bhej dein.`;
    body += ` Koi dikkat ho to please batayein, hum madad kar denge.`;
  } else {
    body = friendly
      ? `Could you please share the following: ${docs}?`
      : `Kindly provide the following documents: ${docs}.`;
    if (due) body += friendly ? ` If possible, by ${due}.` : ` Please share them by ${due}.`;
    body += friendly
      ? ` Let me know if you need any help with this.`
      : ` Please let me know if you need any assistance.`;
  }
  return `${head}\n\n${body}\n\n${closing(opts.language, friendly)}${footer(opts.arn, opts.includeDisclosure)}`;
}

function buildSipConfirmation(fields: MessageFields, opts: TemplateOptions): string {
  const friendly = opts.tone === "friendly";
  const amount = fields.sipAmount.trim();
  const date = fields.sipDate.trim();
  const head = greeting(fields.clientName, opts.language, friendly);
  let body: string;
  if (opts.language === "hinglish") {
    body =
      `Ye message aapke SIP ki confirmation ke liye hai: ` +
      `SIP amount ${amount}, date ${date}. ` +
      `Kripya apne bank account mein paryaapt balance rakhein.`;
    if (friendly) body += ` Kuch bhi poochna ho to please batayein.`;
  } else {
    body =
      `This is to confirm your SIP details: ` +
      `amount ${amount}, scheduled date ${date}. ` +
      `Please ensure sufficient balance is maintained in your bank account.`;
    if (friendly) body += ` Do let me know if you have any questions.`;
  }
  return `${head}\n\n${body}\n\n${closing(opts.language, friendly)}${footer(opts.arn, opts.includeDisclosure)}`;
}

function buildReviewInvite(fields: MessageFields, opts: TemplateOptions): string {
  const friendly = opts.tone === "friendly";
  const date = fields.meetingDate.trim();
  const time = fields.meetingTime.trim();
  const when = time ? `${date} at ${time}` : date;
  const head = greeting(fields.clientName, opts.language, friendly);
  let body: string;
  if (opts.language === "hinglish") {
    body =
      `Kya hum aapke investments ka review ${when} ko kar sakte hain? ` +
      `Ye meeting lagbhag 20-30 minute ki hogi.`;
    body += friendly
      ? ` Aapke liye jo samay suvidhajanak ho, please bata dein.`
      : ` Kripya apni suvidha anusaar samay ki pushti karein.`;
  } else {
    body = `I would like to invite you for a review of your investments on ${when}. The meeting will take approximately 20-30 minutes.`;
    body += friendly
      ? ` Please let me know what time suits you best.`
      : ` Kindly confirm a time convenient for you.`;
  }
  return `${head}\n\n${body}\n\n${closing(opts.language, friendly)}${footer(opts.arn, opts.includeDisclosure)}`;
}

function buildKycReminder(fields: MessageFields, opts: TemplateOptions): string {
  const friendly = opts.tone === "friendly";
  const action = fields.action.trim();
  const due = fields.dueDate.trim();
  const head = greeting(fields.clientName, opts.language, friendly);
  let body: string;
  if (opts.language === "hinglish") {
    body = `Yaad dilana tha ki ye kaam pending hai: ${action}.`;
    if (due) body += ` Kripya ${due} tak poora kar dein.`;
    body += friendly
      ? ` Zaroorat ho to hum step-by-step madad kar denge.`
      : ` Sahayata ke liye kripya sampark karein.`;
  } else {
    body = `This is a gentle reminder that the following is pending: ${action}.`;
    if (due)
      body += friendly
        ? ` It would help to complete it by ${due}.`
        : ` Kindly complete it by ${due}.`;
    body += friendly
      ? ` I am happy to help you with each step.`
      : ` Please contact me if you need assistance.`;
  }
  return `${head}\n\n${body}\n\n${closing(opts.language, friendly)}${footer(opts.arn, opts.includeDisclosure)}`;
}

/**
 * Generic check-in (Phase 2): a short, warm nudge with no product content.
 * Works for consultants, agents, coaches, advisors, and service businesses.
 */
function buildCheckIn(fields: MessageFields, opts: TemplateOptions): string {
  const friendly = opts.tone === "friendly";
  const head = greeting(fields.clientName, opts.language, friendly);
  let body: string;
  if (opts.language === "hinglish") {
    body = friendly
      ? "Bas ye check karne ke liye message kiya tha ki sab theek chal raha hai."
      : "Ye message keval ye jaanne ke liye hai ki sab kuch theek chal raha hai.";
    body += friendly
      ? " Kuch bhi chahiye ho to please batayein."
      : " Koi sahayata chahiye ho to kripya batayein.";
  } else {
    body = friendly
      ? "Just checking in to see how things are going on your end."
      : "I am writing to check that everything is going well on your end.";
    body += friendly
      ? " Let me know if there is anything I can help with."
      : " Please let me know if I can be of any assistance.";
  }
  return `${head}\n\n${body}\n\n${closing(opts.language, friendly)}${footer(opts.arn, opts.includeDisclosure)}`;
}

/**
 * Generic thank-you (Phase 2): a short note of appreciation with no
 * product content. Fits any relationship business.
 */
function buildThankYou(fields: MessageFields, opts: TemplateOptions): string {
  const friendly = opts.tone === "friendly";
  const head = greeting(fields.clientName, opts.language, friendly);
  let body: string;
  if (opts.language === "hinglish") {
    body = friendly
      ? "Aapke bharose ke liye dil se dhanyavaad."
      : "Aapke vishvaas ke liye hardik dhanyavaad.";
    body += friendly
      ? " Aage bhi hum aapki seva mein hazir rahenge."
      : " Bhavishya mein bhi aapki seva ka avsar milega, iski aasha karte hain.";
  } else {
    body = friendly
      ? "Thank you so much for your trust — it really means a lot."
      : "Thank you for your trust and for choosing to work with me.";
    body += friendly
      ? " I look forward to continuing to support you."
      : " I look forward to continuing to be of service.";
  }
  return `${head}\n\n${body}\n\n${closing(opts.language, friendly)}${footer(opts.arn, opts.includeDisclosure)}`;
}

/**
 * Single source of truth for every message purpose.
 * To add a purpose: add one entry here (+ validation needs no change,
 * it reads `requiredFields`), then expose it in the UI purpose list.
 */
export const TEMPLATES: Record<MessagePurpose, TemplateDef> = {
  "check-in": {
    id: "check-in",
    label: "Check-in",
    shortDescription: "Say hello and ask how things are going.",
    requiredFields: ["clientName"],
    build: buildCheckIn,
  },
  "thank-you": {
    id: "thank-you",
    label: "Thank You",
    shortDescription: "Thank a client for their trust.",
    requiredFields: ["clientName"],
    build: buildThankYou,
  },
  "document-request": {
    id: "document-request",
    label: "Document Request",
    shortDescription: "Ask a client for pending documents.",
    requiredFields: ["clientName", "documents"],
    build: buildDocumentRequest,
  },
  "sip-confirmation": {
    id: "sip-confirmation",
    label: "SIP Confirmation",
    shortDescription: "Confirm SIP details with a client.",
    requiredFields: ["clientName", "sipAmount", "sipDate"],
    build: buildSipConfirmation,
  },
  "review-invite": {
    id: "review-invite",
    label: "Review Meeting Invitation",
    shortDescription: "Invite a client for a portfolio review.",
    requiredFields: ["clientName", "meetingDate"],
    build: buildReviewInvite,
  },
  "kyc-reminder": {
    id: "kyc-reminder",
    label: "KYC / Service Reminder",
    shortDescription: "Remind a client about a pending action.",
    requiredFields: ["clientName", "action"],
    build: buildKycReminder,
  },
};

/** Display order of purposes in the UI. Generic-first; MFD purposes intact. */
export const TEMPLATE_ORDER: MessagePurpose[] = [
  "check-in",
  "thank-you",
  "document-request",
  "sip-confirmation",
  "review-invite",
  "kyc-reminder",
];

export function isMessagePurpose(value: unknown): value is MessagePurpose {
  return typeof value === "string" && value in TEMPLATES;
}

export function buildMessage(
  purpose: MessagePurpose,
  fields: MessageFields,
  opts: TemplateOptions,
): string {
  return TEMPLATES[purpose].build(fields, opts);
}
