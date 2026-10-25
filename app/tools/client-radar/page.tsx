import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { RadarWorkspace } from "@/features/radar/components/radar-workspace";
import { RadarIdentity } from "@/features/auth/components/radar-identity";

export const metadata: Metadata = {
  title: "Client Radar — MicroNest MFD Microtools",
  description:
    "Know which clients are worth talking to this week — and why. Contact updates save to your account; CSV imports stay on this device.",
};

// Static shell; the session check streams behind Suspense (cacheComponents).
// Route protection itself lives in proxy.ts.
export default function ClientRadarPage() {
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← All tools
        </Link>
        <Suspense fallback={<span className="min-h-[44px]" aria-hidden="true" />}>
          <RadarIdentity />
        </Suspense>
      </nav>
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
          Client Radar
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Your most useful client conversations, surfaced automatically.
        </p>
      </section>
      <RadarWorkspace />
    </div>
  );
}
