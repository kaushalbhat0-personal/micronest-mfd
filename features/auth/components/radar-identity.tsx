import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Authenticated identity affordance for the workspace shell. Streams
 * behind Suspense so the static shell prerenders (cacheComponents).
 * Defense in depth behind proxy.ts: signed-out sessions are bounced to
 * /login when auth is configured. Renders nothing pre-Supabase setup.
 */
export async function RadarIdentity() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) redirect("/login?next=%2Fworkspace%2Ftoday");

  const email = user.email ?? "Signed in";
  return (
    <div className="flex min-h-[44px] items-center gap-1 text-xs text-stone-500">
      <span className="max-w-[180px] truncate" title={email}>
        {email}
      </span>
      <SignOutButton />
    </div>
  );
}
