"use server";

import { revalidatePath } from "next/cache";

/**
 * Cross-route freshness boundary (RCCF-MFD cross-route sync audit).
 *
 * "I spoke to them" persists through the browser Supabase client and only
 * updated the originating workspace's local React state. The sibling
 * workspace (Today <-> Clients <-> Client Detail) kept rendering its
 * previously fetched server snapshot from the App Router cache, so the
 * pre-mutation attention count survived navigation until a hard refresh.
 *
 * Every client-side radar mutation calls this AFTER the repository write
 * succeeds (persist-first is unchanged) and BEFORE router.refresh(), so the
 * refresh re-fetches post-mutation rows and subsequent navigation to any
 * other workspace route cannot serve the pre-mutation payload. Domain
 * rules, sorting, signals, and RLS are untouched — this only retires
 * cached route representations.
 */
export async function revalidateWorkspace(): Promise<void> {
  revalidatePath("/workspace", "layout");
}
