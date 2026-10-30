import * as React from "react";
import { ClientAvatar } from "@/components/ui/client-avatar";

/**
 * Shared account identity + sign-out block (RCCF-MFD-43). Rendered in the
 * desktop account dropdown and in the mobile account sheet so both surfaces
 * stay identical. No new data — display name and email only.
 */
export function AccountPanel({
  displayName,
  email,
  signingOut,
  onSignOut,
  headingId,
}: {
  displayName: string;
  email: string;
  signingOut: boolean;
  onSignOut: () => void;
  headingId: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-3 px-3 pt-2 pb-1">
        <ClientAvatar name={displayName} className="h-10 w-10 text-sm" />
        <span className="flex min-w-0 flex-col">
          <span id={headingId} className="truncate text-sm font-semibold text-stone-900">
            {displayName}
          </span>
          <span className="truncate text-xs text-stone-600" title={email}>
            {email}
          </span>
        </span>
      </p>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
