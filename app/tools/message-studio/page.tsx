import type { Metadata } from "next";
import Link from "next/link";
import { MessageStudioForm } from "@/components/message-studio-form";

export const metadata: Metadata = {
  title: "Message Studio — MicroNest MFD Microtools",
  description:
    "Create professional, ready-to-send client messages in seconds. No login, no database, nothing stored.",
};

export default function MessageStudioPage() {
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← All tools
        </Link>
      </nav>
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
          Message Studio
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Choose a purpose, enter 2–3 details, generate, copy — done. Then paste into WhatsApp or
          email yourself.
        </p>
      </section>
      <MessageStudioForm />
    </div>
  );
}
