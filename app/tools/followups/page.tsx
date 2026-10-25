import type { Metadata } from "next";
import Link from "next/link";
import { Workspace } from "@/features/followups/components/workspace";

export const metadata: Metadata = {
  title: "Follow-up Workspace — MicroNest MFD Microtools",
  description:
    "Turn your follow-up list into today's action queue. Upload a CSV, see who needs attention, message via WhatsApp. Nothing leaves your device.",
};

export default function FollowupsPage() {
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
          Follow-up Workspace
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Turn your follow-up list into today&apos;s action queue. Upload your CSV, see who needs
          attention, and reach them in one tap.
        </p>
      </section>
      <Workspace />
    </div>
  );
}
