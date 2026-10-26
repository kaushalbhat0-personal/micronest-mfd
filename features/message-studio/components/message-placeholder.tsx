"use client";

import { Card } from "@/components/ui/card";
import { MessageIcon } from "@/components/ui/icons";

/**
 * Intentional pre-generation state for Message Studio (RCCF-MFD-30).
 * Rendered instead of the preview until the user generates or prepares
 * a message. Visual only — no behavior.
 */
export function MessagePlaceholder() {
  return (
    <Card aria-hidden="true">
      <div className="today-enter flex flex-col items-center gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-stone-400">
          <MessageIcon />
        </span>
        <p className="text-sm text-stone-500">Your message will appear here…</p>
      </div>
    </Card>
  );
}
