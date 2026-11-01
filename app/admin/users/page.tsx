import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, TextInput } from "@/components/ui/controls";
import { Button, buttonClasses } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { FilterRail } from "@/components/admin/filter-rail";
import { Pager } from "@/components/admin/pager";
import { AdminUnauthorized } from "@/lib/admin/auth";
import { listUsersPage } from "@/lib/admin/queries";
import {
  formatJoinedDate,
  formatLastSignIn,
  parseUserSearchParams,
  userFiltersToQuery,
  USER_USAGE_FILTERS,
  type UserFilters,
} from "@/features/admin/users";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Users — MicroNest",
  description: "Internal account directory with product usage context. Not indexed.",
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

const USAGE_LABELS: Record<UserFilters["usage"], string> = {
  all: "All",
  "has-clients": "Has clients",
  "has-followups": "Has follow-ups",
  "has-submissions": "Has submissions",
};

/**
 * Account directory (P1B, read-only).
 *
 * Server-rendered from the Auth Admin API plus count-only usage
 * aggregation. Search and the usage filter run over a bounded account
 * window (see `features/admin/users.ts`) — honest about the Auth API
 * having no server-side user search. No customer rows ever leave the
 * service boundary; only per-user counts reach this page.
 */
export default function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <UsersBody searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersBody({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = parseUserSearchParams(await searchParams);
  let result;
  try {
    result = await listUsersPage(filters, filters.page);
  } catch (error) {
    if (error instanceof AdminUnauthorized) notFound();
    throw error;
  }

  const hrefFor = (patch: Partial<UserFilters>): string => {
    const next: UserFilters = { ...filters, ...patch };
    if (patch.page === undefined) next.page = 1;
    return `/admin/users${userFiltersToQuery(next)}`;
  };

  const hasActiveFilters = filters.q.length > 0 || filters.usage !== "all";

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="eyebrow">Users</p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          Accounts
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          People who have created a MicroNest account, with lightweight product usage context.
          Read-only — no editing, no impersonation.
        </p>
      </header>

      <Card padding="compact">
        <form
          method="get"
          action="/admin/users"
          className="flex flex-col gap-3"
          role="search"
          aria-label="Search accounts"
        >
          {filters.usage !== "all" ? (
            <input type="hidden" name="usage" value={filters.usage} />
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field
                id="user-search"
                label="Search accounts"
                hint="Email or display name. Search covers the loaded account window."
              >
                <TextInput
                  id="user-search"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Email or name"
                  maxLength={120}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Button type="submit" className="sm:shrink-0">
              Search
            </Button>
          </div>
        </form>

        <div className="mt-4">
          <FilterRail
            label="Usage"
            options={USER_USAGE_FILTERS.map((usage) => ({
              value: usage,
              label: USAGE_LABELS[usage],
              href: hrefFor({ usage }),
              selected: filters.usage === usage,
            }))}
          />
        </div>
      </Card>

      <section aria-label="Accounts">
        <p aria-live="polite" className="tnum text-sm text-stone-600">
          Showing {result.rows.length} of {result.total} accounts
        </p>
        {result.rows.length === 0 ? (
          <div className="mt-3">
            {hasActiveFilters ? (
              <EmptyState
                title="No matching accounts"
                hint="Try widening the search or clearing the usage filter."
                action={
                  <Link href="/admin/users" className={cn(buttonClasses("secondary"))}>
                    Clear search and filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title="No accounts yet"
                hint="Accounts appear here once someone signs in to MicroNest."
              />
            )}
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Card padding="compact">
                  <div className="flex items-start gap-3">
                    <ClientAvatar name={row.displayName ?? row.email ?? "—"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {row.displayName ?? "—"}
                      </p>
                      <p className="truncate text-sm text-stone-600">{row.email ?? "—"}</p>
                      <p className="tnum mt-1 text-xs text-stone-500">
                        Joined {formatJoinedDate(row.createdAt)} · Last sign-in{" "}
                        {formatLastSignIn(row.lastSignInAt)}
                      </p>
                      <p className="tnum mt-1 text-xs text-stone-600">
                        {row.clientCount} clients · {row.openFollowupCount} open follow-ups ·{" "}
                        {row.submissionCount} submissions
                      </p>
                      <div className="mt-2">
                        <Link
                          href={`/admin/users/${row.id}`}
                          className={cn(buttonClasses("ghost"), "px-0")}
                        >
                          Open profile →
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {result.totalPages > 1 && (
          <div className="mt-4">
            <Pager
              page={result.page}
              totalPages={result.totalPages}
              prevHref={result.page > 1 ? hrefFor({ page: result.page - 1 }) : null}
              nextHref={result.page < result.totalPages ? hrefFor({ page: result.page + 1 }) : null}
              label="Account pages"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Loading accounts">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
