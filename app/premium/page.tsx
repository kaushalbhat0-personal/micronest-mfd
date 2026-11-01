import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PremiumForm } from "./premium-form";
import { CLIENT_COUNT_BANDS } from "@/features/wtp/validation";
import { publicRouteMeta } from "@/lib/seo/site";

export const metadata: Metadata = publicRouteMeta(
  "/premium",
  "Help shape MicroNest — MicroNest",
  "MicroNest is free while we're validating the product. Tell us how you would use it, what would make it more useful, and what you'd realistically pay.",
);

/**
 * Public product-research page (MFD-78). This is a feedback form, not a
 * pricing page: no plans, no billing, no payment collection. Anonymous
 * visitors and signed-in users share the same path; ownership is derived
 * server-side on submit.
 *
 * The free-limit boundary deep-links here as /premium?context=limit. The
 * context only preselects the matching client-count band — anything else
 * falls back to the blank form, so normal access never breaks.
 */
export default function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
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
      <Suspense fallback={<PremiumForm />}>
        <PremiumFormShell searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Reads the limit-handoff context behind Suspense so the static shell
 * above still prerenders. The band value is allow-listed — anything else
 * falls back to the blank form, so normal access never breaks.
 */
async function PremiumFormShell({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
  const params = await searchParams;
  const band = params.context === "limit" ? "101-250" : "";
  const initialClientCountBand = (CLIENT_COUNT_BANDS as readonly string[]).includes(band)
    ? band
    : "";
  return <PremiumForm initialClientCountBand={initialClientCountBand} />;
}
