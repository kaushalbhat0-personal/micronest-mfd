"use client";

import * as React from "react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MessagePreviewProps {
  message: string;
  guardIssues: string[];
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError: string | null;
}

export function MessagePreview({
  message,
  guardIssues,
  phone,
  onPhoneChange,
  phoneError,
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

  return (
    <section aria-label="Generated message" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-stone-900">Preview</h2>

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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ms-phone" className="text-sm font-medium text-stone-800">
          WhatsApp number{" "}
          <span className="font-normal text-stone-500">(optional, never stored)</span>
        </label>
        <input
          id="ms-phone"
          inputMode="tel"
          autoComplete="off"
          placeholder="e.g. 98765 43210"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          aria-describedby={phoneError ? "ms-phone-error" : undefined}
          aria-invalid={Boolean(phoneError)}
          className="min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        />
        {phoneError && (
          <p id="ms-phone-error" role="alert" className="text-xs font-medium text-red-700">
            {phoneError}
          </p>
        )}
      </div>

      <div className="bg-app sticky bottom-0 flex flex-col gap-2 py-2 sm:flex-row">
        <Button onClick={handleCopy} disabled={blocked} className="sm:flex-1" aria-live="polite">
          {copied ? "Copied ✓" : "Copy message"}
        </Button>
        {waUrl ? (
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
        )}
      </div>
      {copyError && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {copyError}
        </p>
      )}
    </section>
  );
}
