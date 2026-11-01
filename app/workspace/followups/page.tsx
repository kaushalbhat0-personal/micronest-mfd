import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientCardSkeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { timed } from "@/lib/perf/log";
import {
  DEFAULT_COMPLETED_LIMIT,
  listCompletedFollowups,
  listOpenFollowups,
} from "@/features/followups/repository";
import type { StoredFollowup } from "@/features/followups/types";
import { parseFollowupsTab } from "@/features/followups/model";
import { listClients, RadarStoreError, type StoredRadarClient } from "@/features/radar/repository";
import { FollowupsWorkspace } from "@/features/followups/components/followups-workspace";

export const metadata: Metadata = {
  title: "Follow-ups — MicroNest",
  description: "Every follow-up across your clients: what needs handling and what you handled.",
};

interface FollowupsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Global Follow-ups (relationship memory). Server loads the owned client
 * list (display join, in-memory like Today) plus open follow-ups and the
 * bounded completed history once (RLS final); grouping and display copy
 * are the pure view-model in features/followups/model.ts. Streams behind
 * Suspense so the shell prerenders (cacheComponents). Secondary workspace
 * destination with a mobile bottom-nav tab; activeDestination resolves
 * to followups so the tab reads active.
 */
export default function FollowupsPage({ searchParams }: FollowupsPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:gap-7">
      <Suspense
        fallback={
          <div role="status" aria-label="Loading your follow-ups">
            <span className="sr-only">Loading your follow-ups…</span>
            <div className="flex flex-col gap-2.5 lg:gap-4" aria-hidden="true">
              <ClientCardSkeleton />
              <ClientCardSkeleton />
            </div>
          </div>
        }
      >
        <FollowupsBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function FollowupsBody({ searchParams }: FollowupsPageProps) {
  const params = await searchParams;
  const initialTab = parseFollowupsTab(params.tab);

  if (!isSupabaseConfigured()) {
    return (
      <FollowupsWorkspace
        initialClients={[]}
        initialOpen={[]}
        initialCompleted={[]}
        initialTab={initialTab}
        completedLimit={DEFAULT_COMPLETED_LIMIT}
        loadError={null}
        configured={false}
        signedIn={false}
      />
    );
  }
  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <FollowupsWorkspace
        initialClients={[]}
        initialOpen={[]}
        initialCompleted={[]}
        initialTab={initialTab}
        completedLimit={DEFAULT_COMPLETED_LIMIT}
        loadError={null}
        configured={false}
        signedIn={false}
      />
    );
  }
  // P0: one parallel batch. The session validation (auth.getUser) and the
  // three independent reads fire together, so the page pays max(latency)
  // instead of auth-then-data sequentially. proxy.ts still route-guards;
  // this check remains the page-level authorization boundary.
  let clients: StoredRadarClient[] = [];
  let open: StoredFollowup[] = [];
  let completed: StoredFollowup[] = [];
  let loadError: string | null = null;
  let signedIn = true;
  try {
    const [userResponse, clientRows, openRows, completedRows] = await Promise.all([
      supabase.auth.getUser(),
      timed("supabase.clients.list", () => listClients(supabase), {
        route: "/workspace/followups",
        rowsOf: (rows) => rows.length,
      }),
      timed("supabase.followups.list-open", () => listOpenFollowups(supabase), {
        route: "/workspace/followups",
        rowsOf: (rows) => rows.length,
      }),
      timed("supabase.followups.list-completed", () => listCompletedFollowups(supabase), {
        route: "/workspace/followups",
        rowsOf: (rows) => rows.length,
      }),
    ]);
    if (!userResponse.data.user) {
      // Proxy normally bounces signed-out sessions to /login first.
      signedIn = false;
    } else {
      clients = clientRows;
      open = openRows;
      completed = completedRows;
    }
  } catch (error) {
    loadError =
      error instanceof RadarStoreError ? error.message : "We couldn't load your follow-ups.";
  }
  if (!signedIn) {
    return (
      <FollowupsWorkspace
        initialClients={[]}
        initialOpen={[]}
        initialCompleted={[]}
        initialTab={initialTab}
        completedLimit={DEFAULT_COMPLETED_LIMIT}
        loadError={null}
        configured
        signedIn={false}
      />
    );
  }
  return (
    <FollowupsWorkspace
      initialClients={clients}
      initialOpen={open}
      initialCompleted={completed}
      initialTab={initialTab}
      completedLimit={DEFAULT_COMPLETED_LIMIT}
      loadError={loadError}
      configured
      signedIn
    />
  );
}
