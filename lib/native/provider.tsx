"use client";

/**
 * MFD-64 P0 — single native lifecycle / deep-link integration point.
 *
 * Mounted once in RootLayout. No-ops entirely on web (isNative() false),
 * so browser behavior is unchanged. All Capacitor imports are dynamic so
 * SSR and unit tests never load native code.
 *
 * Responsibilities:
 * - appUrlOpen → native auth callback processing (single-claim idempotent)
 * - foreground resume → supabase session refresh (native only)
 * - anchor-click interception → external intent boundary (links.ts)
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { isNative, getWebBaseUrl } from "@/lib/native/runtime";
import { classifyUrl } from "@/lib/native/links";
import { parseNativeAuthCallback, claimAuthCodeOnce } from "@/lib/native/auth";

let providerMounted = false;

async function processNativeAuthCallback(url: string, router: ReturnType<typeof useRouter>) {
  const parsed = parseNativeAuthCallback(url);
  if (!parsed) return;
  if (!claimAuthCodeOnce(parsed.code)) return; // duplicate delivery → ignore
  try {
    const { createNativeClient } = await import("@/lib/native/session-store");
    const supabase = await createNativeClient();
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) {
      router.replace(`/login?error=exchange&next=${encodeURIComponent(parsed.next)}`);
      return;
    }
    // Clear sensitive callback material from navigation state.
    router.replace(parsed.next);
  } catch {
    router.replace("/login?error=exchange");
  }
}

async function openExternally(href: string) {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: href });
}

export function NativeAppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  React.useEffect(() => {
    if (!isNative()) return;
    if (providerMounted) return;
    providerMounted = true;

    let appListener: { remove: () => void } | null = null;
    let resumeListener: { remove: () => void } | null = null;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        // Initial launch deep link (cold start via micronest://).
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) void processNativeAuthCallback(launch.url, router);
        } catch {
          // No launch URL — normal start.
        }
        appListener = await App.addListener("appUrlOpen", (event: { url: string }) => {
          void processNativeAuthCallback(event.url, router);
        });
        resumeListener = await App.addListener("resume", async () => {
          try {
            const { createNativeClient } = await import("@/lib/native/session-store");
            const supabase = await createNativeClient();
            // Refresh on foreground; no-op when already fresh.
            await supabase.auth.getSession();
          } catch {
            // Offline on resume — pages render their existing error states.
          }
        });
      } catch {
        // Capacitor unavailable at runtime — stay in degraded web mode.
      }
    })();

    // Single anchor-click interception boundary for the native shell.
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      const kind = classifyUrl(href, getWebBaseUrl());
      if (kind === "internal" || kind === "auth-callback") return; // let the router handle it
      if (kind === "tel") return; // allow OS dialer handoff via default anchor nav
      if (kind === "whatsapp" || kind === "external-allowed") {
        event.preventDefault();
        void openExternally(href);
        return;
      }
      // "blocked": stop unknown/arbitrary URLs from leaving the app.
      event.preventDefault();
    };
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      appListener?.remove();
      resumeListener?.remove();
      providerMounted = false;
    };
  }, [router]);

  // Note: no usePathname() here — this provider must prerender statically.
  return <>{children}</>;
}
