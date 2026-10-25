"use client";

import type { StudioMode } from "../prefs";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: StudioMode; label: string; hint: string }> = [
  { id: "templates", label: "Quick Templates", hint: "Fill 2–3 details" },
  { id: "custom", label: "Custom Message", hint: "Write your own" },
];

interface ModeSelectorProps {
  value: StudioMode;
  onChange: (mode: StudioMode) => void;
}

/** Top-level Templates/Custom switch. Native radios, same pattern as purposes. */
export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-stone-800">Mode</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2" role="presentation">
        {MODES.map((m) => (
          <label
            key={m.id}
            className={cn(
              "relative min-h-[44px] cursor-pointer rounded-lg border px-3 py-2",
              "has-checked:border-2 has-checked:border-emerald-900 has-checked:bg-emerald-50",
              "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-emerald-900",
              value === m.id
                ? "border-emerald-900 bg-emerald-50"
                : "border-stone-300 bg-white hover:bg-stone-50",
            )}
          >
            <input
              type="radio"
              name="ms-mode"
              value={m.id}
              checked={value === m.id}
              onChange={() => onChange(m.id)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span
              className={cn(
                "block text-sm",
                value === m.id ? "font-medium text-stone-900" : "text-stone-700",
              )}
            >
              {m.label}
            </span>
            <span className="block text-xs text-stone-500">{m.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
