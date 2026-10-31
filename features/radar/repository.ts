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

/** Columns the UI is allowed to read or write. Ownership stays in RLS.
 * is_new_client is intentionally absent (MFD-70): the lifecycle derives
 * New from dates, and the column keeps whatever value it has. */
const CLIENT_COLUMNS =
  "id,name,mobile,investment_type,sip_amount_paise,lumpsum_amount_paise,amount_paise,last_invested,last_contacted,note";

/**
 * Normalized client input for create/update — the eight relationship fields
 * the validator owns. Dates are YYYY-MM-DD or null; amounts are integer
 * paise or null. No id, no user_id, no timestamps, no signals: callers
 * never supply those.
 */
export interface ClientInput {
  name: string;
  phone: string;
  investmentType: InvestmentType;
  /** Optional monthly SIP figure in integer paise; null when absent. */
  sipAmountPaise: number | null;
  /** Optional recorded lumpsum figure in integer paise; null when absent. */
  lumpsumAmountPaise: number | null;
  lastInvested: string | null;
  lastContacted: string | null;
  note: string;
}

/**
 * Derives the legacy single amount_paise mirror from the two buckets so
 * older readers keep a meaningful value. SIP/Both read as the monthly SIP
 * figure (Both is never duplicated); Lumpsum/Insurance/Other read the
 * recorded figure. The database CHECK on the legacy column is unchanged.
 */
export function legacyAmountMirror(
  investmentType: InvestmentType,
  sipAmountPaise: number | null,
  lumpsumAmountPaise: number | null,
): number | null {
  if (investmentType === "SIP" || investmentType === "Both") return sipAmountPaise;
  if (investmentType === "Lumpsum") return lumpsumAmountPaise;
  return lumpsumAmountPaise ?? sipAmountPaise;
}

function toDbRow(input: ClientInput): Record<string, unknown> {
  return {
    name: input.name,
    mobile: input.phone,
    investment_type: input.investmentType,
    sip_amount_paise: input.sipAmountPaise,
    lumpsum_amount_paise: input.lumpsumAmountPaise,
    amount_paise: legacyAmountMirror(
      input.investmentType,
      input.sipAmountPaise,
      input.lumpsumAmountPaise,
    ),
    last_invested: input.lastInvested,
    last_contacted: input.lastContacted,
    note: input.note,
  };
}

/** Row shape as stored in Postgres (no derived data, no user_id exposure). */
export interface StoredRadarClient {
  id: string;
  name: string;
  phone: string;
  investmentType: InvestmentType;
  /** Monthly SIP figure in integer paise; null when absent. */
  sipAmountPaise: number | null;
  /** Recorded lumpsum figure in integer paise; null when absent. */
  lumpsumAmountPaise: number | null;
  /**
   * Legacy single-amount mirror, maintained on every write from the two
   * buckets (never written directly by the UI). Read-only for display
   * fallbacks; new code reads the buckets above.
   */
  amountPaise: number | null;
  lastInvested: string | null;
  lastContacted: string | null;
  note: string;
}

export type RadarStoreErrorCode = "auth" | "load" | "create" | "update" | "delete";

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
  sip_amount_paise: unknown;
  lumpsum_amount_paise: unknown;
  amount_paise: unknown;
  last_invested: unknown;
  last_contacted: unknown;
  note: unknown;
  /** Present on real rows; deliberately never read — ownership stays in RLS. */
  user_id?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Supabase may return BIGINT as a number or a decimal string; anything else
 * (including negatives and fractions) is treated as absent. The database
 * CHECK is the final guard; this keeps unknown shapes from crashing the UI.
 */
