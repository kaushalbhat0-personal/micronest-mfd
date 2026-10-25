import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { isValidClientId } from "@/lib/workspace/params";

export const metadata: Metadata = {
  title: "Client — MFD Relationship Workspace",
  description: "Focused client view: why this client matters and what to do next.",
};

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Client detail shell (RCCF-MFD-18 Phase A).
 * The opaque radar_clients id is the only URL input. Invalid ids render a
 * clean not-found state — raw errors are never exposed and the full detail
 * implementation belongs to Phase B. Param resolution streams behind
 * Suspense so the shell prerenders (cacheComponents).
 */
export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  return (
    <div className="flex flex-col gap-5">
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
          <Card>
            <p className="text-sm text-stone-500">Loading client…</p>
          </Card>
        }
      >
        <ClientDetailBody params={params} />
      </Suspense>
    </div>
  );
}

async function ClientDetailBody({ params }: ClientDetailPageProps) {
  const { id } = await params;

  if (!isValidClientId(id)) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">
            We couldn&apos;t find that client.
          </h1>
          <p className="text-sm leading-relaxed text-stone-600">
            The link may be outdated. Please return to your client list and try again.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">Client</h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Why this client matters — and what to do next.
        </p>
      </section>
      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-stone-900">Client detail arrives next.</p>
          <p className="text-sm leading-relaxed text-stone-600">
            Contact history, why this client is surfaced, call and message actions, follow-ups, and
            Mark Contacted will live here.
          </p>
          <p className="text-xs leading-relaxed text-stone-500">
            No client data is shown yet. Nothing here is stored or sent anywhere.
          </p>
        </div>
      </Card>
    </>
  );
}
