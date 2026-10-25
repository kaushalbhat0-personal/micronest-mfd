import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidClientId } from "@/lib/workspace/params";
import type { FollowupInput, StoredFollowup } from "./types";

/**
 * Persistence boundary for explicit follow-up tasks. All Supabase access
 * for the follow-ups feature goes through this module — never scattered
 * through components.
 *
 * Rules enforced here (in addition to database RLS, which is final):
 * - No user_id is ever accepted from callers. Ownership is derived from
 *   the authenticated session: the database fills user_id from its
 *   DEFAULT auth.uid(), and RLS rejects anything not owned.
 * - Status (overdue/today/upcoming) is never stored. Rows map to
 *   persistence records; status derives via getFollowUpStatus.
 * - Completing or reopening a follow-up never touches radar_clients.
 *   Follow-ups and reconnect signals stay orthogonal by construction:
 *   this module has no import of the radar tables at all.
 * - Errors are typed (FollowupStoreError); raw database errors never cross
 *   this boundary into the UI.
 */

const TABLE = "client_followups";

/** Columns the UI is allowed to read or write. Ownership stays in RLS. */
const FOLLOWUP_COLUMNS = "id,client_id,due_date,reason,note,completed_at,created_at";

export type FollowupStoreErrorCode = "auth" | "load" | "create" | "complete" | "reopen";

export class FollowupStoreError extends Error {
  readonly code: FollowupStoreErrorCode;
  constructor(code: FollowupStoreErrorCode, message: string) {
    super(message);
    this.name = "FollowupStoreError";
    this.code = code;
  }
}

