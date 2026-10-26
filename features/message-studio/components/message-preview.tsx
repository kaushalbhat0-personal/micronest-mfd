"use client";

import * as React from "react";
import { normalizePhone, buildWhatsAppUrl } from "@/lib/whatsapp";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { PhoneField } from "@/components/ui/phone-field";
import { cn } from "@/lib/utils";

interface MessagePreviewProps {
  message: string;
  guardIssues: string[];
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError: string | null;
  /**
   * Override the built-in phone input. Pass `null` to hide it (e.g. when
   * the compose area already has its own phone field).
   */
  phoneField?: React.ReactNode;
  /**
   * When true, the WhatsApp action is hidden instead of shown disabled
   * unless a valid phone number is available.
   */
  hideWhatsAppWhenNoPhone?: boolean;
  /** Optional small note above the preview (e.g. recipient context). */
  headerNote?: string;
  /** Phone input id used for the built-in field. */
  phoneInputId?: string;
}

export function MessagePreview({
  message,
  guardIssues,
  phone,
  onPhoneChange,
  phoneError,
  phoneField,
  hideWhatsAppWhenNoPhone = false,
  headerNote,
  phoneInputId = "ms-phone",
}: MessagePreviewProps) {
  const [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState<string | null>(null);
  const blocked = guardIssues.length > 0;

  async function handleCopy() {
    setCopyError(null);
    try {
      if (navigator.clipboard && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(message);
      } else {
        // Fallback for browsers without async clipboard.
        const ta = document.createElement("textarea");
        ta.value = message;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("copy failed");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError("Copy failed in this browser. Please select the text manually.");
    }
  }

  const waUrl = blocked ? null : buildWhatsAppUrl(message, phone);
  // Custom mode hides the action when no phone is on hand; template mode
  // keeps the contact-picker link / disabled button as before.
  const showWhatsApp = !hideWhatsAppWhenNoPhone || normalizePhone(phone).digits !== undefined;

  return (
    <section aria-label="Generated message" className="today-enter flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-stone-900">Preview</h2>
      {headerNote && <p className="text-xs text-stone-500">{headerNote}</p>}

      {blocked && (
        <Alert variant="warning" title="Check wording before sending">
          <ul className="mt-1 list-disc pl-5">
            {guardIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Copying and WhatsApp handoff are paused until this wording is edited. This is a basic
            guardrail only, not a compliance certification.
          </p>
        </Alert>
      )}

      <output
        aria-live="polite"
        className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm leading-relaxed text-stone-900"
      >
        {message}
      </output>

      {phoneField === undefined ? (
        <PhoneField id={phoneInputId} value={phone} onChange={onPhoneChange} error={phoneError} />
      ) : (
        phoneField
      )}

      <div className="bg-app sticky bottom-0 flex flex-col gap-2 py-2 sm:flex-row">
        <Button onClick={handleCopy} disabled={blocked} className="sm:flex-1" aria-live="polite">
          {copied ? "Copied ✓" : "Copy message"}
        </Button>
        {showWhatsApp &&
          (waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses("secondary"), "sm:flex-1")}
            >
              Open WhatsApp
            </a>
          ) : (
            <Button
              variant="secondary"
              disabled
              className="sm:flex-1"
              title={blocked ? "Resolve wording warning first" : "Fix phone number"}
            >
              Open WhatsApp
            </Button>
          ))}
      </div>
      {copyError && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {copyError}
        </p>
      )}
    </section>
  );
}
