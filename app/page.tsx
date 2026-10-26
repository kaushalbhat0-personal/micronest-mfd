import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  MessageIcon,
  PhoneIcon,
  UsersIcon,
} from "@/components/ui/icons";

const WORKFLOW = [
  { icon: <CalendarIcon />, title: "Today", hint: "Who needs you" },
  { icon: <UsersIcon />, title: "Client", hint: "Open the relationship" },
  { icon: <CheckIcon />, title: "Why", hint: "The reason to contact" },
  { icon: <PhoneIcon />, title: "Action", hint: "Call, WhatsApp, Message" },
  { icon: <MessageIcon />, title: "Follow-up", hint: "Never lose the thread" },
];

/**
 * Public entry page (RCCF-MFD-18 Phase A, redesigned RCCF-MFD-38).
 *
 * The workspace is the product; Message Studio is the public companion.
 * Client Radar and Follow-up Workspace are no longer presented as
 * standalone products — they live on as capabilities inside the workspace.
 */
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="home-heading">
        <p className="eyebrow">Relationship workspace</p>
        <h1
          id="home-heading"
          className="max-w-xl text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl"
        >
          Stay in touch with the right clients at the right time.
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          Know who to contact, why to contact them, and what to do next. Open your workspace, see
          who needs your attention, and work alongside your existing financial software — nothing to
          replace, nothing to learn.
        </p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Link href="/workspace/today" className={cn(buttonClasses("primary"), "px-5 sm:flex-1")}>
            Sign in to your workspace
          </Link>
          <Link href="/login" className={cn(buttonClasses("secondary"), "px-5 sm:flex-1")}>
            What is the workspace?
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-stone-600">
          The Relationship Workspace requires sign-in — it is your persistent workspace, available
          on your laptop and phone.
        </p>
      </section>

      <section aria-label="How it works">
        <Card>
          <div className="flex flex-col gap-3">
            <h2 className="eyebrow">How it works</h2>
            <ol className="flex flex-col gap-1">
              {WORKFLOW.map((step, i) => (
                <li key={step.title} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
                  >
                    {step.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-stone-900">
                      <span className="tnum mr-1.5 text-xs font-medium text-stone-400">
                        {i + 1}
                      </span>
                      {step.title}
                    </span>
                    <span className="text-xs text-stone-500">{step.hint}</span>
                  </span>
                  {i < WORKFLOW.length - 1 && (
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 rotate-90 text-stone-300"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </section>

      <Card>
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
            >
              <MessageIcon className="h-4 w-4" />
            </span>
            Message Studio
          </h2>
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

      <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-600 shadow-sm">
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
