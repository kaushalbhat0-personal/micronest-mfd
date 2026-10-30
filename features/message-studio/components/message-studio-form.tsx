"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, TextInput } from "@/components/ui/controls";
import { MessageIcon, SendIcon } from "@/components/ui/icons";
import { normalizePhone } from "@/lib/whatsapp";
import { scanMessage } from "../compliance";
import { clearPrefs, loadPrefs, savePrefs, type StudioMode } from "../prefs";
import {
  EMPTY_FIELDS,
  TEMPLATES,
  buildMessage,
  type MessageField,
  type MessageFields,
  type MessageLanguage,
  type MessagePurpose,
  type MessageTone,
} from "../templates";
import { validateMessageInput, type FieldErrors } from "../validation";
import { MessagePlaceholder } from "./message-placeholder";
import { MessagePreview } from "./message-preview";
import { ModeSelector } from "./mode-selector";
import { CustomMessageSection } from "./custom-message-section";
import { LanguageToneControls, PurposeFields, PurposeSelector } from "./purpose-fields";

export interface MessageStudioInitial {
  initialPurpose?: MessagePurpose;
  initialFields?: Partial<MessageFields>;
  initialPhone?: string;
}

export function MessageStudioForm({
  initialPurpose,
  initialFields,
  initialPhone,
}: MessageStudioInitial = {}) {
  // Prefs hold non-sensitive UI choices only (never client/message data).
  // Lazy initializer reads localStorage once; guarded for SSR. Note: the
  // server renders defaults while a returning browser may hold different
  // prefs — React reconciles this on hydration with no functional impact,
  // which is acceptable for prefs-only state (no user data involved).
  // Explicit handoff values (e.g. from Follow-up Workspace) win over prefs
  // on mount; afterwards the user owns the fields.
  const [initialPrefs] = React.useState(loadPrefs);
  const [mode, setMode] = React.useState<StudioMode>(initialPrefs.mode);
  const [purpose, setPurpose] = React.useState<MessagePurpose>(
    initialPurpose ?? initialPrefs.purpose,
  );
  const [language, setLanguage] = React.useState<MessageLanguage>(initialPrefs.language);
  const [tone, setTone] = React.useState<MessageTone>(initialPrefs.tone);
  const [arn, setArn] = React.useState(initialPrefs.arn);
  const [includeDisclosure, setIncludeDisclosure] = React.useState(initialPrefs.includeDisclosure);

  const [fields, setFields] = React.useState<MessageFields>({ ...EMPTY_FIELDS, ...initialFields });
  const [phone, setPhone] = React.useState(initialPhone ?? "");

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [sensitiveWarnings, setSensitiveWarnings] = React.useState<string[]>([]);
  const [generated, setGenerated] = React.useState<string | null>(null);

  // Persist prefs (never client/message data).
  React.useEffect(() => {
    savePrefs({ mode, purpose, language, tone, arn, includeDisclosure });
  }, [mode, purpose, language, tone, arn, includeDisclosure]);

  const set = (field: MessageField) => (value: string) =>
    setFields((prev) => ({ ...prev, [field]: value }));

  const guardIssues = React.useMemo(
    () => (generated ? scanMessage(generated).map((m) => m.label) : []),
    [generated],
  );
  const phoneCheck = normalizePhone(phone);

  function handleGenerate() {
    const result = validateMessageInput(purpose, fields);
    setErrors(result.errors);
    setSensitiveWarnings(result.sensitive.map((s) => s.reason));
    if (!result.ok) {
      setGenerated(null);
      return;
    }
    setGenerated(
      buildMessage(purpose, fields, {
        language,
        tone,
        arn,
        includeDisclosure: purpose === "sip-confirmation" ? true : includeDisclosure,
      }),
    );
  }

  function handleClear() {
    setFields(EMPTY_FIELDS);
    setPhone("");
    setErrors({});
    setSensitiveWarnings([]);
    setGenerated(null);
    clearPrefs();
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <Card className="lg:p-6">
        <ModeSelector
          value={mode}
          onChange={(m) => {
            setMode(m);
            setGenerated(null);
          }}
        />
      </Card>

      {mode === "custom" ? (
        <CustomMessageSection />
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6">
            <Card className="lg:p-6">
              <p className="eyebrow mb-4 flex items-center gap-1.5">
                <MessageIcon aria-hidden="true" className="h-3.5 w-3.5" />
                Message type
              </p>
              <div className="flex flex-col gap-4">
                <PurposeSelector
                  value={purpose}
                  onChange={(p) => {
                    setPurpose(p);
                    setGenerated(null);
                  }}
                />

                <LanguageToneControls
                  language={language}
                  tone={tone}
                  onLanguage={setLanguage}
                  onTone={setTone}
                />

                <p className="text-xs text-stone-500">
                  {TEMPLATES[purpose].shortDescription} Nothing you type here is saved on any
                  server.
                </p>

                <Field id="ms-clientName" label="Client name" error={errors.clientName}>
                  <TextInput
                    id="ms-clientName"
                    placeholder="e.g. Sharma ji"
                    value={fields.clientName}
                    onChange={(e) => set("clientName")(e.target.value)}
                    error={errors.clientName}
                    maxLength={60}
                    autoComplete="off"
                  />
                </Field>

                <PurposeFields purpose={purpose} fields={fields} set={set} errors={errors} />

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
                  <Alert variant="error" title="Remove sensitive details to continue">
                    <ul className="mt-1 list-disc pl-5">
                      {sensitiveWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </Alert>
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

            <div className="lg:sticky lg:top-20">
              {generated ? (
                <Card className="lg:p-6">
                  <p className="eyebrow mb-3 flex items-center gap-1.5">
                    <SendIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    Live preview
                  </p>
                  <MessagePreview
                    message={generated}
                    guardIssues={guardIssues}
                    phone={phone}
                    onPhoneChange={setPhone}
                    phoneError={
                      phoneCheck.ok ? null : (phoneCheck.error ?? "Check the mobile number.")
                    }
                  />
                </Card>
              ) : (
                <MessagePlaceholder />
              )}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-stone-600">
            Privacy: everything stays on this device. No login, no database, no tracking. Do not
            enter PAN, Aadhaar, bank, OTP or password details. Wording guardrails are basic and do
            not certify regulatory compliance — please verify final messages per your compliance
            requirements.
          </p>
        </>
      )}
    </div>
  );
}
