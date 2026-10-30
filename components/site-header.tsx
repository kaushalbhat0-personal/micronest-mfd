"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AccountPanel } from "@/components/account-panel";
import { BrandMark } from "@/components/brand-mark";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { activeDestination } from "@/lib/nav";

interface SessionIdentity {
  email: string;
  displayName: string;
}

function identityFrom(email: string | undefined, fullName: unknown): SessionIdentity | null {
  if (!email) return null;
  const name = typeof fullName === "string" && fullName.trim().length > 0 ? fullName.trim() : email;
  return { email, displayName: name };
}

const TOP_LINK_BASE =
  "inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900";

function topLinkClass(isActive: boolean): string {
  return cn(
    TOP_LINK_BASE,
    isActive
      ? "bg-emerald-50 font-semibold text-emerald-900"
      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
  );
}

/**
 * Site header with premium brand + adaptive navigation (RCCF-MFD-43).
 * Signed out: MicroNest [MFD] · Workspace / Message Studio · Sign in.
 * Signed in: desktop/tablet top nav (Today / Client Book / Messages +
 * avatar menu); mobile compact brand bar + fixed bottom navigation with a
 * More sheet for account functions. Static prerender stays signed-out until
 * the session resolves.
 */
export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [identity, setIdentity] = React.useState<SessionIdentity | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const sheetTriggerRef = React.useRef<HTMLElement | null>(null);
  const mobileAvatarRef = React.useRef<HTMLButtonElement>(null);
  const moreButtonRef = React.useRef<HTMLButtonElement>(null);

  const active = activeDestination(pathname);

  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let activeFlag = true;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!activeFlag) return;
        setIdentity(
          identityFrom(data.user?.email ?? undefined, data.user?.user_metadata?.full_name),
        );
      })
      .catch(() => {
        if (activeFlag) setIdentity(null);
      });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentity(
        identityFrom(session?.user?.email ?? undefined, session?.user?.user_metadata?.full_name),
      );
    });
    return () => {
      activeFlag = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Reserve bottom space for the fixed mobile nav only while signed in, so
  // it can never cover client cards, buttons, forms, or dialogs.
  React.useEffect(() => {
    if (!identity) return;
    document.body.classList.add("has-mobile-nav");
    return () => {
      document.body.classList.remove("has-mobile-nav");
    };
  }, [identity]);

  React.useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
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

  function openSheet(trigger: HTMLElement | null) {
    sheetTriggerRef.current = trigger;
    setMenuOpen(false);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  React.useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSheetOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      sheetTriggerRef.current?.focus();
    };
  }, [sheetOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Even if sign-out fails, leave for the public home page.
    } finally {
      setMenuOpen(false);
      setSheetOpen(false);
      router.push("/");
      router.refresh();
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 lg:min-h-16">
            <BrandMark href={identity ? "/workspace/today" : "/"} />
            {identity ? (
              <>
                <nav
                  aria-label="Primary"
                  className="order-3 hidden w-full items-center gap-1 md:order-2 md:flex md:w-auto md:flex-1 lg:gap-2"
                >
                  <Link
                    href="/workspace/today"
                    aria-current={active === "today" ? "page" : undefined}
                    className={topLinkClass(active === "today")}
                  >
                    Today
                  </Link>
                  <Link
                    href="/workspace/clients"
                    aria-current={active === "clients" ? "page" : undefined}
                    className={topLinkClass(active === "clients")}
                  >
                    Client Book
                  </Link>
                  <Link
                    href="/tools/message-studio"
                    aria-current={active === "studio" ? "page" : undefined}
                    className={topLinkClass(active === "studio")}
                  >
                    Messages
                  </Link>
                </nav>
                {/* Mobile compact account access — opens the account sheet. */}
                <button
                  ref={mobileAvatarRef}
                  type="button"
                  onClick={() => openSheet(mobileAvatarRef.current)}
                  className="order-2 ml-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 md:hidden"
                >
                  <span aria-hidden="true">
                    <ClientAvatar name={identity.displayName} className="h-8 w-8 text-xs" />
                  </span>
                  <span className="sr-only">Account: {identity.displayName}</span>
                </button>
                {/* Desktop/tablet account dropdown. */}
                <div
                  className="relative order-2 ml-auto hidden shrink-0 items-center md:flex"
                  ref={menuRef}
                >
                  <button
                    ref={menuButtonRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((v) => !v)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
                  >
                    <span aria-hidden="true">
                      <ClientAvatar name={identity.displayName} className="h-8 w-8 text-xs" />
                    </span>
                    <span className="sr-only">Account: {identity.displayName}</span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={cn(
                        "h-4 w-4 text-stone-600 transition-transform",
                        menuOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      aria-label="Account"
                      className="absolute top-full right-0 z-10 mt-1 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-md"
                    >
                      <AccountPanel
                        displayName={identity.displayName}
                        email={identity.email}
                        signingOut={signingOut}
                        onSignOut={handleSignOut}
                        headingId="account-menu-heading"
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <nav
                  aria-label="Primary"
                  className="order-3 flex w-full items-center gap-1 sm:order-2 sm:w-auto sm:flex-1 sm:justify-center"
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
        </div>
      </header>
      {identity && (
        <MobileBottomNav
          active={active}
          sheetOpen={sheetOpen}
          moreButtonRef={moreButtonRef}
          onMore={() => (sheetOpen ? closeSheet() : openSheet(moreButtonRef.current))}
        />
      )}
      {identity && sheetOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close account menu"
            onClick={closeSheet}
            className="absolute inset-0 cursor-default bg-stone-900/40"
          />
          <div
            ref={sheetRef}
            id="account-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-sheet-heading"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-stone-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl focus-visible:outline-none"
          >
            <p
              id="account-sheet-heading"
              className="px-3 pt-1 pb-2 text-xs font-semibold tracking-[0.06em] text-stone-500 uppercase"
            >
              Account
            </p>
            <AccountPanel
              displayName={identity.displayName}
              email={identity.email}
              signingOut={signingOut}
              onSignOut={handleSignOut}
              headingId="account-sheet-user"
            />
          </div>
        </div>
      )}
    </>
  );
}
