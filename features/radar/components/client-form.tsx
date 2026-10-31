"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, TextArea, TextInput } from "@/components/ui/controls";
import { formatDisplayDate, todayLocalYMD } from "@/lib/dates";
import type { ClientInput } from "../repository";
import { INVESTMENT_TYPES, lumpsumAmountHint, lumpsumAmountLabel } from "../template";
import { sipAmountHint, sipAmountLabel } from "../template";
import type { InvestmentType } from "../types";
import { validateClientFields, fieldForClientError, type ClientFieldName } from "../validation";

export type ClientFormField = ClientFieldName;

export type ClientFormErrors = Partial<Record<ClientFormField, string>>;

export interface ClientFormInitial {
  name: string;
  phone: string;
  investmentType: InvestmentType;
  /** Optional monthly SIP figure as typed rupee text ("" when absent). */
  sipAmount: string;
  /** Optional recorded lumpsum figure as typed rupee text ("" when absent). */
  lumpsumAmount: string;
  /** YYYY-MM-DD or "" for empty. Native date inputs speak this format. */
  lastInvested: string;
  lastContacted: string;
  isNewClient: boolean;
  note: string;
}

export const EMPTY_CLIENT_FORM: ClientFormInitial = {
  name: "",
  phone: "",
  investmentType: "Other",
  sipAmount: "",
  lumpsumAmount: "",
  lastInvested: "",
  lastContacted: "",
  isNewClient: false,
  note: "",
};

/** Native date value (YYYY-MM-DD) → display string (DD/MM/YYYY) for validation. */
function toDisplayDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return formatDisplayDate(ymd);
}

function toClientInput(
  values: ClientFormInitial,
  todayYMD: string,
): {
  input: ClientInput | null;
  errors: ClientFormErrors;
  warnings: string[];
  formError: string | null;
} {
  const result = validateClientFields(
    {
      name: values.name,
      phone: values.phone,
      investmentType: values.investmentType,
      sipAmount: values.sipAmount,
      lumpsumAmount: values.lumpsumAmount,
      lastInvested: toDisplayDate(values.lastInvested),
      lastContacted: toDisplayDate(values.lastContacted),
      isNewClient: values.isNewClient,
      note: values.note,
    },
    todayYMD,
    "form",
  );
  if (!result.row) {
    const field = fieldForClientError(result.error);
    return {
      input: null,
      errors: field ? { [field]: result.error } : {},
      warnings: [],
      formError: field ? null : (result.error ?? "Please fix the highlighted field."),
    };
  }
  return {
    input: {
      name: result.row.name,
      phone: result.row.phone,
      investmentType: result.row.investmentType,
      sipAmountPaise: result.row.sipAmountPaise,
      lumpsumAmountPaise: result.row.lumpsumAmountPaise,
      lastInvested: values.lastInvested === "" ? null : values.lastInvested,
      lastContacted: values.lastContacted === "" ? null : values.lastContacted,
      isNewClient: result.row.isNewClient,
      note: result.row.note,
    },
    errors: {},
    warnings: result.warnings,
    formError: null,
  };
}

interface ClientFormProps {
  /** Defaults for Add; the stored record's values for Edit. */
  initial?: ClientFormInitial;
  submitLabel: string;
  saving?: boolean;
  /** Persistence errors from the caller (typed repository messages). */
  externalError?: string | null;
  onSubmit: (input: ClientInput) => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Add/Edit form for the eight relationship fields. Validation is delegated
 * to the shared domain validator; this component only maps the verdict onto
 * fields. No ids, no user data, no timestamps are editable here.
 */
export function ClientForm({
  initial = EMPTY_CLIENT_FORM,
  submitLabel,
  saving = false,
  externalError = null,
  onSubmit,
  onCancel,
}: ClientFormProps) {
  const [values, setValues] = React.useState<ClientFormInitial>(initial);
  const [errors, setErrors] = React.useState<ClientFormErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  const set =
    <K extends keyof ClientFormInitial>(key: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const next =
        event.target.type === "checkbox" && event.target instanceof HTMLInputElement
          ? (event.target.checked as ClientFormInitial[K])
          : (event.target.value as ClientFormInitial[K]);
      setValues((prev) => ({ ...prev, [key]: next }));
    };

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const today = todayLocalYMD();
    const checked = toClientInput(values, today);
    setErrors(checked.errors);
    setWarnings(checked.warnings);
    setFormError(checked.formError);
    if (checked.input) void onSubmit(checked.input);
  }

