import Link from "next/link";
import { Card } from "@/components/ui/card";

/**
 * Authenticated workspace shell (RCCF-MFD-45 Phase A). Navigation lives
 * exclusively in the site header (desktop) and the mobile bottom nav —
 * no in-page pills, no second identity row. Route protection itself lives
 * in proxy.ts.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
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
