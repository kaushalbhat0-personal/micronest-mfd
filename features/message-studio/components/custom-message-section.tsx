"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, TextArea, TextInput } from "@/components/ui/controls";
import { PhoneField } from "@/components/ui/phone-field";
import { normalizePhone } from "@/lib/whatsapp";
import { scanMessage } from "../compliance";
import { CUSTOM_MESSAGE_MAX_LENGTH, countChars, validateCustomMessage } from "../validation";
import { MessagePreview } from "./message-preview";

/**
 * Custom Message mode: the user writes free-form text in any language/script.
 * Content is opaque — never transformed, never persisted, never sent anywhere.
 * All state is local; unmounting (mode switch) or reload discards everything.
 */
export function CustomMessageSection() {
  const [recipient, setRecipient] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [text, setText] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [sensitiveWarnings, setSensitiveWarnings] = React.useState<string[]>([]);
  const [prepared, setPrepared] = React.useState<string | null>(null);

  const used = countChars(text);
  const overLimit = used > CUSTOM_MESSAGE_MAX_LENGTH;

  const guardIssues = React.useMemo(
    () => (prepared ? scanMessage(prepared).map((m) => m.label) : []),
    [prepared],
  );
  const phoneCheck = normalizePhone(phone);

  function handlePrepare() {
    const result = validateCustomMessage(text);
    setError(result.error);
    setSensitiveWarnings(result.sensitive.map((s) => s.reason));
    if (!result.ok) {
      setPrepared(null);
      return;
    }
    // Store the exact text — no trimming, no normalization, no transformation.
    setPrepared(text);
  }

  function handleClear() {
    setRecipient("");
    setPhone("");
    setText("");
    setError(null);
    setSensitiveWarnings([]);
    setPrepared(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col gap-4">
          <Field
            id="ms-recipient"
            label="Recipient name (optional)"
            hint="Shown above the preview for your reference only. Not added to the message."
          >
            <TextInput
              id="ms-recipient"
              placeholder="e.g. Rahul"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          </Field>

          <PhoneField
            id="ms-custom-phone"
            value={phone}
            onChange={(value) => setPhone(value)}
            error={phoneCheck.ok ? null : (phoneCheck.error ?? "Invalid phone number.")}
          />

          <Field id="ms-custom-text" label="Your message" error={error ?? undefined}>
            <TextArea
              id="ms-custom-text"
              placeholder="Type your message in any language…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={error ?? undefined}
              rows={6}
              aria-describedby="ms-custom-count"
            />
          </Field>
          <p
            id="ms-custom-count"
            aria-live="polite"
            className={overLimit ? "text-xs font-medium text-red-700" : "text-xs text-stone-500"}
          >
            {used} / {CUSTOM_MESSAGE_MAX_LENGTH} characters
          </p>

          {sensitiveWarnings.length > 0 && (
            <Alert variant="error" title="Remove sensitive details to continue">
              <ul className="mt-1 list-disc pl-5">
                {sensitiveWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handlePrepare} className="sm:flex-1">
              Prepare message
            </Button>
            <Button variant="secondary" onClick={handleClear} className="sm:flex-1">
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {prepared !== null && (
        <Card>
          <MessagePreview
            message={prepared}
            guardIssues={guardIssues}
            phone={phone}
            onPhoneChange={setPhone}
            phoneError={null}
            phoneField={null}
            phoneInputId="ms-custom-phone"
            hideWhatsAppWhenNoPhone
            headerNote={recipient.trim() ? `For: ${recipient.trim()}` : undefined}
          />
        </Card>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        Privacy: your message never leaves this device until you choose Copy or WhatsApp. Nothing is
        saved — reloading clears everything. Do not enter PAN, Aadhaar, bank, OTP or password
        details. The wording check is basic and does not certify regulatory compliance.
      </p>
    </div>
  );
}
