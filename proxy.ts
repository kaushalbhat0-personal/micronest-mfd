import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, loginUrlFor, safeNextPath } from "./lib/auth/guard";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./lib/supabase/config";

/**
 * Session refresh + route protection (Next 16 `proxy` convention).
 *
 * When Supabase credentials are absent (local dev / E2E without a project),
 * requests pass through untouched: there is no session to validate and no
 * cloud data to protect, so failing open leaks nothing beyond the public
 * workspace shells. Production MUST configure the env vars (see
 * .env.example); with them present, /workspace/* strictly requires a session.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // A failing session lookup (outage, bad URL) is treated as signed out:
  // protected pages bounce to login, public pages keep working.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }
  const { pathname, search } = request.nextUrl;

  if (isProtectedPath(pathname) && !user) {
    return NextResponse.redirect(new URL(loginUrlFor(`${pathname}${search}`), request.url));
  }

  // Authenticated users don't need the login page — send them onward.
  if (pathname === "/login" && user) {
    return NextResponse.redirect(
      new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url),
    );
  }

  return response;
}

export const config = {
  matcher: ["/workspace/:path*", "/login"],
};
