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
  CheckIcon,
  FileTextIcon,
  MessageIcon,
  PhoneIcon,
  SendIcon,
  SunIcon,
  UsersIcon,
} from "@/components/ui/icons";

export const metadata = {
  title: "MicroNest — Know who to call today",
  description:
    "A lightweight relationship workspace for mutual fund distributors. See who needs attention, why they matter, and what to do next.",
};

const STEPS = [
  {
    icon: <SunIcon />,
    title: "See who needs you",
    hint: "Today surfaces the people who need attention.",
  },
  {
    icon: <CheckIcon />,
    title: "Understand why",
    hint: "Read the reason before you make the call.",
  },
  { icon: <PhoneIcon />, title: "Take action", hint: "Call, WhatsApp, or send a message." },
  { icon: <FileTextIcon />, title: "Follow through", hint: "Track follow-ups and reconnects." },
];

const FEATURES = [
  {
    icon: <SunIcon />,
    title: "Today",
    hint: "Your daily relationship queue — who needs you and why.",
    href: "/workspace/today",
  },
  {
    icon: <UsersIcon />,
    title: "Clients",
    hint: "A simple people-first directory of everyone you look after.",
    href: "/workspace/clients",
  },
  {
    icon: <PhoneIcon />,
    title: "Client Detail",
    hint: "Context, actions, follow-ups and relationship information.",
    href: "/workspace/clients",
  },
  {
    icon: <MessageIcon />,
    title: "Message Studio",
    hint: "Ready-to-use, compliant client message templates. No login needed.",
    href: "/tools/message-studio",
  },
];

function SignedOutCtas() {
  return (
    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
      <Link href="/login" className={cn(buttonClasses("primary"), "px-5 sm:flex-1")}>
        Get started
        <ArrowRightIcon aria-hidden="true" className="ml-2 h-4 w-4" />
      </Link>
      <Link href="/login" className={cn(buttonClasses("secondary"), "px-5 sm:flex-1")}>
        Sign in
      </Link>
    </div>
  );
}

/**
 * Session-aware CTAs stream behind Suspense so the marketing shell
 * prerenders (cacheComponents). Signed-in visitors get Open workspace;
 * everyone else gets Get started / Sign in. Failures read as signed out.
 */
async function PrimaryCtas() {
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
        <p className="text-xs leading-relaxed text-stone-600 sm:self-center">
          You&apos;re signed in — jump back in where you left off.
        </p>
      </div>
    );
  }
  return <SignedOutCtas />;
}

/**
 * Static, honest product preview: the same primitives as the real Today
 * cards (avatar, badges, reason lines) composed as a non-interactive
 * demonstration. No fake metrics, no fake controls.
 */
function ProductPreview() {
  return (
    <section aria-label="Product preview: the Today workspace">
      <Card padding="compact">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="eyebrow flex items-center gap-1.5">
              <SunIcon aria-hidden="true" className="h-3.5 w-3.5" />
              Today · Example preview
            </p>
            <p className="text-xl font-semibold tracking-tight text-stone-900">Good morning</p>
            <p className="tnum text-sm text-stone-600">
              <strong className="font-semibold text-stone-900">3</strong> people need you today.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Rajesh Sharma" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Rajesh Sharma</span>
                <span className="truncate text-xs text-stone-500">Reconnect — 62 days silent</span>
              </span>
              <SignalBadge tone="amber">Reconnect</SignalBadge>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <ClientAvatar name="Priya Mehta" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-stone-900">Priya Mehta</span>
                <span className="truncate text-xs text-stone-500">Follow-up due today</span>
              </span>
              <SignalBadge tone="amber">Due today</SignalBadge>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-3 text-sm font-medium text-white">
            <PhoneIcon aria-hidden="true" className="h-4 w-4" />
            Call
          </div>
        </div>
      </Card>
    </section>
  );
}

/**
 * Public marketing homepage (RCCF-MFD-39). Marketing, not the workspace:
 * value → proof → workflow → features → communication → audience → CTA.
 * Session-aware CTAs only; no workspace data is ever rendered here.
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
            Know who to call today.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-stone-600 lg:text-lg">
            A simple relationship workspace that helps you see which clients need attention, why
            they matter, and what to do next.
          </p>
          <Suspense fallback={<SignedOutCtas />}>
            <PrimaryCtas />
          </Suspense>
          <p className="text-xs leading-relaxed text-stone-600">
            Works alongside your existing financial software — nothing to migrate.
          </p>
        </div>
        <ProductPreview />
      </section>

      <section aria-labelledby="how-heading">
        <div className="flex flex-col gap-3">
          <h2 id="how-heading" className="eyebrow">
            How it works
          </h2>
          <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-8 -right-2 hidden text-stone-300 lg:block"
                  >
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                )}
                <Card padding="compact" className="h-full">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
                    >
                      {step.icon}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold text-stone-900">
                        <span className="tnum mr-1.5 text-xs font-medium text-stone-500">
                          0{i + 1}
                        </span>
                        {step.title}
                      </span>
                      <span className="text-xs leading-relaxed text-stone-500">{step.hint}</span>
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="features-heading">
        <div className="flex flex-col gap-3">
          <h2 id="features-heading" className="eyebrow">
            What&apos;s inside
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {FEATURES.map((feature) => (
              <Link
                key={feature.title}
                href={feature.href}
                className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 lg:p-5"
              >
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-900"
                  >
                    {feature.icon}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-stone-900">{feature.title}</span>
                    <span className="text-xs leading-relaxed text-stone-500">{feature.hint}</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="studio-heading">
        <Card className="lg:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
            <div className="flex flex-col gap-3">
              <h2 id="studio-heading" className="eyebrow">
                Communication
              </h2>
              <p className="text-xl font-semibold tracking-tight text-stone-900 lg:text-2xl">
                The right words, ready to send.
              </p>
              <p className="text-sm leading-relaxed text-stone-600 lg:text-base">
                Pick a template, choose a language and tone, generate the message, and hand it to
                WhatsApp. Deterministic templates — never AI generation, nothing stored anywhere.
              </p>
              <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-stone-700">
                {["Template", "Language", "Tone", "Message", "WhatsApp"].map((step, i, all) => (
                  <li key={step} className="flex items-center gap-1.5">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1">{step}</span>
                    {i < all.length - 1 && (
                      <ArrowRightIcon aria-hidden="true" className="h-3.5 w-3.5 text-stone-500" />
                    )}
                  </li>
                ))}
              </ol>
              <Link
                href="/tools/message-studio"
                className="inline-flex min-h-[44px] items-center font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Open Message Studio
                <ArrowRightIcon aria-hidden="true" className="ml-1.5 h-4 w-4" />
              </Link>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 lg:p-5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-900"
              >
                <MessageIcon className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-stone-900">Dear Rahul,</span>
                <span className="text-sm leading-relaxed text-stone-700">
                  Kindly share your KYC form at your convenience. Thank you.
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
                  <SendIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  Send via WhatsApp
                </span>
              </span>
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="who-heading">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 id="who-heading" className="eyebrow text-emerald-900">
            Who it&apos;s for
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-emerald-900 sm:text-base">
            Built for mutual fund distributors who want a simpler way to stay connected with
            clients. It works alongside your existing financial software — your software stays the
            system of record.
          </p>
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
          Spend less time remembering who to call. Spend more time talking to clients.
        </h2>
        <Suspense fallback={<SignedOutCtas />}>
          <PrimaryCtas />
        </Suspense>
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
