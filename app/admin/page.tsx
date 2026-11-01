import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminUnauthorized } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/queries";

export const metadata: Metadata = {
  title: "Admin overview — MicroNest",
  description: "Internal usage and research overview. Not indexed.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Internal admin overview (P0, read-only).
 *
 * Server-rendered from real data: auth user counts via the Admin API and
 * `wtp_interest` research rows via the privileged service client. Both
 * reads run behind `requireAdmin()` inside the query module; this page
 * only translates authorization failure into `notFound()`.
 */
export default function AdminPage() {
  return (
    <Suspense fallback={<AdminOverviewSkeleton />}>
      <AdminBody />
    </Suspense>
  );
}

async function AdminBody() {
  let metrics;
  let recent;
  try {
    ({ metrics, recent } = await getAdminOverview());
  } catch (error) {
    if (error instanceof AdminUnauthorized) notFound();
    throw error;
  }

  const cards = [
    { label: "Total users", value: metrics.totalUsers },
    { label: "New users · 7 days", value: metrics.newUsers7d },
    { label: "Research submissions", value: metrics.totalSubmissions },
    { label: "Identified submissions", value: metrics.identifiedSubmissions },
    { label: "Anonymous submissions", value: metrics.anonymousSubmissions },
    { label: "Users with 2+ submissions", value: metrics.multiSubmitters },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="eyebrow">Internal · read-only</p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          Admin overview
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Who is using MicroNest and what they are asking for — from account records and the
          research form. No editing, no export.
        </p>
      </header>

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} padding="compact">
            <p className="tnum text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-stone-600 lg:text-sm">{card.label}</p>
          </Card>
        ))}
      </section>

      <section aria-label="Demand signals" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FrequencyCard title="Most requested features" entries={metrics.topFeatures} />
        <FrequencyCard title="Top professions" entries={metrics.topProfessions} />
        <FrequencyCard title="Top countries" entries={metrics.topCountries} />
        <FrequencyCard title="Price-band mix" entries={metrics.priceBandMix} />
      </section>

      <section aria-label="Recent research submissions">
        <Card>
          <h2 className="text-base font-semibold text-stone-900">Recent submissions</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">No research submissions yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {recent.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-stone-200 bg-stone-50 p-3 sm:bg-white"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                    <span className="tnum">
                      {new Date(row.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{row.userId ? "Signed-in user" : "Anonymous"}</span>
                    {row.email ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{row.email}</span>
                      </>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium text-stone-900">
                    {row.profession} <span className="font-normal text-stone-500">·</span>{" "}
                    {row.country} <span className="font-normal text-stone-500">·</span>{" "}
                    {row.clientCountBand} clients{" "}
                    <span className="font-normal text-stone-500">·</span> {row.priceBand}
                  </p>
                  {row.messageExcerpt ? (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{row.messageExcerpt}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function FrequencyCard({
  title,
  entries,
}: {
  title: string;
  entries: Array<{ value: string; count: number }>;
}) {
  const max = entries.length > 0 ? entries[0].count : 0;
  return (
    <Card padding="compact">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">No data yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li key={entry.value} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate text-stone-600">{entry.value}</span>
              <span
                aria-hidden="true"
                className="h-1.5 min-w-2 rounded-full bg-emerald-900"
                style={{
                  width: `${max > 0 ? Math.max(8, Math.round((entry.count / max) * 96)) : 8}px`,
                }}
              />
              <span className="tnum text-stone-900">{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AdminOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Loading admin overview">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
