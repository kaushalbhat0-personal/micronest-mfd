import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { TodaySkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { timed } from "@/lib/perf/log";
import { listOpenFollowups } from "@/features/followups/repository";
import type { StoredFollowup } from "@/features/followups/types";
import { listClients, RadarStoreError, type StoredRadarClient } from "@/features/radar/repository";
import { parseTodayFilter, type TodayFilter } from "@/features/radar/today";
import { TodayWorkspace } from "@/features/radar/components/today-workspace";

export const metadata: Metadata = {
  title: "Today — MFD Relationship Workspace",
  description:
    "Who should you talk to today? Your client relationships needing attention, in one place.",
};

interface TodayPageProps {
  searchParams: Promise<{ filter?: string }>;
}

/**
 * Today (RCCF-MFD-29 Phase B). Server loads the owned client list plus all
 * open follow-ups once (RLS final); ranking, filtering, and display copy are
 * the pure view-model in features/radar/today.ts. The legacy `?filter=`
 * values from the retired routes still select the initial filter.
 */
export default function TodayPage({ searchParams }: TodayPageProps) {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayBody searchParams={searchParams} />
    </Suspense>
  );
}

async function TodayBody({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const initialFilter: TodayFilter = parseTodayFilter(params.filter);

  if (!isSupabaseConfigured()) {
    return (
      <TodayWorkspace
        initialClients={[]}
        initialFollowups={[]}
        initialFilter={initialFilter}
        configured={false}
        signedIn={false}
      />
    );
  }
  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <TodayWorkspace
        initialClients={[]}
        initialFollowups={[]}
        initialFilter={initialFilter}
        configured={false}
        signedIn={false}
      />
    );
  }
  // P0: one parallel batch. The session validation (auth.getUser) and the
  // two independent reads fire together, so the page pays max(latency)
  // instead of auth-then-data sequentially. proxy.ts still route-guards;
  // this check remains the page-level authorization boundary (signed-in
  // branching + userName) and every row stays RLS-scoped.
  let clients: StoredRadarClient[] = [];
  let followups: StoredFollowup[] = [];
  let userName: string | undefined;
  let signedIn = true;
  try {
    const [userResponse, clientRows, followupRows] = await Promise.all([
      supabase.auth.getUser(),
      timed("supabase.clients.list", () => listClients(supabase), {
        route: "/workspace/today",
        rowsOf: (rows) => rows.length,
      }),
      timed("supabase.followups.list-open", () => listOpenFollowups(supabase), {
        route: "/workspace/today",
        rowsOf: (rows) => rows.length,
      }),
    ]);
    const user = userResponse.data.user;
    if (!user) {
      // Proxy normally bounces signed-out sessions to /login first.
      signedIn = false;
    } else {
      clients = clientRows;
      followups = followupRows;
      // Real display name only — never invented. Falls back to no personalization.
      const fullName =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.trim()
          : "";
      userName = fullName ? fullName.split(/\s+/)[0] : undefined;
    }
  } catch (error) {
    const copy =
      error instanceof RadarStoreError || error instanceof Error
        ? error.message
        : "We couldn't load today's list.";
    return (
      <Card>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-stone-900">
            We couldn&apos;t load today&apos;s list.
          </p>
          <p className="text-xs text-stone-600">{copy}</p>
          <Link href="/workspace/today" className={cn(buttonClasses("primary"), "sm:self-start")}>
            Try again
          </Link>
        </div>
      </Card>
    );
  }
  if (!signedIn) {
    return (
      <TodayWorkspace
        initialClients={[]}
        initialFollowups={[]}
        initialFilter={initialFilter}
        configured
        signedIn={false}
      />
    );
  }
  return (
    <TodayWorkspace
      initialClients={clients}
      initialFollowups={followups}
      initialFilter={initialFilter}
      configured
      signedIn
      userName={userName}
    />
  );
}
