"use client";

import {
  TEMPLATES,
  TEMPLATE_ORDER,
  type MessageField,
  type MessageFields,
  type MessageLanguage,
  type MessageTone,
} from "../templates";
import type { FieldErrors } from "../validation";
import { Field, Select, TextArea, TextInput } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

interface PurposeSelectorProps {
  value: (typeof TEMPLATE_ORDER)[number];
  onChange: (purpose: (typeof TEMPLATE_ORDER)[number]) => void;
}

/**
 * Purpose picker built on native radio inputs (keyboard + screen-reader
 * friendly). The card look comes from peer-checked / peer-focus-visible
 * styles on the label content.
 */
export function PurposeSelector({ value, onChange }: PurposeSelectorProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-stone-800">Purpose</legend>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEMPLATE_ORDER.map((id) => (
          <label
            key={id}
            className={cn(
              "relative min-h-[44px] cursor-pointer rounded-lg border px-3 py-2",
              "has-checked:border-2 has-checked:border-emerald-900 has-checked:bg-emerald-50",
              "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-emerald-900",
              value === id
                ? "border-emerald-900 bg-emerald-50"
                : "border-stone-300 bg-white hover:bg-stone-50",
            )}
          >
            <input
              type="radio"
              name="ms-purpose"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              className={cn(
                "text-sm",
                value === id ? "font-medium text-stone-900" : "text-stone-700",
              )}
            >
              {TEMPLATES[id].label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface PurposeFieldsProps {
  purpose: (typeof TEMPLATE_ORDER)[number];
  fields: MessageFields;
  set: (field: MessageField) => (value: string) => void;
  errors: FieldErrors;
}

/** The 2–4 inputs each purpose needs. One branch per template. */
export function PurposeFields({ purpose, fields, set, errors }: PurposeFieldsProps) {
  switch (purpose) {
    case "document-request":
      return (
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
              value={fields.documents}
              onChange={(e) => set("documents")(e.target.value)}
              error={errors.documents}
              maxLength={300}
            />
          </Field>
          <Field id="ms-dueDate" label="Needed by (optional)">
            <TextInput
              id="ms-dueDate"
              placeholder="e.g. 30 Oct"
              value={fields.dueDate}
              onChange={(e) => set("dueDate")(e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
        </>
      );
    case "sip-confirmation":
      return (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="ms-sipAmount" label="SIP amount (₹)" error={errors.sipAmount}>
              <TextInput
                id="ms-sipAmount"
                inputMode="decimal"
                placeholder="e.g. 5000"
                value={fields.sipAmount}
                onChange={(e) => set("sipAmount")(e.target.value)}
                error={errors.sipAmount}
                maxLength={120}
                autoComplete="off"
              />
            </Field>
            <Field id="ms-sipDate" label="SIP date" error={errors.sipDate}>
              <TextInput
                id="ms-sipDate"
                placeholder="e.g. 5th of every month"
                value={fields.sipDate}
                onChange={(e) => set("sipDate")(e.target.value)}
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
      );
    case "review-invite":
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="ms-meetingDate" label="Proposed date" error={errors.meetingDate}>
            <TextInput
              id="ms-meetingDate"
              placeholder="e.g. 2 Nov"
              value={fields.meetingDate}
              onChange={(e) => set("meetingDate")(e.target.value)}
              error={errors.meetingDate}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
          <Field id="ms-meetingTime" label="Proposed time (optional)">
            <TextInput
              id="ms-meetingTime"
              placeholder="e.g. 11:30 AM"
              value={fields.meetingTime}
              onChange={(e) => set("meetingTime")(e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
        </div>
      );
    case "kyc-reminder":
      return (
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
              value={fields.action}
              onChange={(e) => set("action")(e.target.value)}
              error={errors.action}
              maxLength={300}
            />
          </Field>
          <Field id="ms-actionDue" label="Complete by (optional)">
            <TextInput
              id="ms-actionDue"
              placeholder="e.g. 30 Oct"
              value={fields.dueDate}
              onChange={(e) => set("dueDate")(e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
        </>
      );
  }
}

export function LanguageToneControls({
  language,
  tone,
  onLanguage,
  onTone,
}: {
  language: MessageLanguage;
  tone: MessageTone;
  onLanguage: (value: MessageLanguage) => void;
  onTone: (value: MessageTone) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id="ms-language" label="Language">
        <Select
          id="ms-language"
          value={language}
          onChange={(e) => onLanguage(e.target.value as MessageLanguage)}
        >
          <option value="en">English</option>
          <option value="hinglish">Hinglish</option>
        </Select>
      </Field>
      <Field id="ms-tone" label="Tone">
        <Select id="ms-tone" value={tone} onChange={(e) => onTone(e.target.value as MessageTone)}>
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
        </Select>
      </Field>
    </div>
  );
}
