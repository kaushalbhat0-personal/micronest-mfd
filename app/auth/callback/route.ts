import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { isAdminWithToken } from "@/lib/admin/auth";
import {
  DEFAULT_POST_AUTH_PATH,
  resolvePostLoginDestination,
  safeNextPath,
} from "@/lib/auth/guard";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * OAuth callback: exchanges the authorization code for a cookie session,
 * then redirects to a validated same-origin path. Never renders provider
 * payloads or tokens — failures go back to /login with a generic code.
 *
 * Destination rule (`resolvePostLoginDestination`): an explicitly requested
 * safe path is honored for everyone; otherwise active admins land on
 * `/admin` and everyone else on the workspace. The membership check uses
 * the just-exchanged user JWT (the cookie adapter cannot see the fresh
 * session yet) — RLS stays the enforcement point, no service-role here.
 * Session cookies are collected during the exchange and applied to the
 * final redirect, whichever destination wins.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config", url.origin));
  }

  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          pendingCookies.push({ name, value, options });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    return NextResponse.redirect(new URL("/login?error=exchange", url.origin));
  }

  const rawNext = url.searchParams.get("next");
  const hasExplicitDestination =
    rawNext !== null && rawNext.length > 0 && safeNextPath(rawNext) !== DEFAULT_POST_AUTH_PATH;
  const destination = resolvePostLoginDestination(
    rawNext,
    hasExplicitDestination
      ? false
      : await isAdminWithToken({
          userId: data.user.id,
          accessToken: data.session.access_token,
        }),
  );
  const response = NextResponse.redirect(new URL(destination, url.origin));
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
