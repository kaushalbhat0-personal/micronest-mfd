/**
 * Supabase configuration helpers. Reads public env only — never the
 * service-role key. Missing values mean "auth not set up yet", never a crash
 * at import time; callers decide how to degrade (see proxy.ts).
 */
export function supabaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return value && value.length > 0 ? value : null;
}

export function supabaseAnonKey(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return value && value.length > 0 ? value : null;
}

/** True only when the browser-safe Supabase credentials are present. */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl() !== null && supabaseAnonKey() !== null;
}
