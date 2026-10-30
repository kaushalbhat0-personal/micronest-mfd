"use client";

import dynamic from "next/dynamic";
import { Card } from "@/components/ui/card";

// The form reads browser-local prefs (mode/purpose/tone) on first render,
// which the server cannot know. Loading it client-only avoids a
// server/client hydration mismatch for returning visitors.
const MessageStudioForm = dynamic(
  () =>
    import("@/features/message-studio/components/message-studio-form").then(
      (m) => m.MessageStudioForm,
    ),
  {
    ssr: false,
    loading: () => (
      <Card>
        <p aria-busy="true" aria-live="polite" className="text-sm text-stone-500">
          Loading Messages…
        </p>
      </Card>
    ),
  },
);

export function MessageStudioLoader() {
  return <MessageStudioForm />;
}
