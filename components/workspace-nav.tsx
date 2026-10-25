"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/workspace/today", label: "Today" },
  { href: "/workspace/clients", label: "Clients" },
] as const;

/**
 * Static fallback for prerender: same labels, no active state.
 * Contains no client hooks so the shell prerenders (cacheComponents).
 */
export function WorkspaceNavFallback() {
  return (
    <nav aria-label="Workspace" className="flex items-center gap-1">
      {TABS.map((tab) => (
        <span
          key={tab.href}
          className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-medium text-emerald-900"
        >
          {tab.label}
        </span>
      ))}
    </nav>
  );
}

/**
 * Authenticated workspace sub-navigation (RCCF-MFD-18 Phase A).
 * Two destinations only — follow-ups and messages are contextual actions,
 * never navigation items. All targets meet the 44px touch minimum.
 * Reads the pathname, so callers must render it inside Suspense (see shell).
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/workspace/today"
            ? pathname === "/workspace/today" || pathname === "/workspace"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
              active ? "bg-emerald-900 text-white" : "text-emerald-900 hover:bg-emerald-50",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
