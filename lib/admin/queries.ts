import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

/**
 * Centralized privileged admin reads (P0, read-only).
 *
 * Every public function enforces `requireAdmin()` FIRST, then reads through
 * the server-only service-role client. This module must never be imported
 * from client components — all callers are server components or route
 * handlers under `app/admin/**` / `app/api/admin/**`.
 */

export interface WtpSuggestionSummary {
  id: string;
  createdAt: string;
  userId: string | null;
  email: string | null;
  country: string;
  profession: string;
  clientCountBand: string;
  priceBand: string;
  messageExcerpt: string | null;
}

export interface FrequencyEntry {
  value: string;
  count: number;
}

export interface OverviewMetrics {
  totalUsers: number;
  newUsers7d: number;
  totalSubmissions: number;
  identifiedSubmissions: number;
  anonymousSubmissions: number;
  multiSubmitters: number;
  topFeatures: FrequencyEntry[];
  topProfessions: FrequencyEntry[];
  topCountries: FrequencyEntry[];
  priceBandMix: FrequencyEntry[];
}

interface WtpRow {
  id: string;
  created_at: string;
  user_id: string | null;
  email: string | null;
  country: string;
  profession: string;
  client_count_band: string;
  price_band: string;
  desired_features: string[] | null;
  message: string | null;
}

const MAX_WTP_ROWS = 1000;
const MAX_USER_PAGES = 10;
const USERS_PER_PAGE = 100;

function top(entries: Map<string, number>, limit: number): FrequencyEntry[] {
  return [...entries.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function toSummary(row: WtpRow): WtpSuggestionSummary {
  const message = row.message?.trim() ?? "";
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    email: row.email,
    country: row.country,
    profession: row.profession,
    clientCountBand: row.client_count_band,
    priceBand: row.price_band,
    messageExcerpt: message.length > 0 ? message.slice(0, 140) : null,
  };
}

/** Privileged client, only after the admin gate passes. Never exposed. */
async function adminClient() {
  await requireAdmin();
  return createAdminServiceClient();
}

async function fetchAllWtpRows(service: ReturnType<typeof createAdminServiceClient>) {
  const { data, error } = await service
    .from("wtp_interest")
    .select(
      "id,created_at,user_id,email,country,profession,client_count_band,price_band,desired_features,message",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_WTP_ROWS);
  if (error) throw new Error("Could not load research submissions.");
  return (data ?? []) as WtpRow[];
}

/**
 * Overview metrics computed only from reliably available data:
 * auth user counts/ages + wtp_interest rows. No DAU/MAU, retention, or
 * revenue claims — that data does not exist.
 */
export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const service = await adminClient();

  // Auth directory (paginated Admin API; P0 caps at 1000 users).
  let totalUsers = 0;
  let newUsers7d = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });
    if (error) throw new Error("Could not load user directory.");
    const users = data.users ?? [];
    totalUsers += users.length;
    for (const u of users) {
      const created = u.created_at ? Date.parse(u.created_at) : NaN;
      if (Number.isFinite(created) && created >= weekAgo) newUsers7d += 1;
    }
    if (users.length < USERS_PER_PAGE) break;
  }

  const rows = await fetchAllWtpRows(service);
  let identified = 0;
  const perUser = new Map<string, number>();
  const features = new Map<string, number>();
  const professions = new Map<string, number>();
  const countries = new Map<string, number>();
  const priceBands = new Map<string, number>();
  for (const row of rows) {
    if (row.user_id) {
      identified += 1;
      perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + 1);
    }
    professions.set(row.profession, (professions.get(row.profession) ?? 0) + 1);
    countries.set(row.country, (countries.get(row.country) ?? 0) + 1);
    priceBands.set(row.price_band, (priceBands.get(row.price_band) ?? 0) + 1);
    for (const f of row.desired_features ?? []) {
      features.set(f, (features.get(f) ?? 0) + 1);
    }
  }
  let multiSubmitters = 0;
  for (const count of perUser.values()) {
    if (count > 1) multiSubmitters += 1;
  }

  return {
    totalUsers,
    newUsers7d,
    totalSubmissions: rows.length,
    identifiedSubmissions: identified,
    anonymousSubmissions: rows.length - identified,
    multiSubmitters,
    topFeatures: top(features, 8),
    topProfessions: top(professions, 8),
    topCountries: top(countries, 8),
    priceBandMix: top(priceBands, 8),
  };
}

/** Most recent research submissions (read-only, newest first). */
export async function getRecentSuggestions(limit = 20): Promise<WtpSuggestionSummary[]> {
  const service = await adminClient();
  const { data, error } = await service
    .from("wtp_interest")
    .select(
      "id,created_at,user_id,email,country,profession,client_count_band,price_band,desired_features,message",
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error("Could not load recent submissions.");
  return ((data ?? []) as WtpRow[]).map(toSummary);
}
