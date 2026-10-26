import Link from "next/link";
import { Card } from "@/components/ui/card";

/**
 * Public entry page (RCCF-MFD-18 Phase A).
 *
 * The workspace is the product; Message Studio is the public companion.
 * Client Radar and Follow-up Workspace are no longer presented as
 * standalone products — they live on as capabilities inside the workspace.
 */
export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          MFD Relationship Workspace
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          Know who to contact, why to contact them, and what to do next. Open your workspace, see
          who needs your attention, and work alongside your existing financial software — nothing to
          replace, nothing to learn.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/workspace/today"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-900 px-5 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2"
          >
            Sign in to your workspace
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-medium text-stone-800 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
          >
            What is the workspace?
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-stone-600">
          The Relationship Workspace requires sign-in — it is your persistent workspace, available
          on your laptop and phone.
        </p>
      </section>

      <Card>
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-stone-900">Message Studio</h2>
          <p className="text-sm leading-relaxed text-stone-600">
            Create professional, ready-to-send client messages in seconds. Available without an
            account — nothing is saved on any server.
          </p>
          <Link
            href="/tools/message-studio"
            className="inline-flex min-h-[44px] items-center font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
          >
            Open Message Studio →
          </Link>
        </div>
      </Card>

      <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-600">
        <h2 className="text-sm font-semibold text-stone-900">Built for trust</h2>
        <ul className="mt-2 list-disc pl-5">
          <li>Your workspace data is private to your signed-in account.</li>
          <li>Message Studio needs no login — everything stays on your device.</li>
          <li>No PAN, Aadhaar, bank, OTP or password details needed — ever.</li>
          <li>Messages are deterministic templates, not AI generation.</li>
        </ul>
      </section>
    </div>
  );
}
