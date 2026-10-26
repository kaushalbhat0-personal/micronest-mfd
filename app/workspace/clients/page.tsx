import { Suspense } from "react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { listClients, RadarStoreError, type StoredRadarClient } from "@/features/radar/repository";
import { ClientsWorkspace } from "@/features/radar/components/clients-workspace";

export const metadata: Metadata = {
  title: "Clients — MFD Relationship Workspace",
  description: "Your client relationship list. Search, add, and maintain client relationships.",
};

/**
 * Clients page (RCCF-MFD-19). Server loads the owned list once through the
 * repository (RLS final); search and add run client-side. Data resolution
 * streams behind Suspense so the shell prerenders (cacheComponents).
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
            Clients
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base lg:text-lg">
            Everyone you look after — search, open a relationship, and stay in touch.
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
      <ClientsWorkspace initialClients={[]} loadError={null} configured={false} signedIn={false} />
    );
  }
  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <ClientsWorkspace initialClients={[]} loadError={null} configured={false} signedIn={false} />
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Proxy normally bounces signed-out sessions to /login first.
    return <ClientsWorkspace initialClients={[]} loadError={null} configured signedIn={false} />;
  }

  let clients: StoredRadarClient[] = [];
  let loadError: string | null = null;
  try {
    clients = await listClients(supabase);
  } catch (error) {
    loadError = error instanceof RadarStoreError ? error.message : "We couldn't load your clients.";
  }
  return <ClientsWorkspace initialClients={clients} loadError={loadError} configured signedIn />;
}
