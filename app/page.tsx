import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { SignalBadge } from "@/components/ui/signal-badge";
import { cn } from "@/lib/utils";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MessageIcon,
  PhoneIcon,
  SendIcon,
  SunIcon,
  TargetIcon,
  UsersIcon,
} from "@/components/ui/icons";

export const metadata = {
  title: "MicroNest — From first conversation to long-term client relationship",
  description:
    "Keep your client book organized, prepare the right message before you reach out, know who needs attention, and never lose track of the next follow-up.",
};

function SignedOutCtas({
  secondary = "#workflow" as "#workflow" | "/tools/message-studio",
}: {
  secondary?: "#workflow" | "/tools/message-studio";
}) {
  return (
    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
      <Link href="/login" className={cn(buttonClasses("primary"), "px-5 sm:flex-1")}>
        Get started
        <ArrowRightIcon aria-hidden="true" className="ml-2 h-4 w-4" />
      </Link>
      <Link href={secondary} className={cn(buttonClasses("secondary"), "px-5 sm:flex-1")}>
        {secondary === "#workflow" ? "See how it works" : "Try Message Studio"}
      </Link>
    </div>
  );
}

/**
 * Session-aware CTAs stream behind Suspense so the marketing shell
 * prerenders (cacheComponents). Signed-in visitors get Open workspace;
 * everyone else gets Get started / Sign in. Failures read as signed out.
 */
async function PrimaryCtas({
  secondary = "#workflow" as "#workflow" | "/tools/message-studio",
}: {
  secondary?: "#workflow" | "/tools/message-studio";
}) {
  let signedIn = false;
  try {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    }
  } catch {
    signedIn = false;
  }

  if (signedIn) {
    return (
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <Link href="/workspace/today" className={cn(buttonClasses("primary"), "px-5 sm:flex-1")}>
          Open workspace
          <ArrowRightIcon aria-hidden="true" className="ml-2 h-4 w-4" />
        </Link>
        <Link href={secondary} className={cn(buttonClasses("secondary"), "px-5 sm:flex-1")}>
          {secondary === "#workflow" ? "See how it works" : "Try Message Studio"}
        </Link>
      </div>
    );
  }
  return <SignedOutCtas secondary={secondary} />;
}

/**
 * Static Client Book preview: identities, investment context, attention
 * signals, follow-up indicators, and a direct action. Clearly illustrative
 * presentation data — never workspace data, never a customer claim.
 */