function asAmountPaise(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
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
    sipAmountPaise: asAmountPaise(row.sip_amount_paise),
    lumpsumAmountPaise: asAmountPaise(row.lumpsum_amount_paise),
    amountPaise: asAmountPaise(row.amount_paise),
    lastInvested: asDate(row.last_invested),
    lastContacted: asDate(row.last_contacted),
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
    sipAmountPaise: stored.sipAmountPaise,
    lumpsumAmountPaise: stored.lumpsumAmountPaise,
    lastInvested: stored.lastInvested,
    lastContacted: stored.lastContacted,
    note: stored.note,
    signals: computeSignals(
      {
        lastInvested: stored.lastInvested,
        lastContacted: stored.lastContacted,
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
      .select(CLIENT_COLUMNS)
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
 * Loads one owned client by id. Malformed ids and foreign/missing rows all
 * surface as the same safe "not found" load error — never a raw DB message,
 * and never a hint about which ids exist.
 */
export async function getClient(supabase: SupabaseClient, id: string): Promise<StoredRadarClient> {
  if (typeof id !== "string" || id.length === 0) {
    throw toStoreError("load", "We couldn't find that client.");
  }
  try {
    const result = await supabase.from(TABLE).select(CLIENT_COLUMNS).eq("id", id);
    if (result.error) {
      if (result.error.code === "PGRST301" || /jwt|auth/i.test(result.error.message)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("load", "We couldn't find that client.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("load", "We couldn't find that client.");
    }
    return toStoredClient(rows[0]);
  } catch (error) {
    if (error instanceof RadarStoreError) throw error;
    throw toStoreError("load", "We couldn't find that client.");
  }
}

/**
 * Creates one client for the authenticated user. Ownership is assigned by
 * the database/RLS from the session — the caller supplies no user_id.
 */
export async function createClient(
  supabase: SupabaseClient,
  input: ClientInput,
): Promise<StoredRadarClient> {
  try {
    const result = await supabase.from(TABLE).insert(toDbRow(input)).select(CLIENT_COLUMNS);
    if (result.error) {
      if (result.error.code === "PGRST301" || /jwt|auth/i.test(result.error.message)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("create", "Couldn't add that client. Please try again.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("create", "Couldn't add that client. Please try again.");
    }
    return toStoredClient(rows[0]);
  } catch (error) {
    if (error instanceof RadarStoreError) throw error;
    throw toStoreError("create", "Couldn't add that client. Please try again.");
  }
}

/**
 * Replaces the nine relationship fields of one owned record, addressed by
 * id only. RLS rejects rows the caller doesn't own (zero updated rows,
 * surfaced as an error — never silently accepted).
 */
export async function updateClient(
  supabase: SupabaseClient,
  id: string,
  input: ClientInput,
): Promise<StoredRadarClient> {
  try {
    const result = await supabase
      .from(TABLE)
      .update(toDbRow(input))
      .eq("id", id)
      .select(CLIENT_COLUMNS);
    if (result.error) {
      if (result.error.code === "PGRST301" || /jwt|auth/i.test(result.error.message)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("update", "Couldn't save those changes. Please try again.");
    }
    const rows = (result.data ?? []) as DbRow[];
    if (rows.length === 0) {
      throw toStoreError("update", "Couldn't save those changes. Please try again.");
    }
    return toStoredClient(rows[0]);
  } catch (error) {
    if (error instanceof RadarStoreError) throw error;
    throw toStoreError("update", "Couldn't save those changes. Please try again.");
  }
}

/**
 * Deletes one owned record by id. The deleted row is selected back so an
 * RLS denial (zero rows) surfaces as an error instead of a silent no-op.
 * No undo-delete: the confirmation UI is the safety net.
 */
export async function deleteClient(supabase: SupabaseClient, id: string): Promise<void> {
  try {
    const result = await supabase.from(TABLE).delete().eq("id", id).select("id");
    if (result.error) {
      if (result.error.code === "PGRST301" || /jwt|auth/i.test(result.error.message)) {
        throw toStoreError("auth", "Sign-in expired. Please sign in again.");
      }
      throw toStoreError("delete", "Couldn't delete that client. Please try again.");
    }
    const rows = (result.data ?? []) as Array<{ id: unknown }>;
    if (rows.length === 0) {
      throw toStoreError("delete", "Couldn't delete that client. Please try again.");
    }
  } catch (error) {
    if (error instanceof RadarStoreError) throw error;
    throw toStoreError("delete", "Couldn't delete that client. Please try again.");
  }
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
      .select(CLIENT_COLUMNS);
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
