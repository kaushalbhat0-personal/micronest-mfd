"use client";

/**
 * MFD-64 P0 — minimal client-side route guard for NATIVE runtime only.
 *
 * Web protection stays server-side (proxy.ts). This guard renders nothing
 * on web. Inside Capacitor it checks the native Supabase session and
 * bounces unauthenticated users to /login?next=<allowed path>.
 *
 * usePathname() lives in the inner component behind <Suspense> so static
 * prerendering never blocks on this client hook.
 */
import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNative } from "@/lib/native/runtime";
import { safeNativeNextPath } from "@/lib/native/auth";
import { isProtectedPath } from "@/lib/auth/guard";

function GuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Web and public routes never gate: checked starts true so no effect
  // setState is needed on those paths (lint: no set-state-in-effect).
  const needsGuard =
    typeof window !== "undefined" &&
    pathname != null &&
    isProtectedPath(pathname) &&
    isNative();
  const [checked, setChecked] = React.useState(!needsGuard);

  React.useEffect(() => {
    if (!needsGuard) return;
    let cancelled = false;
    (async () => {
      try {
        const { createNativeClient } = await import("@/lib/native/session-store");
        const supabase = await createNativeClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) {
          const next = safeNativeNextPath(pathname);
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        setChecked(true);
      } catch {
        if (!cancelled) {
          const next = safeNativeNextPath(pathname ?? "/workspace/today");
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsGuard, pathname, router]);

  if (!needsGuard) return <>{children}</>;
  if (!checked) return null; // avoid flashing protected data pre-session
  return <>{children}</>;
}

export function NativeRouteGuard({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <GuardInner>{children}</GuardInner>
    </Suspense>
  );
}
