import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, Select, TextInput } from "@/components/ui/controls";
import { Button, buttonClasses } from "@/components/ui/button";
import { FilterRail } from "@/components/admin/filter-rail";
import { Pager } from "@/components/admin/pager";
import { AdminUnauthorized } from "@/lib/admin/auth";
import { getSuggestionCountries, listSuggestions } from "@/lib/admin/queries";
import { CLIENT_COUNT_BANDS, PRICE_BANDS, PROFESSIONS } from "@/features/wtp/validation";
import {
  parseSuggestionSearchParams,
  suggestionFiltersToQuery,
  type SuggestionFilters,
} from "@/features/admin/filters";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Suggestions — MicroNest",
  description: "Internal product research submissions. Not indexed.",
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Research submissions workspace (P1A, read-only).
 *
 * Server-rendered from `wtp_interest` behind `requireAdmin()`. All filter
 * state lives in the URL so refresh, back/forward, and internal sharing
 * work without client JavaScript. Changing any filter resets to page 1.
 */
export default function SuggestionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<SuggestionsSkeleton />}>
      <SuggestionsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function SuggestionsBody({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = parseSuggestionSearchParams(await searchParams);
  let result;
  let countries: string[];
  try {
    [result, countries] = await Promise.all([
      listSuggestions(filters, filters.page),
      getSuggestionCountries(),
    ]);
  } catch (error) {
    if (error instanceof AdminUnauthorized) notFound();
    throw error;
  }

  const hrefFor = (patch: Partial<SuggestionFilters>): string => {
    const next: SuggestionFilters = { ...filters, ...patch };
    if (patch.page === undefined) next.page = 1;
    return `/admin/suggestions${suggestionFiltersToQuery(next)}`;
  };

  const hasActiveFilters =
    filters.q.length > 0 ||
    filters.profession.length > 0 ||
    filters.country.length > 0 ||
    filters.countBand.length > 0 ||
    filters.priceBand.length > 0 ||
    filters.authStatus !== "all";

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="eyebrow">Suggestions</p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          Research submissions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          What prospects and users asked for through the research form. Read-only — no editing, no
          export.
        </p>
      </header>

      <Card padding="compact">
        <form
          method="get"
          action="/admin/suggestions"
          className="flex flex-col gap-3"
          role="search"
          aria-label="Search submissions"
        >
          <input type="hidden" name="profession" value={filters.profession} />
          <input type="hidden" name="countBand" value={filters.countBand} />
          <input type="hidden" name="priceBand" value={filters.priceBand} />
          <input
            type="hidden"
            name="authStatus"
            value={filters.authStatus === "all" ? "" : filters.authStatus}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field id="suggestion-search" label="Search submissions">
                <TextInput
                  id="suggestion-search"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Email, message, or other details"
                  maxLength={120}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="sm:w-52 sm:shrink-0">
              <Field id="suggestion-country" label="Country">
                <Select id="suggestion-country" name="country" defaultValue={filters.country}>
                  <option value="">All countries</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" className="sm:shrink-0">
              Search
            </Button>
          </div>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          <FilterRail
            label="Profession"
            options={[
              {
                value: "",
                label: "All",
                href: hrefFor({ profession: "" }),
                selected: filters.profession === "",
              },
              ...PROFESSIONS.map((profession) => ({
                value: profession,
                label: profession,
                href: hrefFor({ profession }),
                selected: filters.profession === profession,
              })),
            ]}
          />
          <FilterRail
            label="Client count"
            options={[
              {
                value: "",
                label: "All",
                href: hrefFor({ countBand: "" }),
                selected: filters.countBand === "",
              },
              ...CLIENT_COUNT_BANDS.map((band) => ({
                value: band,
                label: band,
                href: hrefFor({ countBand: band }),
                selected: filters.countBand === band,
              })),
            ]}
          />
          <FilterRail
            label="Price band"
            options={[
              {
                value: "",
                label: "All",
                href: hrefFor({ priceBand: "" }),
                selected: filters.priceBand === "",
              },
              ...PRICE_BANDS.map((band) => ({
                value: band,
                label: band,
                href: hrefFor({ priceBand: band }),
                selected: filters.priceBand === band,
              })),
            ]}
          />
          <FilterRail
            label="Account"
            options={[
              {
                value: "all",
                label: "All",
                href: hrefFor({ authStatus: "all" }),
                selected: filters.authStatus === "all",
              },
              {
                value: "identified",
                label: "Signed-in",
                href: hrefFor({ authStatus: "identified" }),
                selected: filters.authStatus === "identified",
              },
              {
                value: "anonymous",
                label: "Anonymous",
                href: hrefFor({ authStatus: "anonymous" }),
                selected: filters.authStatus === "anonymous",
              },
            ]}
          />
        </div>
      </Card>

      <section aria-label="Submissions">
        <p aria-live="polite" className="tnum text-sm text-stone-600">
          Showing {result.rows.length} of {result.total} submissions
        </p>
        {result.rows.length === 0 ? (
          <div className="mt-3">
            {hasActiveFilters ? (
              <EmptyState
                title="No matching submissions"
                hint="Try widening the search or clearing a filter."
                action={
                  <Link href="/admin/suggestions" className={cn(buttonClasses("secondary"))}>
                    Clear all filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title="No research submissions yet"
                hint="Submissions appear here when someone completes the research form."
              />
            )}
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Card padding="compact">
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
                  <div className="mt-2">
                    <Link
                      href={`/admin/suggestions/${row.id}`}
                      className={cn(buttonClasses("ghost"), "px-0")}
                    >
                      Open submission →
                    </Link>
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
              label="Submission pages"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function SuggestionsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Loading submissions">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
