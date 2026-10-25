import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Today — MFD Relationship Workspace",
  description:
    "Who should you talk to today? Your client relationships needing attention, in one place.",
};

const FILTERS = [
  { id: "attention", label: "Needs attention" },
  { id: "followups", label: "Follow-ups" },
  { id: "recent", label: "Recent" },
  { id: "reconnect", label: "Reconnect due" },
  { id: "new", label: "New" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function isFilterId(value: unknown): value is FilterId {
  return FILTERS.some((f) => f.id === value);
}

interface TodayPageProps {
  searchParams: Promise<{ filter?: string }>;
}

/**
 * Today shell (RCCF-MFD-18 Phase A).
 * Placeholder only — the unified attention ranking arrives in a later phase.
 * No mock client records: an empty shell must never be mistaken for real data.
 * Filter state streams behind Suspense so the shell prerenders (cacheComponents).
 */
export default function TodayPage({ searchParams }: TodayPageProps) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">Today</h1>
        <p className="text-sm leading-relaxed text-stone-600">Who should you talk to today?</p>
      </section>

      <Suspense fallback={<TodayBodyFallback />}>
        <TodayBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function TodayBodyFallback() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <span
            key={filter.id}
            className="inline-flex min-h-[44px] items-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700"
          >
            {filter.label}
          </span>
        ))}
      </div>
      <Card>
        <p className="text-sm text-stone-500">Loading today…</p>
      </Card>
    </div>
  );
}

async function TodayBody({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const active: FilterId = isFilterId(params.filter) ? params.filter : "attention";

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Filter attention" className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.id}
            href={
              filter.id === "attention"
                ? "/workspace/today"
                : `/workspace/today?filter=${filter.id}`
            }
            aria-current={active === filter.id ? "true" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
              active === filter.id
                ? "border-emerald-900 bg-emerald-900 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-stone-900">
            Your relationship workspace is ready.
          </p>
          <p className="text-sm leading-relaxed text-stone-600">
            {active === "followups"
              ? "Follow-ups will live here — explicit dated tasks per client, alongside automatically derived reconnect reminders."
              : "Clients needing attention will appear here — recent investors, reconnects due, new clients, and follow-ups — with the reason for each."}
          </p>
          <p className="text-xs leading-relaxed text-stone-500">
            Full attention ranking, client management, and follow-ups arrive in the next phase.
          </p>
        </div>
      </Card>
    </div>
  );
}
