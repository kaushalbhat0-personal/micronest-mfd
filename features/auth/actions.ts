"use server";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Account data deletion (MFD-72 Phase 1).
 *
 * Permanently deletes every radar_clients row owned by the signed-in user.
 * Follow-ups are removed by the database cascade (client_followups references
 * radar_clients on delete cascade; both tables are also scoped to auth.users
 * on delete cascade). Ownership is enforced by RLS exactly like every other
 * repository write — no user_id is accepted, no service-role key is used
 * (this project has none by design), and the browser never sees credentials.
 *
 * Limitation, stated honestly: without a service-role key the Supabase
 * auth.users identity row itself cannot be removed here. The caller signs
 * the user out after this succeeds, so the identity holds zero product
 * data. Removing the auth identity requires a service-role admin call and
 * is deferred until that credential exists.
 */
export async function deleteAccountData(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "Sign-in isn't configured." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  // RLS (radar_clients_owner_delete: auth.uid() = user_id) restricts this
  // to the caller's own rows — nothing else can be touched.
  const { error } = await supabase.from("radar_clients").delete().not("id", "is", null);
  if (error) return { ok: false, error: "Couldn't delete that data. Please try again." };
  return { ok: true };
}
