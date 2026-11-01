import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, cardClasses } from "@/components/ui/card";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminUnauthorized } from "@/lib/admin/auth";
import { getUserDetail } from "@/lib/admin/queries";
import { formatJoinedDate, formatLastSignIn } from "@/features/admin/users";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Account — MicroNest",
  description: "Internal account profile with usage context. Not indexed.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Account profile (P1B, read-only).
 *
 * Identity from the Auth Admin API plus count-only usage and WTP research
 * history linked by `wtp_interest.user_id` — the only authoritative
 * linkage. Malformed and unknown ids both resolve to `notFound()` with
 * no distinction, so UUIDs in the URL leak nothing.
 */
export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
    detail = await getUserDetail(id);
  } catch (error) {
    if (error instanceof AdminUnauthorized) notFound();
    throw error;
  }
  if (!detail) notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link
        href="/admin/users"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
      >
        ← All accounts
      </Link>

      <Card padding="compact" className="lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <ClientAvatar name={detail.user.displayName ?? detail.user.email ?? "—"} />
          <div className="min-w-0">
            <p className="eyebrow">Account</p>
            <h1 className="truncate text-xl font-semibold tracking-tight break-words text-stone-900 lg:text-2xl">
              {detail.user.displayName ?? "—"}
            </h1>
            <p className="tnum mt-1 truncate text-sm text-stone-600">
              <span className="font-medium text-stone-800">Auth email: </span>
              {detail.user.email ?? "—"}
            </p>
          </div>
        </div>
      </Card>

      <Card padding="compact">
        <h2 className="eyebrow">Identity</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <DetailRow label="Auth email" value={detail.user.email ?? "—"} />
          <DetailRow label="Display name" value={detail.user.displayName ?? "—"} />
          <DetailRow label="Joined" value={formatJoinedDate(detail.user.createdAt)} />
          <DetailRow label="Last sign-in" value={formatLastSignIn(detail.user.lastSignInAt)} />
          <DetailRow
            label="User ID"
            value={`${detail.user.id.slice(0, 8)}…${detail.user.id.slice(-4)}`}
          />
        </dl>
      </Card>

      <section aria-label="Usage">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Clients" value={detail.counts.clientCount} />
          <MetricCard label="Open follow-ups" value={detail.counts.openFollowupCount} />
          <MetricCard label="Completed" value={detail.counts.completedFollowupCount} />
          <MetricCard label="Submissions" value={detail.counts.submissionCount} />
        </div>
      </section>

      <section aria-label="Research history">
        <Card padding="compact">
          <h2 className="text-base font-semibold text-stone-900">Research history</h2>
          {detail.submissions.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No submissions yet"
                hint="This account has not submitted the research form. Anonymous submissions are not linked to accounts."
              />
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {detail.submissions.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-stone-200 bg-stone-50 p-3 sm:bg-white"
                >
                  <p className="tnum text-xs text-stone-500">
                    {new Date(row.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-1 text-sm font-medium text-stone-900">
                    {row.profession} <span className="font-normal text-stone-500">·</span>{" "}
                    {row.country} <span className="font-normal text-stone-500">·</span>{" "}
                    {row.clientCountBand} clients{" "}
                    <span className="font-normal text-stone-500">·</span> {row.priceBand}
                  </p>
                  {row.messageExcerpt ? (
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{row.messageExcerpt}</p>
                  ) : null}
                  <div className="mt-1">
                    <Link
                      href={`/admin/suggestions/${row.id}`}
                      className={cn(
                        "inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
                      )}
                    >
                      Open submission →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <div className={cn(cardClasses("compact"), "text-xs leading-relaxed text-stone-500")}>
        Counts only — client records, messages, and contact details are never shown here. WTP
        submissions link by account ID, never by matching email addresses.
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card padding="compact">
      <p className="tnum text-2xl font-semibold tracking-tight text-stone-900 lg:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs text-stone-600 lg:text-sm">{label}</p>
    </Card>
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
    <div className="flex flex-col gap-4" aria-label="Loading account">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
