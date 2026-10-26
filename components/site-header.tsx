"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { ChevronDownIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

interface SessionIdentity {
  email: string;
  displayName: string;
}

function identityFrom(email: string | undefined, fullName: unknown): SessionIdentity | null {
  if (!email) return null;
  const name = typeof fullName === "string" && fullName.trim().length > 0 ? fullName.trim() : email;
  return { email, displayName: name };
}

/**
 * Site header with auth-aware navigation (RCCF-MFD-41).
 * Signed out: brand · Workspace / Message Studio · Sign in.
 * Signed in: brand · Today / Clients / Message Studio · avatar menu.
 * Renders the signed-out variant until the session resolves, so the
 * static prerender and the unconfigured-Supabase E2E mode stay stable.
 */
export function SiteHeader() {
  const router = useRouter();
  const [identity, setIdentity] = React.useState<SessionIdentity | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setIdentity(
          identityFrom(data.user?.email ?? undefined, data.user?.user_metadata?.full_name),
        );
      })
      .catch(() => {
        if (active) setIdentity(null);
      });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentity(
        identityFrom(session?.user?.email ?? undefined, session?.user?.user_metadata?.full_name),
      );
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Even if sign-out fails, leave for the public home page.
    } finally {
      setMenuOpen(false);
      router.push("/");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6 lg:flex-nowrap lg:px-8">
        <Link
          href={identity ? "/workspace/today" : "/"}
          className="inline-flex min-h-[44px] shrink-0 items-center text-base font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          MicroNest <span className="font-normal text-stone-600">· MFD Workspace</span>
        </Link>
        {identity ? (
          <>
            <nav
              aria-label="Primary"
              className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1 sm:justify-center"
            >
              <Link
                href="/workspace/today"
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Today
              </Link>
              <Link
                href="/workspace/clients"
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Clients
              </Link>
              <Link
                href="/tools/message-studio"
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Message Studio
              </Link>
            </nav>
            <div
              className="relative order-2 ml-auto flex shrink-0 items-center sm:order-3"
              ref={menuRef}
            >
              <button
                ref={buttonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account: ${identity.displayName}`}
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                <ClientAvatar name={identity.displayName} className="h-8 w-8 text-xs" />
                <ChevronDownIcon
                  aria-hidden="true"
                  className={`h-4 w-4 text-stone-600 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute top-full right-0 z-10 mt-1 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-md"
                >
                  <p className="truncate px-3 pt-2 pb-1 text-sm font-semibold text-stone-900">
                    {identity.displayName}
                  </p>
                  <p className="truncate px-3 pb-2 text-xs text-stone-600" title={identity.email}>
                    {identity.email}
                  </p>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <nav
              aria-label="Primary"
              className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1 sm:justify-center"
            >
              <Link
                href="/workspace/today"
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Workspace
              </Link>
              <Link
                href="/tools/message-studio"
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Message Studio
              </Link>
            </nav>
            <div className="order-2 ml-auto flex shrink-0 items-center sm:order-3">
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-900 px-4 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
