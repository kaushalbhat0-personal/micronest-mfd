import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-800">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-stone-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (hasError: boolean) =>
  cn(
    "min-h-[44px] w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-900",
    "placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
    hasError ? "border-red-500" : "border-stone-300",
  );

export function TextInput({
  id,
  error,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; error?: string }) {
  return (
    <input
      id={id}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(inputClass(Boolean(error)), className)}
      {...rest}
    />
  );
}

export function TextArea({
  id,
  error,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; error?: string }) {
  return (
    <textarea
      id={id}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(inputClass(Boolean(error)), "min-h-[88px] resize-y")}
      {...rest}
    />
  );
}

export function Select({
  id,
  error,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { id: string; error?: string }) {
  return (
    <select id={id} className={inputClass(Boolean(error))} {...rest}>
      {children}
    </select>
  );
}
