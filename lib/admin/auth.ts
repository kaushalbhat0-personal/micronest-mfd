import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Server-side admin authorization gate (P0).
 *
 * Source of truth: the `admin_users` table (one row per administrator,
 * `revoked_at IS NULL` = active). Flow is always:
 *
 * 1. Resolve the session with the normal anon server client.
 * 2. `auth.getUser()` — no user means unauthorized.
 * 3. Membership lookup with the SAME anon client (RLS self-read policy
 *    `admin_users_self_select`); a non-admin reads zero rows and learns
 *    nothing about other admins.
 * 4. Only after membership succeeds may callers create the service-role
 *    client and run privileged reads.
 *
 * The service-role client is NEVER used to decide authorization — it is
 * only the data-access credential used after this gate passes.
 */
export class AdminUnauthorized extends Error {
  constructor() {
    super("Admin access required.");
    this.name = "AdminUnauthorized";
  }
}

/** Session user id from the anon server client, or null when signed out. */
export const getSessionUserId: () => Promise<string | null> = cache(async () => {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
});

/**
 * True only when `userId` has an active (non-revoked) `admin_users` row.
 * Uses the anon server client — never the service-role client.
 *
 * Memoized per request: every `requireAdmin()` in one render pays a single
 * session + membership lookup instead of repeating both per query.
 */
export const isAdmin: (userId: string | null | undefined) => Promise<boolean> = cache(
  async (userId) => {
    if (!userId) return false;
    const supabase = await createServerSupabase();
    if (!supabase) return false;
    try {
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .limit(1);
      if (error) return false;
      return Array.isArray(data) && data.length > 0;
    } catch {
      return false;
    }
  },
);

/**
 * Membership check for the OAuth callback, where the session exists only
 * as the just-exchanged tokens (the cookie adapter cannot see them yet).
 * Runs the same `admin_users` predicate over PostgREST with the anon key
 * plus the server-observed user JWT — RLS stays the enforcement point,
 * no service-role involved, no client input trusted.
 */
export async function isAdminWithToken(args: {
  userId: string;
  accessToken: string;
}): Promise<boolean> {
  const { userId, accessToken } = args;
  if (!userId || !accessToken) return false;
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return false;
  try {
    const params = new URLSearchParams({
      select: "user_id",
      user_id: `eq.${userId}`,
      revoked_at: "is.null",
      limit: "1",
    });
    const response = await fetch(`${url}/rest/v1/admin_users?${params.toString()}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return false;
    const rows = (await response.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Require an active admin session. Returns the admin user id.
 * Throws `AdminUnauthorized` for signed-out, unknown, or revoked callers.
 * Admin pages/layouts translate this to login-redirect (signed out) or
 * `notFound()` (signed in) so no existence oracle is exposed.
 */
export async function requireAdmin(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new AdminUnauthorized();
  const ok = await isAdmin(userId);
  if (!ok) throw new AdminUnauthorized();
  return userId;
}
