"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, TextArea, TextInput } from "@/components/ui/controls";
import { createClient } from "@/lib/supabase/client";
import {
  trackValidationFormStarted,
  trackValidationFormSubmitted,
  trackValidationPageViewed,
} from "@/lib/analytics";
import { useCountryOptions } from "@/features/wtp/countries";
import {
  CLIENT_COUNT_BANDS,
  CURRENCIES,
  CURRENT_SOLUTIONS,
  DESIRED_FEATURES,
  MAX_MESSAGE_LENGTH,
  MAX_OTHER_LENGTH,
  PRICE_BANDS,
  PROFESSIONS,
  parseExactAmountToMinor,
  validateWtpSubmission,
} from "@/features/wtp/validation";

/** Human labels for the research enums (form display only). */
const PROFESSION_LABELS: Record<string, string> = {
  consultant: "Consultant",
  coach: "Coach",
  "insurance-advisor": "Insurance advisor",
  "financial-professional": "Financial professional",
  "real-estate-professional": "Real estate professional",
  agency: "Agency",
  "education-training": "Education / training",
  "healthcare-wellness": "Healthcare / wellness",
  freelancer: "Freelancer",
  other: "Other",
};

const CLIENT_COUNT_LABELS: Record<string, string> = {
  "1-10": "1–10",
  "11-25": "11–25",
  "26-50": "26–50",
  "51-100": "51–100",
  "101-250": "101–250",
  "251-500": "251–500",
  "500+": "500+",
};

const SOLUTION_LABELS: Record<string, string> = {
  excel: "Excel / spreadsheets",
  "google-sheets": "Google Sheets",
  whatsapp: "WhatsApp",
  email: "Email",
  crm: "CRM",
  "industry-software": "Industry-specific software",
  notes: "Notes / documents",
  nothing: "Nothing specific",
  other: "Other",
};

const FEATURE_LABELS: Record<string, string> = {
  "client-organization": "Better client organization",
  "followup-reminders": "Follow-up reminders",
  "whatsapp-integration": "WhatsApp integration",
  "email-integration": "Email integration",
  "client-history": "Client history",
  "notes-tasks": "Notes and tasks",
  "custom-fields": "Custom client fields",
  "reports-analytics": "Reports / analytics",
  "team-members": "Team members",
  automations: "Automations",
  "ai-assistance": "AI assistance",
  "mobile-experience": "Mobile experience",
  "import-export": "Import / export",
  other: "Something else",
};

const PRICE_BAND_LABELS: Record<string, string> = {
  free: "Free",
  "under-5": "Under $5",
  "5-10": "$5–10",
  "10-25": "$10–25",
  "25-50": "$25–50",
  "50-plus": "$50+",
  "not-sure": "Not sure yet",
};

type Status = "idle" | "submitting" | "success" | "error";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Public research + willingness-to-pay form. All state stays in memory —
 * nothing is written to localStorage — and only aggregate, PII-free
 * events go to analytics. Ownership is derived server-side.
 */
