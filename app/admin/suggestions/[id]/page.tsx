import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, cardClasses } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminUnauthorized } from "@/lib/admin/auth";
import { getSuggestionDetail } from "@/lib/admin/queries";
import { formatQuotedAmount } from "@/features/admin/filters";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Submission — MicroNest",
  description: "Internal product research submission. Not indexed.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Single research submission (P1A, read-only).
 *
 * Renders all 15 `wtp_interest` fields in schema vocabulary. The stored
 * email is always labeled "Provided email" — it is form input, never the
 * authenticated user's email. Malformed and unknown ids both resolve to
 * `notFound()` with no distinction.
 */
export default function SuggestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailBody params={params} />
    </Suspense>
  );
}

async function DetailBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail;
  try {
    detail = await getSuggestionDetail(id);
  } catch (error) {
    if (error instanceof AdminUnauthorized) notFound();
    throw error;
  }
  if (!detail) notFound();

  const submitted = new Date(detail.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const quoted = formatQuotedAmount(detail.quotedPriceMinor, detail.quotedCurrency);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link
        href="/admin/suggestions"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
      >
        ← All suggestions
      </Link>

      <Card padding="compact" className="lg:p-6">
        <p className="eyebrow">Suggestion</p>
        <h1 className="text-xl font-semibold tracking-tight break-words text-stone-900 lg:text-2xl">
          Submission · {submitted}
        </h1>
        <p className="tnum mt-1 text-sm text-stone-600">
          {detail.userId ? "Signed-in user" : "Anonymous submission"}
        </p>
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Submission</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <DetailRow label="Submitted" value={new Date(detail.createdAt).toLocaleString("en-IN")} />
          <DetailRow label="Updated" value={new Date(detail.updatedAt).toLocaleString("en-IN")} />
        </dl>
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Profile</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <DetailRow label="Provided email" value={detail.email ?? "—"} />
          <DetailRow label="Country" value={detail.country} />
          <DetailRow label="Profession" value={detail.profession} />
          <DetailRow label="Profession detail" value={detail.professionOther ?? "—"} />
          <DetailRow label="Client count" value={detail.clientCountBand} />
        </dl>
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Current solution</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.currentSolution.length === 0 ? (
            <span className="text-sm text-stone-500">None selected.</span>
          ) : (
            detail.currentSolution.map((solution) => (
              <span
                key={solution}
                className="inline-flex min-h-[44px] items-center rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-700"
              >
                {solution}
              </span>
            ))
          )}
        </div>
        {detail.currentSolutionOther ? (
          <p className="mt-2 text-sm text-stone-600">
            <span className="font-medium text-stone-800">Other: </span>
            {detail.currentSolutionOther}
          </p>
        ) : null}
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Desired product</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.desiredFeatures.length === 0 ? (
            <span className="text-sm text-stone-500">None selected.</span>
          ) : (
            detail.desiredFeatures.map((feature) => (
              <span
                key={feature}
                className="inline-flex min-h-[44px] items-center rounded-full border border-emerald-900 bg-emerald-50 px-4 text-sm font-medium text-emerald-900"
              >
                {feature}
              </span>
            ))
          )}
        </div>
        {detail.otherFeature ? (
          <p className="mt-2 text-sm text-stone-600">
            <span className="font-medium text-stone-800">Other: </span>
            {detail.otherFeature}
          </p>
        ) : null}
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Pricing research</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <DetailRow label="Price band" value={detail.priceBand} />
          <DetailRow label="Quoted amount" value={quoted ?? "—"} />
        </dl>
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Message</h2>
        {detail.message && detail.message.trim().length > 0 ? (
          <p className="mt-2 rounded-lg bg-stone-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
            {detail.message.trim()}
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-500">No message left.</p>
        )}
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Linked user</h2>
        {detail.userId ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="tnum truncate text-sm text-stone-600">{detail.userId}</p>
            <span
              aria-disabled="true"
              title="User pages arrive in P1B"
              className={cn(cardClasses("compact"), "cursor-not-allowed text-sm text-stone-400")}
            >
              User page arrives in P1B
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            Anonymous submission — no signed-in account is attached.
          </p>
        )}
      </Card>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-medium break-words text-stone-900">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading submission">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
