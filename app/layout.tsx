import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
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
        <SiteHeader />
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
