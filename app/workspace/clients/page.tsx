import { Suspense } from "react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
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
          <Card>
            <p className="text-sm text-stone-500" role="status">
              Loading your clients…
            </p>
          </Card>
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Proxy normally bounces signed-out sessions to /login first.
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

  let clients: StoredRadarClient[] = [];
  let followups: StoredFollowup[] = [];
  let loadError: string | null = null;
  try {
    [clients, followups] = await Promise.all([listClients(supabase), listOpenFollowups(supabase)]);
  } catch (error) {
    loadError = error instanceof RadarStoreError ? error.message : "We couldn't load your clients.";
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
