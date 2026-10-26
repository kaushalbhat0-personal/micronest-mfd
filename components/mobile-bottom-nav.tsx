import * as React from "react";
import Link from "next/link";
import { DotsIcon, MessageIcon, SunIcon, UsersIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { NavDestination } from "@/lib/nav";

const ITEM_BASE =
  "relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-inset";

/**
 * Fixed mobile bottom navigation for authenticated workspace users
 * (RCCF-MFD-43). Icon + visible text label on every destination, active
 * state via weight + indicator + aria-current (never color alone).
 * Rendered only below the md breakpoint; desktop never sees it.
 */
export function MobileBottomNav({
  active,
  sheetOpen,
  moreButtonRef,
  onMore,
}: {
  active: NavDestination;
  sheetOpen: boolean;
  moreButtonRef: React.RefObject<HTMLButtonElement | null>;
  onMore: () => void;
}) {
  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-4 gap-1 px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]">
        <Link
          href="/workspace/today"
          aria-current={active === "today" ? "page" : undefined}
          className={cn(
            ITEM_BASE,
            active === "today"
              ? "font-semibold text-emerald-900"
              : "font-medium text-stone-500 hover:text-stone-800",
          )}
        >
          {active === "today" && (
            <span
              aria-hidden="true"
              className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-900"
            />
          )}
          <SunIcon aria-hidden="true" className="h-5 w-5" />
          Today
        </Link>
        <Link
          href="/workspace/clients"
          aria-current={active === "clients" ? "page" : undefined}
          className={cn(
            ITEM_BASE,
            active === "clients"
              ? "font-semibold text-emerald-900"
              : "font-medium text-stone-500 hover:text-stone-800",
          )}
        >
          {active === "clients" && (
            <span
              aria-hidden="true"
              className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-900"
            />
          )}
          <UsersIcon aria-hidden="true" className="h-5 w-5" />
          Clients
        </Link>
        <Link
          href="/tools/message-studio"
          aria-label="Message Studio"
          aria-current={active === "studio" ? "page" : undefined}
          className={cn(
            ITEM_BASE,
            active === "studio"
              ? "font-semibold text-emerald-900"
              : "font-medium text-stone-500 hover:text-stone-800",
          )}
        >
          {active === "studio" && (
            <span
              aria-hidden="true"
              className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-900"
            />
          )}
          <MessageIcon aria-hidden="true" className="h-5 w-5" />
          Studio
        </Link>
        <button
          ref={moreButtonRef}
          type="button"
          aria-expanded={sheetOpen}
          aria-controls="account-sheet"
          onClick={onMore}
          className={cn(
            ITEM_BASE,
            sheetOpen
              ? "font-semibold text-emerald-900"
              : "font-medium text-stone-500 hover:text-stone-800",
          )}
        >
          {sheetOpen && (
            <span
              aria-hidden="true"
              className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-900"
            />
          )}
          <DotsIcon aria-hidden="true" className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
