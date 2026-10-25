"use client";

import * as React from "react";
import { scanMessage } from "@/lib/compliance";
import {
  MESSAGE_TEMPLATES,
  buildMessage,
  type MessageLanguage,
  type MessagePurpose,
  type MessageTone,
} from "@/lib/message-templates";
import { validateMessageInput, type FieldErrors } from "@/lib/message-validation";
import { clearPrefs, loadPrefs, savePrefs } from "@/lib/storage";
import { normalizePhone } from "@/lib/whatsapp";
import { MessagePreview } from "./message-preview";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field, Select, TextArea, TextInput } from "./ui/controls";

const PURPOSES: MessagePurpose[] = [
  "document-request",
  "sip-confirmation",
  "review-invite",
  "kyc-reminder",
];

export function MessageStudioForm() {
  // Prefs hold non-sensitive UI choices only (never client/message data).
  // Lazy initializer reads localStorage once; guarded for SSR.
  const [initialPrefs] = React.useState(loadPrefs);
  const [purpose, setPurpose] = React.useState<MessagePurpose>(initialPrefs.purpose);
  const [language, setLanguage] = React.useState<MessageLanguage>(initialPrefs.language);
  const [tone, setTone] = React.useState<MessageTone>(initialPrefs.tone);
  const [arn, setArn] = React.useState(initialPrefs.arn);
  const [includeDisclosure, setIncludeDisclosure] = React.useState(initialPrefs.includeDisclosure);

  const [clientName, setClientName] = React.useState("");
  const [documents, setDocuments] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [sipAmount, setSipAmount] = React.useState("");
  const [sipDate, setSipDate] = React.useState("");
  const [meetingDate, setMeetingDate] = React.useState("");
  const [meetingTime, setMeetingTime] = React.useState("");
  const [action, setAction] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [sensitiveWarnings, setSensitiveWarnings] = React.useState<string[]>([]);
  const [generated, setGenerated] = React.useState<string | null>(null);

  // Persist prefs (never client/message data).
  React.useEffect(() => {
    savePrefs({ purpose, language, tone, arn, includeDisclosure });
  }, [purpose, language, tone, arn, includeDisclosure]);

  const guardIssues = React.useMemo(
    () => (generated ? scanMessage(generated).map((m) => m.label) : []),
    [generated],
  );
  const phoneCheck = normalizePhone(phone);

  function handleGenerate() {
    const result = validateMessageInput(purpose, {
      clientName,
      documents,
      dueDate,
      sipAmount,
      sipDate,
      meetingDate,
      meetingTime,
      action,
    });
    setErrors(result.errors);
    setSensitiveWarnings(result.sensitive.map((s) => s.reason));
    if (!result.ok) {
      setGenerated(null);
      return;
    }
    const message = buildMessage(
      purpose,
      {
        clientName,
        documents,
        dueDate,
        sipAmount,
        sipDate,
        meetingDate,
        meetingTime,
        action,
        arn,
        includeDisclosure: purpose === "sip-confirmation" ? true : includeDisclosure,
      },
      language,
      tone,
    );
    setGenerated(message);
  }

  function handleClear() {
    setClientName("");
    setDocuments("");
    setDueDate("");
    setSipAmount("");
    setSipDate("");
    setMeetingDate("");
    setMeetingTime("");
    setAction("");
    setPhone("");
    setErrors({});
    setSensitiveWarnings([]);
    setGenerated(null);
    clearPrefs();
  }

  const activeMeta = MESSAGE_TEMPLATES.find((t) => t.id === purpose);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col gap-4">
          <Field id="ms-purpose" label="Purpose">
            <div
              role="radiogroup"
              aria-label="Message purpose"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {PURPOSES.map((p) => {
                const meta = MESSAGE_TEMPLATES.find((t) => t.id === p);
                const selected = purpose === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setPurpose(p);
                      setGenerated(null);
                    }}
                    className={
                      selected
                        ? "min-h-[44px] rounded-lg border-2 border-emerald-900 bg-emerald-50 px-3 py-2 text-left text-sm font-medium text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                        : "min-h-[44px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                    }
                  >
                    {meta?.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="ms-language" label="Language">
              <Select
                id="ms-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as MessageLanguage)}
              >
                <option value="en">English</option>
                <option value="hinglish">Hinglish</option>
              </Select>
            </Field>
            <Field id="ms-tone" label="Tone">
              <Select
                id="ms-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as MessageTone)}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
              </Select>
            </Field>
          </div>

          <p className="text-xs text-stone-500">
            {activeMeta?.shortDescription} Nothing you type here is saved on any server.
          </p>

          <Field id="ms-clientName" label="Client name" error={errors.clientName}>
            <TextInput
              id="ms-clientName"
              placeholder="e.g. Sharma ji"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              error={errors.clientName}
              maxLength={60}
              autoComplete="off"
            />
          </Field>

          {purpose === "document-request" && (
            <>
              <Field
                id="ms-documents"
                label="Required documents"
                error={errors.documents}
                hint="List only document names, e.g. PAN card copy, cancelled cheque."
              >
                <TextArea
                  id="ms-documents"
                  placeholder="e.g. KYC form, cancelled cheque"
                  value={documents}
                  onChange={(e) => setDocuments(e.target.value)}
                  error={errors.documents}
                  maxLength={300}
                />
              </Field>
              <Field id="ms-dueDate" label="Needed by (optional)">
                <TextInput
                  id="ms-dueDate"
                  placeholder="e.g. 30 Oct"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                />
              </Field>
            </>
          )}

          {purpose === "sip-confirmation" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="ms-sipAmount" label="SIP amount (₹)" error={errors.sipAmount}>
                  <TextInput
                    id="ms-sipAmount"
                    inputMode="decimal"
                    placeholder="e.g. 5000"
                    value={sipAmount}
                    onChange={(e) => setSipAmount(e.target.value)}
                    error={errors.sipAmount}
                    maxLength={120}
                    autoComplete="off"
                  />
                </Field>
                <Field id="ms-sipDate" label="SIP date" error={errors.sipDate}>
                  <TextInput
                    id="ms-sipDate"
                    placeholder="e.g. 5th of every month"
                    value={sipDate}
                    onChange={(e) => setSipDate(e.target.value)}
                    error={errors.sipDate}
                    maxLength={120}
                    autoComplete="off"
                  />
                </Field>
              </div>
              <p className="text-xs text-stone-500">
                Risk disclosure is always added to SIP confirmations.
              </p>
            </>
          )}

          {purpose === "review-invite" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="ms-meetingDate" label="Proposed date" error={errors.meetingDate}>
                <TextInput
                  id="ms-meetingDate"
                  placeholder="e.g. 2 Nov"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  error={errors.meetingDate}
                  maxLength={120}
                  autoComplete="off"
                />
              </Field>
              <Field id="ms-meetingTime" label="Proposed time (optional)">
                <TextInput
                  id="ms-meetingTime"
                  placeholder="e.g. 11:30 AM"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                />
              </Field>
            </div>
          )}

          {purpose === "kyc-reminder" && (
            <>
              <Field
                id="ms-action"
                label="Required action"
                error={errors.action}
                hint="Describe the action only — never ask for OTPs or passwords."
              >
                <TextArea
                  id="ms-action"
                  placeholder="e.g. Complete your KYC revalidation at the branch"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  error={errors.action}
                  maxLength={300}
                />
              </Field>
              <Field id="ms-actionDue" label="Complete by (optional)">
                <TextInput
                  id="ms-actionDue"
                  placeholder="e.g. 30 Oct"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                />
              </Field>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="ms-arn"
              label="ARN (optional)"
              hint="Stored only in this browser, never sent anywhere."
            >
              <TextInput
                id="ms-arn"
                placeholder="e.g. ARN-123456"
                value={arn}
                onChange={(e) => setArn(e.target.value)}
                maxLength={40}
                autoComplete="off"
              />
            </Field>
            {purpose !== "sip-confirmation" && (
              <div className="flex items-end pb-1">
                <label
                  htmlFor="ms-disclosure"
                  className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-stone-800"
                >
                  <input
                    id="ms-disclosure"
                    type="checkbox"
                    checked={includeDisclosure}
                    onChange={(e) => setIncludeDisclosure(e.target.checked)}
                    className="h-5 w-5 accent-emerald-900"
                  />
                  Add risk disclosure
                </label>
              </div>
            )}
          </div>

          {sensitiveWarnings.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            >
              <p className="font-semibold">Remove sensitive details to continue</p>
              <ul className="mt-1 list-disc pl-5">
                {sensitiveWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleGenerate} className="sm:flex-1">
              Generate message
            </Button>
            <Button variant="secondary" onClick={handleClear} className="sm:flex-1">
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {generated && (
        <Card>
          <MessagePreview
            message={generated}
            guardIssues={guardIssues}
            phone={phone}
            onPhoneChange={setPhone}
            phoneError={phoneCheck.ok ? null : (phoneCheck.error ?? "Invalid phone number.")}
          />
        </Card>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        Privacy: everything stays on this device. No login, no database, no tracking. Do not enter
        PAN, Aadhaar, bank, OTP or password details. Wording guardrails are basic and do not certify
        regulatory compliance — please verify final messages per your compliance requirements.
      </p>
    </div>
  );
}
