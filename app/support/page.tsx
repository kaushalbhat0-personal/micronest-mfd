import type { Metadata } from "next";
import Link from "next/link";
import { publicRouteMeta } from "@/lib/seo/site";

export const metadata: Metadata = publicRouteMeta(
  "/support",
  "Support — MicroNest",
  "Get help with MicroNest: self-service options and how to contact us.",
);

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

export default function SupportPage() {
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
        <p className="eyebrow">Help</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Support
        </h1>
        <p className="text-sm leading-relaxed text-stone-600 sm:text-base">
          Most things in MicroNest are self-service. Start here.
        </p>
      </section>
      <section className="flex flex-col gap-3 text-sm leading-relaxed text-stone-700">
        <h2 className="text-base font-semibold text-stone-900">Things you can do yourself</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <Link href="/workspace/clients" className="font-medium text-emerald-900 hover:underline">
              Clients
            </Link>{" "}
            — download the CSV template to see the expected format before importing.
          </li>
          <li>
            <Link href="/privacy" className="font-medium text-emerald-900 hover:underline">
              Privacy Policy
            </Link>{" "}
            — how your data is stored and what is never collected.
          </li>
          <li>
            Your account menu (top right when signed in) lets you sign out and permanently
            delete all of your clients and follow-ups.
          </li>
        </ul>
        <h2 className="text-base font-semibold text-stone-900">Contact us</h2>
        {SUPPORT_EMAIL.length > 0 ? (
          <p>
            Email us at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-emerald-900 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            . Please describe what you were doing and what you expected — never include
            client phone numbers, ID numbers, or passwords.
          </p>
        ) : (
          <p>
            Direct email support is being set up for international validation. Meanwhile, the
            self-service options above cover accounts, data, and imports.
          </p>
        )}
      </section>
    </div>
  );
}
