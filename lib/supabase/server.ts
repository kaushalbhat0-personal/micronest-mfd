import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Server Supabase client for Server Components and Route Handlers.
 * Reads the cookie session set by the OAuth callback; never touches
 * localStorage and never uses the service-role key.
 * Returns null when auth isn't configured so pages can degrade gracefully.
 */
export async function createServerSupabase() {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh happens in proxy.ts instead.
        }
      },
    },
  });
}
