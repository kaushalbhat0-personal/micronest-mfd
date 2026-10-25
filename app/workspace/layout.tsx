import { Suspense } from "react";
import Link from "next/link";
import { WorkspaceNav, WorkspaceNavFallback } from "@/components/workspace-nav";
import { Card } from "@/components/ui/card";
import { RadarIdentity } from "@/features/auth/components/radar-identity";

/**
 * Authenticated workspace shell (RCCF-MFD-18 Phase A).
 * Route protection itself lives in proxy.ts; the identity affordance below
 * is defense in depth and streams behind Suspense (cacheComponents).
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Suspense fallback={<WorkspaceNavFallback />}>
          <WorkspaceNav />
        </Suspense>
        <Suspense fallback={<span className="min-h-[44px]" aria-hidden="true" />}>
          <RadarIdentity />
        </Suspense>
      </div>
      {children}
      <Card>
        <p className="text-xs leading-relaxed text-stone-500">
          Your workspace is private to your signed-in account and works alongside your existing
          financial software. Do not enter PAN, Aadhaar, bank, OTP or password details.{" "}
          <Link
            href="/tools/message-studio"
            className="font-medium text-emerald-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
          >
            Message Studio
          </Link>{" "}
          remains available without an account.
        </p>
      </Card>
    </div>
  );
}
