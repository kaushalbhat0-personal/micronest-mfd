import type { Metadata } from "next";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Clients — MFD Relationship Workspace",
  description: "Your client relationship list. Search, add, and maintain client relationships.",
};

/**
 * Clients shell (RCCF-MFD-18 Phase A).
 * No CRUD, no fake clients, no new persistence — clearly labeled placeholder.
 */
export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">Clients</h1>
        <p className="text-sm leading-relaxed text-stone-600">Your client relationship list.</p>
      </section>

      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-stone-900">Client management arrives next.</p>
          <p className="text-sm leading-relaxed text-stone-600">
            Search, all clients, and Add Client will live here — using the same seven relationship
            fields as today (name, mobile, investment type, last invested, last contacted, new
            client, note).
          </p>
          <p className="text-xs leading-relaxed text-stone-500">
            No client data is shown yet. Nothing here is stored or sent anywhere.
          </p>
        </div>
      </Card>
    </div>
  );
}