  const phoneWarning = warnings.find((w) => w.startsWith("Phone number")) ?? null;
  const typeWarning = warnings.find((w) => w.startsWith("Investment type")) ?? null;

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field id="client-name" label="Client name" error={errors.name}>
          <TextInput
            id="client-name"
            placeholder="e.g. Rajesh Sharma"
            value={values.name}
            onChange={set("name")}
            error={errors.name}
            maxLength={60}
            autoComplete="off"
          />
        </Field>

        <Field
          id="client-mobile"
          label="Mobile number (optional)"
          error={errors.phone}
          hint={phoneWarning ?? "10-digit mobile number, with or without +91."}
        >
          <TextInput
            id="client-mobile"
            placeholder="e.g. 9876543210"
            value={values.phone}
            onChange={set("phone")}
            error={errors.phone}
            autoComplete="off"
            inputMode="tel"
          />
        </Field>

        <Field id="client-investment" label="What they have" hint={typeWarning ?? undefined}>
          <Select
            id="client-investment"
            value={values.investmentType}
            onChange={set("investmentType")}
          >
            {INVESTMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="client-sip-amount"
          label={sipAmountLabel()}
          error={errors.sipAmount}
          hint={sipAmountHint()}
        >
          <TextInput
            id="client-sip-amount"
            placeholder="e.g. 10000"
            value={values.sipAmount}
            onChange={set("sipAmount")}
            error={errors.sipAmount}
            autoComplete="off"
            inputMode="decimal"
          />
        </Field>

        <Field
          id="client-lumpsum-amount"
          label={lumpsumAmountLabel()}
          error={errors.lumpsumAmount}
          hint={lumpsumAmountHint()}
        >
          <TextInput
            id="client-lumpsum-amount"
            placeholder="e.g. 200000"
            value={values.lumpsumAmount}
            onChange={set("lumpsumAmount")}
            error={errors.lumpsumAmount}
            autoComplete="off"
            inputMode="decimal"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="client-invested" label="Last invested (optional)" error={errors.lastInvested}>
            <TextInput
              id="client-invested"
              type="date"
              value={values.lastInvested}
              onChange={set("lastInvested")}
              error={errors.lastInvested}
              max={todayLocalYMD()}
            />
          </Field>
          <Field
            id="client-contacted"
            label="Last spoke (optional)"
            error={errors.lastContacted}
          >
            <TextInput
              id="client-contacted"
              type="date"
              value={values.lastContacted}
              onChange={set("lastContacted")}
              error={errors.lastContacted}
              max={todayLocalYMD()}
            />
          </Field>
        </div>

        <div className="flex items-center">
          <label
            htmlFor="client-new"
            className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-stone-800"
          >
            <input
              id="client-new"
              type="checkbox"
              checked={values.isNewClient}
              onChange={set("isNewClient")}
              className="h-5 w-5 accent-emerald-900"
            />
            New client
          </label>
        </div>

        <Field
          id="client-note"
          label="Notes (optional)"
          error={errors.note}
          hint="Max 200 characters."
        >
          <TextArea
            id="client-note"
            placeholder="e.g. Prefers evening calls"
            value={values.note}
            onChange={set("note")}
            error={errors.note}
            maxLength={200}
          />
        </Field>

        {formError && (
          <Alert variant="error" title="Please check this entry">
            <p className="mt-1 text-xs">{formError}</p>
          </Alert>
        )}

        {externalError && (
          <Alert variant="error" title="Couldn't save">
            <p className="mt-1 text-xs">{externalError}</p>
          </Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={saving} className="sm:flex-1">
            {saving ? "Saving…" : submitLabel}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
              className="sm:flex-1"
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
