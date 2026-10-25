import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Deterministic test-only login for authenticated E2E (SUPABASE_E2E=stub).
 * Ensures a password test user exists (service-role admin API, server-side
 * only) and signs it in through the real Supabase session flow, setting the
 * same cookies a Google login would. 404s unless stub mode is enabled —
 * production and all other modes have no such endpoint.
 */
export async function POST(request: NextRequest) {
  if (process.env.SUPABASE_E2E !== "stub") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const serviceKey = process.env.SUPABASE_E2E_SERVICE_ROLE_KEY;
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!serviceKey || !url || !anonKey) {
    return NextResponse.json({ error: "Stub auth is not configured." }, { status: 503 });
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    email = body.email;
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error && !/already/i.test(created.error.message)) {
    return NextResponse.json({ error: "Stub setup failed." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: "Stub sign-in failed." }, { status: 500 });
  }
  return response;
}
