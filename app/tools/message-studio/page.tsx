import type { Metadata } from "next";
import Link from "next/link";
import { MessageStudioLoader } from "@/features/message-studio/components/message-studio-loader";

export const metadata: Metadata = {
  title: "Message Studio — MicroNest MFD Microtools",
  description:
    "Create professional, ready-to-send client messages in seconds. No login, no database, nothing stored.",
};

// The form reads browser-local prefs (mode/purpose/tone) on first render,
// which the server cannot know. It loads client-only (see
// MessageStudioLoader) to avoid a server/client hydration mismatch for
// returning visitors. Page shell and metadata here stay server-rendered.
export default function MessageStudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← Home
        </Link>
      </nav>
      <section className="flex flex-col gap-1.5">
        <p className="eyebrow">Communication</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Message Studio
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Choose a purpose, enter 2–3 details, generate, copy — done. Then paste into WhatsApp or
          email yourself. Or switch to Custom Message and write your own.
        </p>
      </section>
      <MessageStudioLoader />
    </div>
  );
}
