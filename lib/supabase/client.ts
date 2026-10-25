"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Browser Supabase client for user-initiated auth actions only
 * (Google sign-in, sign out). Cookie session, no tokens in localStorage.
 * Throws a plain message when auth isn't configured — callers render the
 * "not set up yet" state instead of calling this.
 */
export function createClient() {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Authentication is not configured yet.");
  }
  return createBrowserClient(url, anonKey);
}
