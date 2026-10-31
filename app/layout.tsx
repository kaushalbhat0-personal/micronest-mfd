import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";
import { NativeAppProvider } from "@/lib/native/provider";
import { NativeRouteGuard } from "@/lib/native/guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "MicroNest MFD",
  description:
    "One focused place that helps mutual fund distributors maintain client relationships every day. Works alongside your existing financial software.",
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
          <div className="mx-auto max-w-7xl px-4 py-4 text-xs leading-relaxed text-stone-500 sm:px-6 lg:px-8">
            Operational microtools that work alongside your existing financial software. Nothing
            here replaces your main record. Do not enter PAN, Aadhaar, bank, OTP or password
            details in any tool.
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
