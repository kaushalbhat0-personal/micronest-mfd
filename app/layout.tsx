import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";
import { NativeAppProvider } from "@/lib/native/provider";
import { NativeRouteGuard } from "@/lib/native/guard";
import { siteUrl } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "MicroNest",
  description:
    "MicroNest is a simple relationship workspace for people who manage clients — including mutual fund distributors.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "MicroNest",
  },
  twitter: {
    card: "summary",
  },
};

/**
 * Mobile-shell viewport (MFD-64 release prep).
 * viewport-fit=cover activates the env(safe-area-inset-*) handling already
 * in globals.css / mobile bottom nav — without it, notched devices report
 * zero insets. theme-color matches the app background token (--app-bg).
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#faf7f2",
};

/**
 * Static header shell for prerendering (RCCF-MFD-43). The live header reads
 * the route for active navigation, so it streams in after the shell.
 */
function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 lg:min-h-16">
          <BrandMark href="/" />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <Suspense fallback={<SiteHeaderFallback />}>
          <SiteHeader />
        </Suspense>
        {/* MFD-64 P0: single native lifecycle/deep-link boundary + native-only
            route guard. Both no-op on web; see lib/native/*. */}
        <NativeAppProvider>
          <NativeRouteGuard>
            <main
              id="main"
              className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
            >
              {children}
            </main>
          </NativeRouteGuard>
        </NativeAppProvider>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs leading-relaxed text-stone-500 sm:px-6 lg:px-8">
            <p>
              Operational microtools that work alongside your existing financial software. Nothing
              here replaces your main record. Do not enter ID numbers, bank, OTP or password
              details in any tool.
            </p>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
              <Link
                href="/privacy"
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Terms
              </Link>
              <Link
                href="/support"
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Support
              </Link>
              <Link
                href="/premium"
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Help shape MicroNest
              </Link>
            </nav>
          </div>
        </footer>
        {/* Web Analytics + Speed Insights: async scripts managed by Vercel.
            Page views and Web Vitals only — no custom events, no PII. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
