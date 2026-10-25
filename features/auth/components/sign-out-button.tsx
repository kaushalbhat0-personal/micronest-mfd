"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/** Signs out via Supabase Auth, then lands on the public home page. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Even if sign-out fails, leave the protected page.
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" onClick={handleClick} disabled={pending} className="px-2">
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
