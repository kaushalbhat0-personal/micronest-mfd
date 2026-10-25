import {
  isMessagePurpose,
  type MessageLanguage,
  type MessagePurpose,
  type MessageTone,
} from "./templates";

const KEY = "mfd-ms-prefs-v1";

export type StudioMode = "templates" | "custom";

export interface StudioPrefs {
  mode: StudioMode;
  purpose: MessagePurpose;
  language: MessageLanguage;
  tone: MessageTone;
  arn: string;
  includeDisclosure: boolean;
}

export const DEFAULT_PREFS: StudioPrefs = {
  mode: "templates",
  purpose: "document-request",
  language: "en",
  tone: "professional",
  arn: "",
  includeDisclosure: false,
};

/**
 * Loads non-sensitive UI prefs only. Never stores client names,
 * phone numbers, message text, or financial data.
 * Resilient: malformed JSON, unknown values, and unavailable storage
 * all fall back to defaults so the tool always works.
 */
export function loadPrefs(): StudioPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<StudioPrefs>;
    return {
      mode: parsed.mode === "custom" ? "custom" : "templates",
      purpose: isMessagePurpose(parsed.purpose) ? parsed.purpose : DEFAULT_PREFS.purpose,
      language: parsed.language === "hinglish" ? "hinglish" : "en",
      tone: parsed.tone === "friendly" ? "friendly" : "professional",
      arn: typeof parsed.arn === "string" ? parsed.arn.slice(0, 40) : "",
      includeDisclosure: parsed.includeDisclosure === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: StudioPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private mode); the tool works without it.
  }
}

export function clearPrefs(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
