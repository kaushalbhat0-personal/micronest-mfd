"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface GoogleSignInButtonProps {
  next: string;
  disabled?: boolean;
}

/** Single user-initiated Google OAuth handoff. No passwords, no forms. */
export function GoogleSignInButton({ next, disabled }: GoogleSignInButtonProps) {
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  async function handleClick() {
    setPending(true);
    setFailed(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={disabled || pending} className="w-full">
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {failed && (
        <p role="alert" className="text-xs font-medium text-red-700">
          Google sign-in didn&apos;t start. Please try again.
        </p>
      )}
    </div>
  );
}
