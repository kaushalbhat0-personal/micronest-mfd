import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared client avatar (RCCF-MFD-33 Phase 1).
 * Initials only, derived from the existing client name — no new data.
 * Decorative: the adjacent client name remains the semantic label.
 */
export function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const second = words.length > 1 ? words[1].charAt(0) : (words[0].charAt(1) ?? "");
  return `${first}${second}`.toUpperCase();
}

const TONES = [
  "bg-emerald-50 text-emerald-900",
  "bg-stone-200 text-stone-700",
  "bg-amber-100 text-amber-900",
] as const;

export function toneForName(name: string): (typeof TONES)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
  }
  return TONES[hash % TONES.length];
}

export function ClientAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        toneForName(name),
        className,
      )}
    >
      {initialsForName(name)}
    </span>
  );
}
