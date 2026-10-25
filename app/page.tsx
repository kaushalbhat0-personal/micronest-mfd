import { ToolCard } from "@/components/tool-card";

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          Small tools for daily MFD work
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          Microtools for Mutual Fund Distributor operations. Each tool does one job, opens fast on
          your phone, and works alongside your existing financial software — nothing to replace,
          nothing to learn.
        </p>
      </section>

      <section aria-label="Available tools" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ToolCard
          title="Message Studio"
          description="Create professional, ready-to-send client messages in seconds."
          href="/tools/message-studio"
          cta="Open Message Studio"
        />
        <ToolCard
          title="Follow-up Workspace"
          description="Turn your follow-up list into today's action queue."
          href="/tools/followups"
          cta="Open Workspace"
        />
        <ToolCard
          title="Document Checklist"
          description="Track which client documents are collected, verified and submitted."
          comingSoon
        />
        <ToolCard
          title="SIP Explainer"
          description="Simple SIP illustrations for review meetings. No advice, just numbers."
          comingSoon
        />
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-600">
        <h2 className="text-sm font-semibold text-stone-900">Built for trust</h2>
        <ul className="mt-2 list-disc pl-5">
          <li>No login or database for Message Studio — everything stays on your device.</li>
          <li>No PAN, Aadhaar, bank or OTP details needed — ever.</li>
          <li>Messages are deterministic templates, not AI generation.</li>
        </ul>
      </section>
    </div>
  );
}
