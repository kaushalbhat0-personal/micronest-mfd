import type { Metadata } from "next";
import Link from "next/link";
import { publicRouteMeta } from "@/lib/seo/site";

export const metadata: Metadata = publicRouteMeta(
  "/terms",
  "Terms — MicroNest",
  "The terms for using MicroNest.",
);

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← Home
        </Link>
      </nav>
      <section className="flex flex-col gap-1.5">
        <p className="eyebrow">Legal</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Terms</h1>
        <p className="text-xs text-stone-500">Last updated: October 2026</p>
      </section>
      <section className="flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-stone-900">What MicroNest is</h2>
        <p>
          MicroNest is a simple relationship workspace for people who manage clients: organize
          contacts, track who needs attention, plan follow-ups, and draft messages. It works
          alongside your existing software and records — it does not replace them.
        </p>
        <h2 className="text-base font-semibold text-stone-900">Acceptable use</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>You must only store clients you have a legitimate relationship with.</li>
          <li>
            Do not enter ID numbers, bank details, OTPs, or passwords anywhere in MicroNest.
          </li>
          <li>You are responsible for complying with the laws and professional rules that apply to you.</li>
        </ul>
        <h2 className="text-base font-semibold text-stone-900">No professional advice</h2>
        <p>
          Message templates and reminders are drafting aids only. MicroNest gives no financial,
          legal, or compliance advice, and nothing in the product certifies regulatory
          compliance. You decide what to send and remain responsible for it.
        </p>
        <h2 className="text-base font-semibold text-stone-900">Availability and data</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            MicroNest is provided as-is. Export anything important: the client template
            download and CSV export are yours to keep.
          </li>
          <li>
            You can permanently delete all of your clients and follow-ups from your account
            menu at any time (see <Link href="/privacy" className="font-medium text-emerald-900 hover:underline">Privacy Policy</Link>).
          </li>
        </ul>
        <h2 className="text-base font-semibold text-stone-900">Contact</h2>
        <p>
          Questions about these terms: see <Link href="/support" className="font-medium text-emerald-900 hover:underline">Support</Link>.
        </p>
      </section>
    </div>
  );
}
