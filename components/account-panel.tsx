import * as React from "react";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { deleteAccountData } from "@/features/auth/actions";

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
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      const result = await deleteAccountData();
      if (!result.ok) {
        setDeleteError(result.error);
        setDeleting(false);
        return;
      }
      // Data is gone; sign out and leave the workspace (same path as
      // sign-out, so session state and caches reset identically).
      onSignOut();
    } catch {
      setDeleteError("Couldn't delete that data. Please try again.");
      setDeleting(false);
    }
  }

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
      {!confirmingDelete ? (
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setConfirmingDelete(true);
          }}
          className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
        >
          Delete account…
        </button>
      ) : (
        <div
          role="alertdialog"
          aria-label="Confirm account deletion"
          className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <p className="text-sm font-medium text-stone-900">
            Permanently delete all your clients and follow-ups?
          </p>
          <p className="text-xs leading-relaxed text-stone-600">
            This cannot be undone. You will be signed out.
          </p>
          {deleteError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {deleteError}
            </p>
          )}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteError(null);
              }}
              disabled={deleting}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep my data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