function BookPreview() {
  return (
    <section aria-label="Product preview: the Client Book">
      <Card padding="compact" className="lg:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="eyebrow flex items-center gap-1.5">
                <UsersIcon aria-hidden="true" className="h-3.5 w-3.5" />
                Client Book · Example preview
              </p>
              <p className="text-xl font-semibold tracking-tight text-stone-900 lg:text-2xl">
                Everyone you look after, in one place
              </p>
              <p className="tnum text-sm text-stone-600">
                <strong className="font-semibold text-stone-900">3</strong> need your attention this
                week.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Rajesh Sharma" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Rajesh Sharma</span>
                <span className="truncate text-xs text-stone-600">
                  SIP · Last contact 62 days ago
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <SignalBadge tone="amber">Reconnect</SignalBadge>
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                  <CalendarIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  Follow-up due
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Priya Mehta" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Priya Mehta</span>
                <span className="truncate text-xs text-stone-600">
                  Lumpsum · Last contact 12 days ago
                </span>
              </span>
              <SignalBadge tone="emerald">Recent</SignalBadge>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Amit Shah" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Amit Shah</span>
                <span className="truncate text-xs text-stone-600">
                  Insurance · New client this month
                </span>
              </span>
              <SignalBadge tone="emerald">New</SignalBadge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 text-sm font-medium text-white">
              <PhoneIcon aria-hidden="true" className="h-4 w-4" />
              Call
            </div>
            <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-900 bg-white px-4 text-sm font-medium text-emerald-900">
              <MessageIcon aria-hidden="true" className="h-4 w-4" />
              WhatsApp
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

/**
 * Static product preview of the Today workspace: attention count, client
 * cards with signals, call/WhatsApp actions, and follow-up context.
 * Clearly demo presentation data — never workspace data.
 */
function TodayPreview() {
  return (
    <section aria-label="Product preview: the Today workspace">
      <Card padding="compact" className="lg:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="eyebrow flex items-center gap-1.5">
                <SunIcon aria-hidden="true" className="h-3.5 w-3.5" />
                Today · Example preview
              </p>
              <p className="text-xl font-semibold tracking-tight text-stone-900 lg:text-2xl">
                Good morning
              </p>
              <p className="tnum text-sm text-stone-600">
                <strong className="font-semibold text-stone-900">4</strong> people need you today.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              <ClockIcon aria-hidden="true" className="h-3.5 w-3.5" />2 due today
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Rajesh Sharma" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Rajesh Sharma</span>
                <span className="truncate text-xs text-stone-600">
                  SIP · Reconnect — 62 days silent
                </span>
              </span>
              <SignalBadge tone="amber">Reconnect</SignalBadge>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Priya Mehta" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Priya Mehta</span>
                <span className="truncate text-xs text-stone-600">Follow-up due today</span>
              </span>
              <SignalBadge tone="amber">Due today</SignalBadge>
            </div>
            <p className="flex items-center gap-1.5 px-1 text-xs text-stone-600">
              <CalendarIcon aria-hidden="true" className="h-3.5 w-3.5" />+ 1 follow-up due tomorrow
              · + 1 new client to welcome
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 text-sm font-medium text-white">
              <PhoneIcon aria-hidden="true" className="h-4 w-4" />
              Call
            </div>
            <div className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-900 bg-white px-4 text-sm font-medium text-emerald-900">
              <MessageIcon aria-hidden="true" className="h-4 w-4" />
              WhatsApp
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

const LIFECYCLE = [
  {
    icon: <MessageIcon />,
    step: "01",
    title: "Reach out",
    heading: "Start the conversation",
    hint: "Prepare professional, personalized messages before you reach out — then copy or send them through WhatsApp.",
    proofs: ["Templates", "English / Hinglish", "Copy", "WhatsApp"],
  },
  {
    icon: <UsersIcon />,
    step: "02",
    title: "Organize",
    heading: "Keep your entire client book in one place",
    hint: "Move beyond scattered Excel sheets and notes. Keep the client information you actually need in one searchable workspace — and bring your existing list with you.",
    proofs: ["Client Book", "Search", "Add", "Import"],
  },
  {
    icon: <TargetIcon />,
    step: "03",
    title: "Understand",
    heading: "Know who needs your attention",
    hint: "See recent investors, reconnect opportunities, and new clients — with a clear reason for why someone needs attention.",
    proofs: ["Signals", "Why contact?", "Call", "WhatsApp"],
  },
  {
    icon: <CheckIcon />,
    step: "04",
    title: "Follow through",
    heading: "Never lose the next step",
    hint: "After the conversation, keep the next follow-up visible so important client relationships don't disappear into your notes.",
    proofs: ["Follow-ups", "Due dates", "Done", "Upcoming"],
  },
];

/**
 * Public marketing homepage (RCCF-MFD-47). The relationship-workspace
 * story: promise → problem → lifecycle → Client Book → before/after →
 * Today proof → trust → CTA. Session-aware CTAs only; no workspace data
 * is ever rendered here.
 */
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 sm:gap-12 lg:gap-16">
      <section
        className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12"
        aria-labelledby="home-heading"
      >
        <div className="flex max-w-xl flex-col gap-4 lg:gap-5">
          <p className="eyebrow">For mutual fund distributors</p>
          <h1
            id="home-heading"
            className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl lg:leading-[1.05]"
          >
            From first conversation to long-term client relationship.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-stone-600 lg:text-lg">
            One simple workspace to{" "}
            <strong className="font-semibold text-stone-900">
              prepare client messages, organize your entire client book,
            </strong>{" "}
            know who needs attention, and stay on top of every follow-up.
          </p>
          <Suspense fallback={<SignedOutCtas />}>
            <PrimaryCtas />
          </Suspense>
          <p className="text-xs leading-relaxed text-stone-600">
            Works alongside your existing financial software — nothing to migrate.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <BookPreview />
          <ol
            aria-label="The relationship workflow"
            className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-stone-700"
          >
            {["Reach out", "Organize", "Understand", "Follow through"].map((step, i, all) => (
              <li key={step} className="flex items-center gap-1.5">
                <span className="rounded-full bg-stone-100 px-2.5 py-1">{step}</span>
                {i < all.length - 1 && (
                  <ArrowRightIcon aria-hidden="true" className="h-3.5 w-3.5 text-stone-500" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="problem-heading">
        <div className="flex flex-col gap-3">
          <h2 id="problem-heading" className="eyebrow">
            The problem
          </h2>
          <p className="max-w-2xl text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl">
            Your client relationships shouldn&apos;t live in five places.
          </p>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {[
              "Excel client list",
              "WhatsApp conversations",
              "Phone contacts",
              "Notebook and notes",
              "Separate reminders",
            ].map((place) => (
              <li
                key={place}
                className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600 shadow-sm"
              >
                {place}
              </li>
            ))}
          </ul>
          <p className="max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base">
            <strong className="font-semibold text-stone-900">
              MicroNest brings the relationship layer together.
            </strong>{" "}
            Your existing financial software remains your system of record — MicroNest helps you
            manage the relationship around it.
          </p>
        </div>
      </section>

      <section aria-labelledby="workflow-heading" id="workflow" className="scroll-mt-24">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">How it works</p>
          <h2
            id="workflow-heading"
            className="max-w-2xl text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl"
          >
            One workflow. From first message to follow-up.
          </h2>
          <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:gap-4">
            {LIFECYCLE.map((stage, i) => (
              <li key={stage.title} className="relative">
                {i < LIFECYCLE.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-8 -right-2 hidden text-stone-300 lg:block"
                  >
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                )}
                <Card padding="compact" className="h-full lg:p-5">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
                    >
                      {stage.icon}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-semibold text-stone-900">
                        <span className="tnum mr-1.5 text-xs font-medium text-stone-500">
                          {stage.step}
                        </span>
                        {stage.title}
                      </span>
                      <h3 className="text-sm font-medium text-stone-900">{stage.heading}</h3>
                      <span className="text-xs leading-relaxed text-stone-500">{stage.hint}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {stage.proofs.map((proof) => (
                          <span
                            key={proof}
                            className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-700"
                          >
                            {proof}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="book-heading">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="flex max-w-xl flex-col gap-3">
            <p className="eyebrow">The center of your workspace</p>
            <h2
              id="book-heading"
              className="text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl"
            >
              Your client book. Not another spreadsheet.
            </h2>
            <p className="text-sm leading-relaxed text-stone-600 sm:text-base">
              Search your clients, see what matters, understand who needs attention, and act
              directly from the same place. Bring your existing client list with you — then spend
              less time maintaining lists and more time building client relationships.
            </p>
            <ul className="flex flex-col gap-2 text-sm text-stone-600">
              <li className="flex items-center gap-2">
                <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                Search, identity, investment type, and last contact
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                Attention signals and follow-up indicators
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                Call and WhatsApp from the client record
              </li>
            </ul>
          </div>
          <BookPreview />
        </div>
      </section>

      <section aria-labelledby="before-after-heading">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Before and after acquisition</p>
          <h2
            id="before-after-heading"
            className="max-w-2xl text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl"
          >
            Start the conversation. Then build the relationship.
          </h2>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:gap-4">
            <Card className="lg:p-6">
              <div className="flex flex-col gap-3">
                <p className="eyebrow">Before the relationship starts</p>
                <p className="text-xl font-semibold tracking-tight text-stone-900">
                  Say the right thing.
                </p>
                <p className="text-sm leading-relaxed text-stone-600">
                  Use Message Studio to prepare clear, professional communication before you reach
                  out.
                </p>
                <ul className="flex flex-col gap-2 text-sm text-stone-600">
                  <li className="flex items-center gap-2">
                    <MessageIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                    Ready-to-use templates
                  </li>
                  <li className="flex items-center gap-2">
                    <MessageIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                    English / Hinglish · Professional / Friendly
                  </li>
                  <li className="flex items-center gap-2">
                    <SendIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                    Copy or WhatsApp handoff
                  </li>
                </ul>
                <Link
                  href="/tools/message-studio"
                  className="inline-flex min-h-[44px] items-center font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                >
                  Explore Messages
                  <ArrowRightIcon aria-hidden="true" className="ml-1.5 h-4 w-4" />
                </Link>
              </div>
            </Card>
            <Card className="lg:p-6">
              <div className="flex flex-col gap-3">
                <p className="eyebrow">After the relationship starts</p>
                <p className="text-xl font-semibold tracking-tight text-stone-900">
                  Know what happens next.
                </p>
                <p className="text-sm leading-relaxed text-stone-600">
                  Keep the client organized, understand why they need attention, and stay on top of
                  follow-ups.
                </p>
                <ul className="flex flex-col gap-2 text-sm text-stone-600">
                  <li className="flex items-center gap-2">
                    <UsersIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                    Client Book
                  </li>
                  <li className="flex items-center gap-2">
                    <TargetIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                    Attention signals
                  </li>
                  <li className="flex items-center gap-2">
                    <PhoneIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-900" />
                    Call / WhatsApp
                  </li>
                  <li className="flex items-center gap-2">
                    <CalendarIcon
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-emerald-900"
                    />
                    Follow-ups
                  </li>
                </ul>
                <Link
                  href="#workflow"
                  className="inline-flex min-h-[44px] items-center font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                >
                  See the client workflow
                  <ArrowRightIcon aria-hidden="true" className="ml-1.5 h-4 w-4" />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section aria-labelledby="today-proof-heading">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="flex max-w-xl flex-col gap-3">
            <p className="eyebrow">Daily execution</p>
            <h2
              id="today-proof-heading"
              className="text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl"
            >
              When today starts, know where to focus.
            </h2>
            <p className="text-sm leading-relaxed text-stone-600 sm:text-base">
              MicroNest turns your client book into a practical daily queue — so you can see who
              needs attention and what needs to happen next. Know who to call today, know why, and
              know what to say.
            </p>
          </div>
          <TodayPreview />
        </div>
      </section>

      <section aria-labelledby="trust-heading">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 id="trust-heading" className="eyebrow text-emerald-900">
            Works alongside the software you already use
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-emerald-900 sm:text-base">
            MicroNest doesn&apos;t try to replace your financial software. It gives you a simple
            relationship layer around your client book — communication, attention, and follow-ups.
            Your software stays the system of record.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm text-emerald-900 sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              Private to your signed-in account
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              Import files are processed on your device
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              Sensitive-data screening built in
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              No PAN, Aadhaar, bank, OTP or password details needed
            </li>
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="cta-heading"
        className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2
          id="cta-heading"
          className="max-w-xl text-2xl font-semibold tracking-tight text-stone-900"
        >
          Keep the relationship moving.
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          From the first message to the next follow-up, keep your client relationships organized in
          one place.
        </p>
        <div className="mt-1 max-w-xl">
          <Suspense fallback={<SignedOutCtas secondary="/tools/message-studio" />}>
            <PrimaryCtas secondary="/tools/message-studio" />
          </Suspense>
        </div>
      </section>

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
