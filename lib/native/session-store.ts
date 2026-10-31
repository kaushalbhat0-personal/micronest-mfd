/**
 * MFD-64 P0 — native session storage adapter.
 *
 * Web: Supabase SSR cookies (lib/supabase/client.ts) — untouched.
 * Native: Capacitor Preferences-backed storage implementing the
 * Supabase SupportedStorage interface ({ getItem, setItem, removeItem }).
 *
 * No client records or business data go here — auth session only.
 * The existing UI-preference key mfd-ms-prefs-v1 stays in localStorage
 * and stays UI-only.
 */
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/** Minimal storage contract required by supabase-js auth. */
export interface NativeAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** localStorage shape check — used only to detect misuse in tests. */
export const NATIVE_STORAGE_FORBIDDEN_KEYS = ["sb-"] as const;

/**
 * Preferences-backed storage. Dynamically imports @capacitor/preferences
 * so unit tests and web SSR never load native code.
 */
export function createPreferencesStorage(): NativeAuthStorage {
  return {
    async getItem(key: string) {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value;
    },
    async setItem(key: string, value: string) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
    },
    async removeItem(key: string) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key });
    },
  };
}

/** In-memory storage for tests / fallback when Preferences is unavailable. */
export function createMemoryStorage(initial: Record<string, string> = {}): NativeAuthStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    async getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key: string, value: string) {
      map.set(key, value);
    },
    async removeItem(key: string) {
      map.delete(key);
    },
  };
}

/**
 * Create the native Supabase browser client:
 * persist + auto-refresh ON, detectSessionInUrl OFF (deep links are
 * handled manually via parseNativeAuthCallback, never via URL sniffing).
 */
export async function createNativeClient(storage?: NativeAuthStorage) {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Authentication is not configured yet.");
  }
  const { createBrowserClient } = await import("@supabase/ssr");
  return createBrowserClient(url, anonKey, {
    auth: {
      storage: storage ?? createPreferencesStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
