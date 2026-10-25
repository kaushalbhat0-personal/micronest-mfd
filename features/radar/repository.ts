import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/whatsapp";
import { computeSignals, DEFAULT_RECONNECT_INTERVAL_DAYS } from "./signals";
import type { ClientRecord, InvestmentType } from "./types";

/**
 * Persistence boundary for Client Radar. All Supabase access for the radar
 * feature goes through this module — never scattered through components.
 *
 * Rules enforced here (in addition to database RLS, which is final):
 * - No user_id is ever accepted from callers. Reads rely on RLS; updates
 *   address rows by id only, and RLS rejects anything not owned.
 * - Signals are never stored. Rows map to domain records with signals
 *   recomputed via the existing domain engine.
 * - Errors are typed (RadarStoreError); raw database errors never cross
 *   this boundary into the UI.
 */

const TABLE = "radar_clients";

/** Row shape as stored in Postgres (no derived data, no user_id exposure). */
export interface StoredRadarClient {
  id: string;
  name: string;
  phone: string;
  investmentType: InvestmentType;
  lastInvested: string | null;
  lastContacted: string | null;
  isNewClient: boolean;
  note: string;
}

export type RadarStoreErrorCode = "auth" | "load" | "update";

export class RadarStoreError extends Error {
  readonly code: RadarStoreErrorCode;
  constructor(code: RadarStoreErrorCode, message: string) {
    super(message);
    this.name = "RadarStoreError";
    this.code = code;
  }
}

const INVESTMENT_TYPES: InvestmentType[] = ["SIP", "Lumpsum", "Both", "Insurance", "Other"];

function toInvestmentType(value: unknown): InvestmentType {
  return INVESTMENT_TYPES.includes(value as InvestmentType) ? (value as InvestmentType) : "Other";
}

interface DbRow {
  id: unknown;
  name: unknown;
  mobile: unknown;
  investment_type: unknown;
  last_invested: unknown;
  last_contacted: unknown;
  is_new_client: unknown;
  note: unknown;
  /** Present on real rows; deliberately never read — ownership stays in RLS. */
  user_id?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Maps one database row to its persistence shape. No domain logic here. */
export function toStoredClient(row: DbRow): StoredRadarClient {
  return {
    id: asText(row.id),
    name: asText(row.name),
    phone: asText(row.mobile),
    investmentType: toInvestmentType(row.investment_type),
    lastInvested: asDate(row.last_invested),
    lastContacted: asDate(row.last_contacted),
    isNewClient: row.is_new_client === true,
    note: asText(row.note),
  };
}

/**
 * Projects a stored client into the domain record: stable client-side order
 * index (database has no row_number column by design), phone validity
 * recomputed with the shared helper, signals via the domain engine.
 */
export function toClientRecord(
  stored: StoredRadarClient,
  index: number,
  todayYMD: string,
  reconnectIntervalDays: number = DEFAULT_RECONNECT_INTERVAL_DAYS,
): ClientRecord {
  const phoneValid = stored.phone.length > 0 && normalizePhone(stored.phone).ok;
  return {
    id: stored.id,
    rowNumber: index + 1,
    name: stored.name,
    phone: stored.phone,
    phoneValid,
    investmentType: stored.investmentType,
    lastInvested: stored.lastInvested,
    lastContacted: stored.lastContacted,
    isNewClient: stored.isNewClient,
    note: stored.note,
    signals: computeSignals(
      {
        lastInvested: stored.lastInvested,
        lastContacted: stored.lastContacted,
        isNewClient: stored.isNewClient,
      },
      todayYMD,
      reconnectIntervalDays,
    ),
  };
}

function toStoreError(code: RadarStoreErrorCode, message: string): RadarStoreError {
  return new RadarStoreError(code, message);
}

/**
 * Loads the authenticated user's radar clients in stable database order
 * (created_at, id). RLS restricts visibility to owned rows — no user_id
 * filter is sent or needed.
 */
export async function listClients(supabase: SupabaseClient): Promise<StoredRadarClient[]> {
  let rows: DbRow[] | null = null;
  try {
    const result = await supabase
      .from(TABLE)
      .select("id,name,mobile,investment_type,last_invested,last_contacted,is_new_client,note")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (result.error) {
      if (result.error.code === "PGRST301" || /jwt|auth/i.test(result.error.message)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("load", "We couldn't load your Client Radar.");
    }
    rows = (result.data ?? []) as DbRow[];
  } catch (error) {
    if (error instanceof RadarStoreError) throw error;
    throw toStoreError("load", "We couldn't load your Client Radar.");
  }
  return rows.map(toStoredClient);
}

/**
 * Persists Last Contacted for one owned record, addressed by id only.
 * A null value clears the date (used when undoing a Mark Contacted).
 * RLS rejects rows the caller doesn't own (returned as zero updated rows,
 * surfaced as an update error — never silently accepted).
 */
export async function updateLastContacted(
  supabase: SupabaseClient,
  id: string,
  lastContacted: string | null,
): Promise<StoredRadarClient> {
  try {
    const result = await supabase
      .from(TABLE)
      .update({ last_contacted: lastContacted })
      .eq("id", id)
      .select("id,name,mobile,investment_type,last_invested,last_contacted,is_new_client,note");
    if (result.error) {
      if (result.error.code === "PGRST301" || /jwt|auth/i.test(result.error.message)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("update", "Couldn't save that change. Please try again.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("update", "Couldn't save that change. Please try again.");
    }
    return toStoredClient(rows[0]);
  } catch (error) {
    if (error instanceof RadarStoreError) throw error;
    throw toStoreError("update", "Couldn't save that change. Please try again.");
  }
}
