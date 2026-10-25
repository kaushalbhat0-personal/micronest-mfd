import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/guard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";

export const metadata: Metadata = {
  title: "Sign in — MicroNest MFD Workspace",
  description:
    "Sign in with Google to open your MFD Relationship Workspace on your laptop and phone.",
};

const ERROR_COPY: Record<string, string> = {
  exchange: "Google sign-in couldn't be completed. Please try again.",
  config: "Sign-in isn't available right now. Please try again later.",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

/** Runtime searchParams access streams behind Suspense (cacheComponents). */
async function LoginCard({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const configured = isSupabaseConfigured();
  const errorCopy = params.error ? (ERROR_COPY[params.error] ?? ERROR_COPY.exchange) : null;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <GoogleSignInButton next={next} disabled={!configured} />
        {errorCopy && (
          <p role="alert" className="text-xs font-medium text-red-700">
            {errorCopy}
          </p>
        )}
        {!configured && (
          <p className="text-xs leading-relaxed text-stone-500">
            Sign-in isn&apos;t set up yet. The tools below keep working without an account.
          </p>
        )}
        <p className="text-xs leading-relaxed text-stone-500">
          We use your Google account only to sign you in. Your client data stays private to your
          account — never sold, never shared, never used for AI.
        </p>
      </div>
    </Card>
  );
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          ← Home
        </Link>
      </nav>
      <section className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">Sign in</h1>
        <p className="text-sm leading-relaxed text-stone-600">
          Sign in to open your MFD Relationship Workspace on your laptop and phone.
        </p>
      </section>
      <Suspense
        fallback={
          <Card>
            <p className="text-sm text-stone-500">Loading sign-in…</p>
          </Card>
        }
      >
        <LoginCard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
