interface PhoneFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

/** Optional phone input shared by template and custom previews/forms. */
export function PhoneField({ id, value, onChange, error }: PhoneFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-800">
        WhatsApp number <span className="font-normal text-stone-500">(optional, never stored)</span>
      </label>
      <input
        id={id}
        inputMode="tel"
        autoComplete="off"
        placeholder="e.g. 98765 43210"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        className="min-h-[44px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
