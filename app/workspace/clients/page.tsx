import { Suspense } from "react";
import type { Metadata } from "next";
import { ClientCardSkeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { timed } from "@/lib/perf/log";
import { listOpenFollowups } from "@/features/followups/repository";
import type { StoredFollowup } from "@/features/followups/types";
import { listClients, RadarStoreError, type StoredRadarClient } from "@/features/radar/repository";
import { ClientsWorkspace } from "@/features/radar/components/clients-workspace";

export const metadata: Metadata = {
  title: "Client Book — MFD Relationship Workspace",
  description: "Your client relationship list. Search, add, and maintain client relationships.",
};

/**
 * Client Book (RCCF-MFD-49). Server loads the owned client list plus all
 * open follow-ups once (RLS final); attention ranking, counts, and display
 * copy are the shared view-model in features/radar (book.ts over today.ts).
 * Data resolution streams behind Suspense so the shell prerenders
 * (cacheComponents).
 */
export default function ClientsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:gap-7">
      <section
        className="grid grid-cols-1 items-end gap-2 lg:grid-cols-[minmax(0,1fr)_auto]"
        aria-labelledby="clients-heading"
      >
        <div className="flex flex-col gap-1.5">
          <p className="eyebrow">People</p>
          <h1
            id="clients-heading"
            className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl"
          >
            Client Book
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base lg:text-lg">
            Your client relationships, organized in one place.
          </p>
        </div>
      </section>

      <Suspense
        fallback={
          <div role="status" aria-label="Loading your clients">
            <span className="sr-only">Loading your clients…</span>
            <div className="flex flex-col gap-2.5 lg:gap-4" aria-hidden="true">
              <ClientCardSkeleton />
              <ClientCardSkeleton />
            </div>
          </div>
        }
      >
        <ClientsBody />
      </Suspense>
    </div>
  );
}

async function ClientsBody() {
  if (!isSupabaseConfigured()) {
    return (
      <ClientsWorkspace
        initialClients={[]}
        initialFollowups={[]}
        loadError={null}
        configured={false}
        signedIn={false}
      />
    );
  }
  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <ClientsWorkspace
        initialClients={[]}
        initialFollowups={[]}
        loadError={null}
        configured={false}
        signedIn={false}
      />
    );
  }
  // P0: one parallel batch. The session validation (auth.getUser) and the
  // two independent reads fire together, so the page pays max(latency)
  // instead of auth-then-data sequentially. proxy.ts still route-guards;
  // this check remains the page-level authorization boundary.
  let clients: StoredRadarClient[] = [];
  let followups: StoredFollowup[] = [];
  let loadError: string | null = null;
  let signedIn = true;
  try {
    const [userResponse, clientRows, followupRows] = await Promise.all([
      supabase.auth.getUser(),
      timed("supabase.clients.list", () => listClients(supabase), {
        route: "/workspace/clients",
        rowsOf: (rows) => rows.length,
      }),
      timed("supabase.followups.list-open", () => listOpenFollowups(supabase), {
        route: "/workspace/clients",
        rowsOf: (rows) => rows.length,
      }),
    ]);
    if (!userResponse.data.user) {
      // Proxy normally bounces signed-out sessions to /login first.
      signedIn = false;
    } else {
      clients = clientRows;
      followups = followupRows;
    }
  } catch (error) {
    loadError = error instanceof RadarStoreError ? error.message : "We couldn't load your clients.";
  }
  if (!signedIn) {
    return (
      <ClientsWorkspace
        initialClients={[]}
        initialFollowups={[]}
        loadError={null}
        configured
        signedIn={false}
      />
    );
  }
  return (
    <ClientsWorkspace
      initialClients={clients}
      initialFollowups={followups}
      loadError={loadError}
      configured
      signedIn
    />
  );
}
