import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { loginUrlFor } from "@/lib/auth/guard";
import { requireAdmin } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin — MicroNest",
  description: "Internal MicroNest operations overview. Not indexed.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Internal admin shell (P0, read-only).
 *
 * Always rendered dynamically: every request carries a different session
 * and this subtree must never be statically prerendered.
 *
 * Authorization: signed-out sessions redirect to login (proxy.ts also
 * bounces them); signed-in non-admins and revoked admins get `notFound()`
 * so the surface reveals nothing beyond what is unavoidable. Hiding the
 * navigation is UX only — every page and query re-checks `requireAdmin()`.
 */
export const instant = false;
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const userId = (await supabase?.auth.getUser())?.data.user?.id ?? null;
  if (!userId) {
    redirect(loginUrlFor("/admin"));
  }
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_1fr] lg:gap-7">
      <nav
        aria-label="Admin sections"
        className="flex gap-2 overflow-x-auto rounded-xl border border-stone-200 bg-white p-2 shadow-sm lg:flex-col lg:overflow-visible"
      >
        <Link
          href="/admin"
          aria-current="page"
          className="min-h-[44px] shrink-0 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900"
        >
          Overview
        </Link>
        <Link
          href="/admin/users"
          className="min-h-[44px] shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Users
        </Link>
        <Link
          href="/admin/suggestions"
          className="min-h-[44px] shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Suggestions
        </Link>
      </nav>
      <div className={cn("flex min-w-0 flex-col gap-5")}>{children}</div>
    </div>
  );
}
