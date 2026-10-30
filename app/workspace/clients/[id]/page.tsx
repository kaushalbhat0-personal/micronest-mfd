import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ClientCardSkeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { timed } from "@/lib/perf/log";
import { isValidClientId } from "@/lib/workspace/params";
import { listFollowupsForClient } from "@/features/followups/repository";
import type { StoredFollowup } from "@/features/followups/types";
import { getClient, RadarStoreError, type StoredRadarClient } from "@/features/radar/repository";
import { ClientDetail } from "@/features/radar/components/client-detail";

export const metadata: Metadata = {
  title: "Client — MFD Relationship Workspace",
  description: "Focused client view: why this client matters and what to do next.",
};

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Client detail page (RCCF-MFD-19). The opaque client id is the only URL
 * input. The owned row loads server-side through the repository (RLS
 * final); actions run client-side in ClientDetail. Resolution streams
 * behind Suspense so the shell prerenders (cacheComponents).
 */
export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/workspace/clients"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← All clients
        </Link>
      </nav>
      <Suspense
        fallback={
          <div role="status" aria-label="Loading client">
            <span className="sr-only">Loading client…</span>
            <div aria-hidden="true">
              <ClientCardSkeleton />
            </div>
          </div>
        }
      >
        <ClientDetailBody params={params} />
      </Suspense>
    </div>
  );
}

function NotFoundCard({ copy }: { copy: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900">
          We couldn&apos;t find that client.
        </h1>
        <p className="text-sm leading-relaxed text-stone-600">{copy}</p>
      </div>
    </Card>
  );
}

async function ClientDetailBody({ params }: ClientDetailPageProps) {
  const { id } = await params;

  if (!isValidClientId(id)) {
    return (
      <NotFoundCard copy="The link may be outdated. Please return to your client list and try again." />
    );
  }
  if (!isSupabaseConfigured()) {
    return (
      <NotFoundCard copy="Client sync isn't set up yet. Please sign in once authentication is configured." />
    );
  }
  const supabase = await createServerSupabase();
  if (!supabase) {
    return (
      <NotFoundCard copy="Client sync isn't set up yet. Please sign in once authentication is configured." />
    );
  }
  // P0: one parallel batch. The session validation (auth.getUser), the
  // client lookup, and the follow-up list fire together, so the page pays
  // max(latency) instead of three sequential phases. proxy.ts still
  // route-guards; the getUser result below remains the page-level
  // authorization boundary. A follow-up read failure degrades to the
  // existing client-side fetch path (ClientFollowups shows its own
  // error + retry) instead of failing the whole page.
  const [userResponse, clientOutcome, followupRows] = await Promise.all([
    supabase.auth.getUser(),
    timed("supabase.clients.get", () => getClient(supabase, id), {
      route: "/workspace/clients/[id]",
    }).then(
      (value: StoredRadarClient) => ({ status: "ok" as const, value }),
      (error: unknown) => ({ status: "error" as const, error }),
    ),
    timed("supabase.followups.list-for-client", () => listFollowupsForClient(supabase, id), {
      route: "/workspace/clients/[id]",
      rowsOf: (rows) => rows.length,
    }).then(
      (value: StoredFollowup[]) => value,
      () => undefined,
    ),
  ]);
  const user = userResponse.data.user;
  if (!user) {
    // Proxy normally bounces signed-out sessions to /login first.
    redirect("/login?next=%2Fworkspace%2Fclients");
  }

  if (clientOutcome.status === "error") {
    const copy =
      clientOutcome.error instanceof RadarStoreError
        ? clientOutcome.error.message
        : "We couldn't find that client.";
    return <NotFoundCard copy={copy} />;
  }
  return <ClientDetail stored={clientOutcome.value} initialFollowups={followupRows} />;
}
