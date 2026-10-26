import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MicroNest — MFD Relationship Workspace",
  description:
    "One focused workspace that helps Mutual Fund Distributors maintain client relationships every day. Works alongside your existing financial software.",
};

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
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6 lg:flex-nowrap lg:px-8">
            <Link
              href="/"
              className="inline-flex min-h-[44px] shrink-0 items-center text-base font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
            >
              MicroNest <span className="font-normal text-stone-500">· MFD Workspace</span>
            </Link>
            <nav
              aria-label="Primary"
              className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1 sm:justify-center lg:justify-center"
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
            <div className="order-2 ml-auto flex shrink-0 items-center sm:order-3">
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-900 px-4 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Sign in
              </Link>
            </div>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
        >
          {children}
        </main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 text-xs leading-relaxed text-stone-500 sm:px-6 lg:px-8">
            Operational microtools that work alongside your existing financial software. Nothing
            here replaces your system of record. Do not enter PAN, Aadhaar, bank, OTP or password
            details in any tool.
          </div>
        </footer>
      </body>
    </html>
  );
}