export function PremiumForm({
  initialClientCountBand = "",
}: {
  /** Preselected approximate-client-count band (validated against the allow-list). */
  initialClientCountBand?: string;
}) {
  const countries = useCountryOptions();
  const [country, setCountry] = React.useState("");
  const [profession, setProfession] = React.useState("");
  const [professionOther, setProfessionOther] = React.useState("");
  const [clientCountBand, setClientCountBand] = React.useState(initialClientCountBand);
  const [currentSolution, setCurrentSolution] = React.useState<string[]>([]);
  const [currentSolutionOther, setCurrentSolutionOther] = React.useState("");
  const [desiredFeatures, setDesiredFeatures] = React.useState<string[]>([]);
  const [otherFeature, setOtherFeature] = React.useState("");
  const [priceBand, setPriceBand] = React.useState("");
  const [exactAmount, setExactAmount] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<Status>("idle");
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Signed-in email prefill + funnel entry event resolve client-side so
  // the server prerender stays locale-neutral. The form works fully
  // signed out.
  React.useEffect(() => {
    trackValidationPageViewed();
    try {
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(({ data }) => {
          const userEmail = data.user?.email;
          if (userEmail) setEmail((prev) => prev || userEmail);
        })
        .catch(() => {});
    } catch {
      // Best effort: the form works fully signed out.
    }
  }, []);

  const markStarted = React.useCallback(() => {
    trackValidationFormStarted();
  }, []);

  const needsExactAmount = priceBand !== "" && priceBand !== "free" && priceBand !== "not-sure";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    markStarted();
    setServerError(null);

    const amount =
      needsExactAmount && exactAmount.trim().length > 0
        ? parseExactAmountToMinor(exactAmount)
        : { minor: null as number | null, error: null as string | null };

    const payload = {
      email: email.trim().length === 0 ? null : email.trim(),
      country,
      profession,
      professionOther: professionOther.trim().length === 0 ? null : professionOther.trim(),
      clientCountBand,
      currentSolution,
      currentSolutionOther:
        currentSolutionOther.trim().length === 0 ? null : currentSolutionOther.trim(),
      desiredFeatures,
      otherFeature: otherFeature.trim().length === 0 ? null : otherFeature.trim(),
      quotedPriceMinor: amount.minor,
      quotedCurrency: amount.minor == null ? null : currency,
      priceBand,
      message: message.trim().length === 0 ? null : message.trim(),
    };

    const errors = validateWtpSubmission(payload);
    if (amount.error) {
      errors.push({ field: "quotedPriceMinor", message: amount.error });
    }
    if (errors.length > 0) {
      const mapped: Record<string, string> = {};
      for (const e of errors) {
        if (!mapped[e.field]) mapped[e.field] = e.message;
      }
      setFieldErrors(mapped);
      document
        .querySelector('[data-error-anchor="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErrors({});
    setStatus("submitting");
    try {
      const response = await fetch("/api/wtp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        interface ErrorDetail {
          errors?: Array<{ field: string; message: string }>;
        }
        let detail: ErrorDetail | null = null;
        try {
          detail = (await response.json()) as ErrorDetail;
        } catch {
          detail = null;
        }
        if (detail?.errors && detail.errors.length > 0) {
          const mapped: Record<string, string> = {};
          for (const e of detail.errors) {
            if (!mapped[e.field]) mapped[e.field] = e.message;
          }
          setFieldErrors(mapped);
        } else {
          setServerError("Something went wrong saving your feedback. Please try again.");
        }
        setStatus("error");
        return;
      }
      setStatus("success");
      trackValidationFormSubmitted();
    } catch {
      setServerError("Something went wrong saving your feedback. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <Card>
        <div className="flex flex-col gap-3" role="status">
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">
            Thanks — this helps us decide what MicroNest should become next.
          </h2>
          <p className="text-sm leading-relaxed text-stone-600">
            Your feedback is saved. We review requests regularly and prioritize improvements that
            are useful across the MicroNest community.
          </p>
          <div className="mt-1">
            <Link
              href="/workspace/today"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-900 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2"
            >
              Continue to MicroNest
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const checkboxClass =
    "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus-within:ring-2 focus-within:ring-emerald-900 has-checked:border-emerald-900 has-checked:bg-emerald-50";

  return (
    <form onSubmit={handleSubmit} noValidate onChange={markStarted} className="flex flex-col gap-6">
      {/* Section 1 — About you */}
      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">About you</h2>
          </div>
          <div data-error-anchor={fieldErrors.country ? "true" : undefined}>
            <Field id="wtp-country" label="Country" error={fieldErrors.country}>
              <Select
                id="wtp-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-invalid={Boolean(fieldErrors.country)}
                aria-describedby={fieldErrors.country ? "wtp-country-error" : undefined}
                required
              >
                <option value="">Select your country</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field id="wtp-profession" label="Profession / business type" error={fieldErrors.profession}>
            <Select
              id="wtp-profession"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              aria-invalid={Boolean(fieldErrors.profession)}
              aria-describedby={fieldErrors.profession ? "wtp-profession-error" : undefined}
              required
            >
              <option value="">Select what fits best</option>
              {PROFESSIONS.map((p) => (
                <option key={p} value={p}>
                  {PROFESSION_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          {profession === "other" && (
            <Field
              id="wtp-profession-other"
              label="Tell us about your work (optional)"
              error={fieldErrors.professionOther}
            >
              <TextInput
                id="wtp-profession-other"
                value={professionOther}
                onChange={(e) => setProfessionOther(e.target.value)}
                maxLength={120}
                placeholder="e.g. Wedding planner"
                autoComplete="organization-title"
              />
            </Field>
          )}
          <Field
            id="wtp-client-count"
            label="Approximate client count"
            error={fieldErrors.clientCountBand}
          >
            <Select
              id="wtp-client-count"
              value={clientCountBand}
              onChange={(e) => setClientCountBand(e.target.value)}
              aria-invalid={Boolean(fieldErrors.clientCountBand)}
              aria-describedby={fieldErrors.clientCountBand ? "wtp-client-count-error" : undefined}
              required
            >
              <option value="">Select a range</option>
              {CLIENT_COUNT_BANDS.map((b) => (
                <option key={b} value={b}>
                  {CLIENT_COUNT_LABELS[b]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* Section 2 — Current workflow */}
      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Your current workflow</h2>
            <p className="mt-0.5 text-sm text-stone-600">
              What do you currently use to manage clients? Choose all that apply.
            </p>
          </div>
          <fieldset>
            <legend className="sr-only">Current tools</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CURRENT_SOLUTIONS.map((s) => (
                <label key={s} className={checkboxClass}>
                  <input
                    type="checkbox"
                    checked={currentSolution.includes(s)}
                    onChange={() => setCurrentSolution((v) => toggle(v, s))}
                    className="h-4 w-4 shrink-0 accent-emerald-900"
                  />
                  {SOLUTION_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
          {fieldErrors.currentSolution && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {fieldErrors.currentSolution}
            </p>
          )}
          {currentSolution.includes("other") && (
            <Field
              id="wtp-solution-other"
              label="Other tool (optional)"
              error={fieldErrors.currentSolutionOther}
            >
              <TextInput
                id="wtp-solution-other"
                value={currentSolutionOther}
                onChange={(e) => setCurrentSolutionOther(e.target.value)}
                maxLength={MAX_OTHER_LENGTH}
                placeholder="e.g. Paper diary"
              />
            </Field>
          )}
        </div>
      </Card>

      {/* Section 3 — What would make MicroNest more useful */}
      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              What would make MicroNest more useful?
            </h2>
            <p className="mt-0.5 text-sm text-stone-600">
              Choose all that apply. We review requests regularly and prioritize improvements that
              are useful across the MicroNest community.
            </p>
          </div>
          <fieldset>
            <legend className="sr-only">Desired features</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DESIRED_FEATURES.map((f) => (
                <label key={f} className={checkboxClass}>
                  <input
                    type="checkbox"
                    checked={desiredFeatures.includes(f)}
                    onChange={() => setDesiredFeatures((v) => toggle(v, f))}
                    className="h-4 w-4 shrink-0 accent-emerald-900"
                  />
                  {FEATURE_LABELS[f]}
                </label>
              ))}
            </div>
          </fieldset>
          {fieldErrors.desiredFeatures && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {fieldErrors.desiredFeatures}
            </p>
          )}
          <Field
            id="wtp-other-feature"
            label="What's the one feature that would make MicroNest significantly more useful to you? (optional)"
            error={fieldErrors.otherFeature}
          >
            <TextArea
              id="wtp-other-feature"
              value={otherFeature}
              onChange={(e) => setOtherFeature(e.target.value)}
              maxLength={MAX_OTHER_LENGTH}
              placeholder="e.g. A reminder every Friday for clients I haven't spoken to"
            />
          </Field>
        </div>
      </Card>

      {/* Section 4 — Willingness to pay */}
      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              What would MicroNest realistically be worth to you?
            </h2>
            <p className="mt-0.5 text-sm text-stone-600">
              If MicroNest became an essential part of your client workflow, what would you
              realistically expect to pay each month?
            </p>
          </div>
          <fieldset>
            <legend className="sr-only">Monthly price band</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRICE_BANDS.map((b) => (
                <label key={b} className={checkboxClass}>
                  <input
                    type="radio"
                    name="wtp-price-band"
                    checked={priceBand === b}
                    onChange={() => setPriceBand(b)}
                    className="h-4 w-4 shrink-0 accent-emerald-900"
                  />
                  {PRICE_BAND_LABELS[b]}
                </label>
              ))}
            </div>
          </fieldset>
          {fieldErrors.priceBand && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {fieldErrors.priceBand}
            </p>
          )}
          {needsExactAmount && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                id="wtp-exact-amount"
                label="Exact monthly amount (optional)"
                error={fieldErrors.quotedPriceMinor}
                hint="Stored exactly as you enter it — never converted."
              >
                <TextInput
                  id="wtp-exact-amount"
                  value={exactAmount}
                  onChange={(e) => setExactAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 25 or 25.50"
                  autoComplete="off"
                />
              </Field>
              <Field id="wtp-currency" label="Currency" error={fieldErrors.quotedCurrency}>
                <Select
                  id="wtp-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
      </Card>

      {/* Section 5 — Contact + anything else */}
      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Stay in touch</h2>
            <p className="mt-0.5 text-sm text-stone-600">
              Optional — only if you&apos;d like us to follow up on your feedback.
            </p>
          </div>
          <Field
            id="wtp-email"
            label="Email (optional)"
            error={fieldErrors.email}
            hint="Never passwords, bank details, or ID numbers."
          >
            <TextInput
              id="wtp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field
            id="wtp-message"
            label="Anything else you want us to know? (optional)"
            error={fieldErrors.message}
          >
            <TextArea
              id="wtp-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Your workflow, your clients, your priorities…"
            />
          </Field>
        </div>
      </Card>

      {serverError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {serverError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={status === "submitting"} className="px-6">
          {status === "submitting" ? "Sharing…" : "Share my feedback"}
        </Button>
        <p className="text-xs text-stone-500">
          MicroNest is free while we&apos;re validating the product.
        </p>
      </div>
    </form>
  );
}
