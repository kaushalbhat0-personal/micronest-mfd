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
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-3">
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center text-base font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
            >
              MicroNest <span className="font-normal text-stone-500">· MFD Workspace</span>
            </Link>
            <nav aria-label="Primary" className="flex flex-wrap items-center justify-end gap-1">
              <Link
                href="/workspace/today"
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Workspace
              </Link>
              <Link
                href="/tools/message-studio"
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Message Studio
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
              >
                Sign in
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-4 text-xs leading-relaxed text-stone-500">
            Operational microtools that work alongside your existing financial software. Nothing
            here replaces your system of record. Do not enter PAN, Aadhaar, bank, OTP or password
            details in any tool.
          </div>
        </footer>
      </body>
    </html>
  );
}
