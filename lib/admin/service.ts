import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

/**
 * Privileged Supabase client for the internal Super Admin surface (P0).
 *
 * Reads are cross-user (wtp_interest, aggregates, auth.admin.listUsers) and
 * therefore MUST bypass RLS via the service-role key. This module is
 * server-only: importing it from browser code fails at build time
 * (`server-only`), and the runtime guard below fails closed if a client
 * bundle ever reaches it.
 *
 * Rules:
 * - Never import from `"use client"` components, customer features, or
 *   `lib/supabase/*`.
 * - Only import from server modules under `lib/admin/**`, `app/admin/**`,
 *   or `app/api/admin/**` — and only AFTER `requireAdmin()` succeeds.
 * - The key lives in `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`),
 *   never enters response payloads, cookies, URLs, or HTML.
 */
export function supabaseServiceKey(): string | null {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return value && value.length > 0 ? value : null;
}

/** True only when privileged admin reads are possible. */
export function isAdminServiceConfigured(): boolean {
  return supabaseUrl() !== null && supabaseServiceKey() !== null;
}

/**
 * Create the privileged service client. Throws when called in the browser
 * or when configuration is missing — callers must handle the throw as
 * "admin unavailable", never fall back to a weaker credential.
 */
export function createAdminServiceClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("Admin service client must never run in the browser.");
  }
  const url = supabaseUrl();
  const serviceKey = supabaseServiceKey();
  if (!url || !serviceKey) {
    throw new Error("Admin data access is not configured.");
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
