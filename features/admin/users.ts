/**
 * Pure user-directory model for the admin Users workspace (P1B).
 *
 * No Supabase, server-only, browser, or React imports — safe for server
 * components and unit tests. Auth users come from the Supabase Auth Admin
 * API (not Postgres), so search/filter/pagination semantics here are
 * intentionally bounded and honest: search runs over a capped account
 * window, never a true server-side user index.
 */

import { MAX_ADMIN_PAGE } from "@/features/admin/filters";

/** Users per admin directory page (UI pagination over the bounded window). */
export const USER_PAGE_SIZE = 25;

/**
 * Safety ceiling for the bounded account window: the directory never pulls
 * more Auth users than this per render, so an unexpectedly large dataset
 * cannot produce an unbounded server request.
 */
export const MAX_ADMIN_USERS_WINDOW = 5000;

/** Auth API page size used while filling the bounded window. */
export const USERS_PER_AUTH_CALL = 1000;

/** Search box bound: keeps URLs shareable. */
export const MAX_USER_QUERY_LENGTH = 120;

/** Chunk size for batched `.in("user_id", ids)` usage aggregation. */
export const USER_AGGREGATION_CHUNK_SIZE = 50;

export type UserUsageFilter = "all" | "has-clients" | "has-followups" | "has-submissions";

export const USER_USAGE_FILTERS: readonly UserUsageFilter[] = [
  "all",
  "has-clients",
  "has-followups",
  "has-submissions",
];

export interface UserFilters {
  q: string;
  usage: UserUsageFilter;
  page: number;
}

export const EMPTY_USER_FILTERS: UserFilters = {
  q: "",
  usage: "all",
  page: 1,
};

/** Minimal Auth Admin API user shape consumed by the directory. */
export interface AdminApiUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  created_at: string;
  last_sign_in_at?: string | null;
}

export interface UserSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  clientCount: number;
  openFollowupCount: number;
  completedFollowupCount: number;
  submissionCount: number;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.length > 0 ? (value[0] ?? "") : "";
  return value ?? "";
}

/**
 * Normalize raw URL search params. Trims whitespace, clamps the query,
 * drops unknown usage filters, normalizes the page to [1, MAX_ADMIN_PAGE].
 */
export function parseUserSearchParams(
  params: Record<string, string | string[] | undefined>,
): UserFilters {
  const q = firstParam(params.q).trim().slice(0, MAX_USER_QUERY_LENGTH);
  const usageRaw = firstParam(params.usage).trim();
  const usage: UserUsageFilter =
    usageRaw === "has-clients" || usageRaw === "has-followups" || usageRaw === "has-submissions"
      ? usageRaw
      : "all";
  const pageRaw = Number.parseInt(firstParam(params.page).trim(), 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(Math.floor(pageRaw), MAX_ADMIN_PAGE) : 1;
  return { q, usage, page };
}

/**
 * Serialize filters to a query string, omitting defaults. Carries only
 * filter selections — never emails, names, or user ids.
 */
export function userFiltersToQuery(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.q.length > 0) params.set("q", filters.q);
  if (filters.usage !== "all") params.set("usage", filters.usage);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

/** Display name from Auth metadata, or null when absent/blank. Never invented. */
export function displayNameFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const fullName = (metadata as Record<string, unknown>).full_name;
  if (typeof fullName !== "string") return null;
  const trimmed = fullName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Count rows per non-null user_id. */
export function countByUserId(rows: Array<{ user_id: string | null }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id) continue;
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return counts;
}

export interface FollowupSplit {
  open: Map<string, number>;
  completed: Map<string, number>;
}

/** Split follow-up rows into open vs completed counts per user. */
export function splitFollowupsByUser(
  rows: Array<{ user_id: string | null; completed_at: string | null }>,
): FollowupSplit {
  const open = new Map<string, number>();
  const completed = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const target = row.completed_at ? completed : open;
    target.set(row.user_id, (target.get(row.user_id) ?? 0) + 1);
  }
  return { open, completed };
}

/** Case-insensitive email/display-name substring match over summaries. */
export function applyUserSearch(summaries: UserSummary[], q: string): UserSummary[] {
  const needle = q.trim().toLowerCase();
  if (needle.length === 0) return summaries;
  return summaries.filter((summary) => {
    const email = (summary.email ?? "").toLowerCase();
    const name = (summary.displayName ?? "").toLowerCase();
    return email.includes(needle) || name.includes(needle);
  });
}

/** Single-select usage filter over summaries with computed counts. */
export function applyUserUsageFilter(
  summaries: UserSummary[],
  usage: UserUsageFilter,
): UserSummary[] {
  switch (usage) {
    case "has-clients":
      return summaries.filter((s) => s.clientCount > 0);
    case "has-followups":
      return summaries.filter((s) => s.openFollowupCount > 0);
    case "has-submissions":
      return summaries.filter((s) => s.submissionCount > 0);
    case "all":
    default:
      return summaries;
  }
}

/** Join date for display, or an em dash when unparseable. */
export function formatJoinedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Last sign-in for display, or "Never" when absent. */
export function formatLastSignIn(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "Never";
  return new Date(time).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
