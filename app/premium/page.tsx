import type { Metadata } from "next";
import Link from "next/link";
import { PremiumForm } from "./premium-form";

export const metadata: Metadata = {
  title: "Help shape MicroNest — MicroNest",
  description:
    "MicroNest is free while we're validating the product. Tell us how you would use it, what would make it more useful, and what you'd realistically pay.",
};

/**
 * Public product-research page (MFD-78). This is a feedback form, not a
 * pricing page: no plans, no billing, no payment collection. Anonymous
 * visitors and signed-in users share the same path; ownership is derived
 * server-side on submit.
 */
export default function PremiumPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← Home
        </Link>
      </nav>
      <section className="flex flex-col gap-2" aria-labelledby="premium-heading">
        <p className="eyebrow">Product research</p>
        <h1
          id="premium-heading"
          className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl"
        >
          Help shape MicroNest
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          MicroNest is free while we&apos;re validating the product. Tell us how you would use it,
          what would make it more useful, and what you&apos;d realistically pay if it became part
          of your workflow.
        </p>
      </section>
      <PremiumForm />
    </div>
  );
}