interface DbRow {
  id: unknown;
  client_id: unknown;
  due_date: unknown;
  reason: unknown;
  note: unknown;
  completed_at: unknown;
  created_at: unknown;
  /** Present on real rows; deliberately never read — ownership stays in RLS. */
  user_id?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asTimestampOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Maps one database row to its persistence shape. No domain logic here. */
export function toStoredFollowup(row: DbRow): StoredFollowup {
  return {
    id: asText(row.id),
    clientId: asText(row.client_id),
    dueDate: asDate(row.due_date) ?? "",
    reason: asText(row.reason),
    note: asText(row.note),
    completedAt: asTimestampOrNull(row.completed_at),
    createdAt: asText(row.created_at),
  };
}

function toStoreError(code: FollowupStoreErrorCode, message: string): FollowupStoreError {
  return new FollowupStoreError(code, message);
}

function isAuthError(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST301" || /jwt|auth/i.test(error.message);
}

/**
 * Loads all open follow-ups visible to the authenticated user, ordered for
 * the attention queue (earliest due first, then earliest created). RLS
 * restricts visibility to owned rows — no user_id filter is sent or needed.
 */
export async function listOpenFollowups(supabase: SupabaseClient): Promise<StoredFollowup[]> {
  try {
    const result = await supabase
      .from(TABLE)
      .select(FOLLOWUP_COLUMNS)
      .is("completed_at", null)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (result.error) {
      if (isAuthError(result.error)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("load", "We couldn't load your follow-ups.");
    }
    return ((result.data ?? []) as DbRow[]).map(toStoredFollowup);
  } catch (error) {
    if (error instanceof FollowupStoreError) throw error;
    throw toStoreError("load", "We couldn't load your follow-ups.");
  }
}

/**
 * Loads open follow-ups for one client. Malformed ids and foreign/missing
 * clients surface as the same safe "not found" load error — never a raw DB
 * message, and never a hint about which ids exist. RLS remains authoritative
 * for foreign rows (zero rows, never an error leak).
 */
export async function listOpenFollowupsForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<StoredFollowup[]> {
  if (!isValidClientId(clientId)) {
    throw toStoreError("load", "We couldn't find those follow-ups.");
  }
  try {
    const result = await supabase
      .from(TABLE)
      .select(FOLLOWUP_COLUMNS)
      .eq("client_id", clientId)
      .is("completed_at", null)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (result.error) {
      if (isAuthError(result.error)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("load", "We couldn't find those follow-ups.");
    }
    return ((result.data ?? []) as DbRow[]).map(toStoredFollowup);
  } catch (error) {
    if (error instanceof FollowupStoreError) throw error;
    throw toStoreError("load", "We couldn't find those follow-ups.");
  }
}

/**
 * Loads every follow-up (open + completed) for one client in a single query.
 * Malformed ids surface as the same safe load error before any DB access.
 * RLS remains authoritative for ownership (foreign rows yield zero rows).
 * Ordering is enforced in code so the contract holds regardless of how the
 * database returns rows: open rows first (due_date ASC, created_at ASC),
 * completed rows second (completed_at DESC).
 */
export async function listFollowupsForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<StoredFollowup[]> {
  if (!isValidClientId(clientId)) {
    throw toStoreError("load", "We couldn't find those follow-ups.");
  }
  try {
    const result = await supabase
      .from(TABLE)
      .select(FOLLOWUP_COLUMNS)
      .eq("client_id", clientId)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("completed_at", { ascending: false });
    if (result.error) {
      if (isAuthError(result.error)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("load", "We couldn't find those follow-ups.");
    }
    const all = ((result.data ?? []) as DbRow[]).map(toStoredFollowup);
    const open = all
      .filter((row) => row.completedAt === null)
      .sort((a, b) => {
        if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
        return 0;
      });
    const completed = all
      .filter((row) => row.completedAt !== null)
      .sort((a, b) => {
        const left = a.completedAt ?? "";
        const right = b.completedAt ?? "";
        if (left === right) return 0;
        return left > right ? -1 : 1;
      });
    return [...open, ...completed];
  } catch (error) {
    if (error instanceof FollowupStoreError) throw error;
    throw toStoreError("load", "We couldn't find those follow-ups.");
  }
}

/**
 * Creates one follow-up for the authenticated user's client. Only the four
 * approved fields are sent — user_id is filled by the database default
 * (auth.uid()) and ownership is enforced by RLS, so a foreign client_id is
 * rejected as zero created rows, surfaced as a create error. Never touches
 * radar_clients: no last_contacted change, no signal side effects.
 */
export async function createFollowup(
  supabase: SupabaseClient,
  input: FollowupInput,
): Promise<StoredFollowup> {
  try {
    const result = await supabase
      .from(TABLE)
      .insert({
        client_id: input.clientId,
        due_date: input.dueDate,
        reason: input.reason,
        note: input.note,
      })
      .select(FOLLOWUP_COLUMNS);
    if (result.error) {
      if (isAuthError(result.error)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("create", "Couldn't add that follow-up. Please try again.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("create", "Couldn't add that follow-up. Please try again.");
    }
    return toStoredFollowup(rows[0]);
  } catch (error) {
    if (error instanceof FollowupStoreError) throw error;
    throw toStoreError("create", "Couldn't add that follow-up. Please try again.");
  }
}

/**
 * Marks one owned follow-up done by stamping completed_at. The stamp comes
 * from the client clock at call time; ordering only needs relative order,
 * not exact precision. RLS rejects rows the caller doesn't own (zero
 * updated rows, surfaced as a complete error — never silently accepted).
 * Never modifies the client or last_contacted.
 */
export async function completeFollowup(
  supabase: SupabaseClient,
  id: string,
): Promise<StoredFollowup> {
  try {
    const result = await supabase
      .from(TABLE)
      .update({ completed_at: new Date().toISOString() })
      .eq("id", id)
      .select(FOLLOWUP_COLUMNS);
    if (result.error) {
      if (isAuthError(result.error)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("complete", "Couldn't mark that follow-up done. Please try again.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("complete", "Couldn't mark that follow-up done. Please try again.");
    }
    return toStoredFollowup(rows[0]);
  } catch (error) {
    if (error instanceof FollowupStoreError) throw error;
    throw toStoreError("complete", "Couldn't mark that follow-up done. Please try again.");
  }
}

/**
 * Reopens one owned follow-up by clearing completed_at. This is the
 * persistence primitive for Undo — same row, no history table, no delete.
 * RLS rejects rows the caller doesn't own (zero updated rows, surfaced as
 * a reopen error). Never modifies the client or last_contacted.
 */
export async function reopenFollowup(
  supabase: SupabaseClient,
  id: string,
): Promise<StoredFollowup> {
  try {
    const result = await supabase
      .from(TABLE)
      .update({ completed_at: null })
      .eq("id", id)
      .select(FOLLOWUP_COLUMNS);
    if (result.error) {
      if (isAuthError(result.error)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("reopen", "Couldn't reopen that follow-up. Please try again.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("reopen", "Couldn't reopen that follow-up. Please try again.");
    }
    return toStoredFollowup(rows[0]);
  } catch (error) {
    if (error instanceof FollowupStoreError) throw error;
    throw toStoreError("reopen", "Couldn't reopen that follow-up. Please try again.");
  }
}
