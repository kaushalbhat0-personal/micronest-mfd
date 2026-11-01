import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import {
  SUGGESTION_PAGE_SIZE,
  excerptMessage,
  isValidUuid,
  type SuggestionAuthStatus,
} from "@/features/admin/filters";
import {
  MAX_ADMIN_USERS_WINDOW,
  USERS_PER_AUTH_CALL,
  USER_AGGREGATION_CHUNK_SIZE,
  USER_PAGE_SIZE,
  applyUserSearch,
  applyUserUsageFilter,
  countByUserId,
  displayNameFromMetadata,
  splitFollowupsByUser,
  type AdminApiUser,
  type UserFilters,
  type UserSummary,
} from "@/features/admin/users";

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
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    email: row.email,
    country: row.country,
    profession: row.profession,
    clientCountBand: row.client_count_band,
    priceBand: row.price_band,
    messageExcerpt: excerptMessage(row.message),
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

export interface SuggestionListFilters {
  q: string;
  profession: string;
  country: string;
  countBand: string;
  priceBand: string;
  authStatus: SuggestionAuthStatus;
}

export interface SuggestionListPage {
  rows: WtpSuggestionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Escape a free-text query for use inside a PostgREST `or()` ilike list:
 * commas/parens would break the `or()` syntax, and `%_`<`\` are LIKE
 * wildcards/escapes. The returned pattern matches literally.
 */
function toLikePattern(q: string): string {
  return q.replace(/[,()]/g, "").replace(/([\\%_])/g, "\\$1");
}

/**
 * Paginated, filterable research submissions (newest first). Server-side
 * `.range()` window over the `wtp_interest.created_at` index — the full
 * dataset is never fetched. Filters map 1:1 to schema columns.
 */
export async function listSuggestions(
  filters: SuggestionListFilters,
  page: number,
): Promise<SuggestionListPage> {
  const service = await adminClient();
  const pageSize = SUGGESTION_PAGE_SIZE;
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = service
    .from("wtp_interest")
    .select(
      "id,created_at,user_id,email,country,profession,client_count_band,price_band,desired_features,message",
      { count: "exact" },
    );
  if (filters.profession.length > 0) query = query.eq("profession", filters.profession);
  if (filters.country.length > 0) query = query.eq("country", filters.country);
  if (filters.countBand.length > 0) query = query.eq("client_count_band", filters.countBand);
  if (filters.priceBand.length > 0) query = query.eq("price_band", filters.priceBand);
  if (filters.authStatus === "identified") query = query.not("user_id", "is", null);
  if (filters.authStatus === "anonymous") query = query.is("user_id", null);
  const pattern = toLikePattern(filters.q.trim());
  if (pattern.length > 0) {
    query = query.or(
      `email.ilike.%${pattern}%,message.ilike.%${pattern}%,other_feature.ilike.%${pattern}%,profession_other.ilike.%${pattern}%,current_solution_other.ilike.%${pattern}%`,
    );
  }
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error("Could not load research submissions.");
  const total = typeof count === "number" && Number.isFinite(count) ? count : 0;
  return {
    rows: ((data ?? []) as WtpRow[]).map(toSummary),
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Distinct countries present in research submissions, for the country
 * filter. Country is open vocabulary in the schema (no enum), so options
 * come from data rather than a hardcoded list.
 */
export async function getSuggestionCountries(limit = 100): Promise<string[]> {
  const service = await adminClient();
  const { data, error } = await service
    .from("wtp_interest")
    .select("country")
    .order("country", { ascending: true })
    .limit(1000);
  if (error) throw new Error("Could not load country options.");
  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ country: string | null }>) {
    const country = (row.country ?? "").trim();
    if (country.length > 0) seen.add(country);
    if (seen.size >= Math.max(1, limit)) break;
  }
  return [...seen].sort((a, b) => (a < b ? -1 : 1));
}

export interface WtpSuggestionDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  email: string | null;
  country: string;
  profession: string;
  professionOther: string | null;
  clientCountBand: string;
  currentSolution: string[];
  currentSolutionOther: string | null;
  desiredFeatures: string[];
  otherFeature: string | null;
  quotedPriceMinor: number | null;
  quotedCurrency: string | null;
  priceBand: string;
  message: string | null;
}

/**
 * One research submission by id. Returns null for malformed ids and for
 * missing rows — callers translate both uniformly to `notFound()` so no
 * existence oracle is exposed. Never conflates the WTP provided email
 * with the authenticated user's email (see page copy).
 */

export async function getSuggestionDetail(id: string): Promise<WtpSuggestionDetail | null> {
  if (!isValidUuid(id)) return null;
  const service = await adminClient();
  const { data, error } = await service
    .from("wtp_interest")
    .select(
      "id,created_at,updated_at,user_id,email,country,profession,profession_other,client_count_band,current_solution,current_solution_other,desired_features,other_feature,quoted_price_minor,quoted_currency,price_band,message",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    created_at: string;
    updated_at: string;
    user_id: string | null;
    email: string | null;
    country: string;
    profession: string;
    profession_other: string | null;
    client_count_band: string;
    current_solution: string[] | null;
    current_solution_other: string | null;
    desired_features: string[] | null;
    other_feature: string | null;
    quoted_price_minor: number | null;
    quoted_currency: string | null;
    price_band: string;
    message: string | null;
  };
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    email: row.email,
    country: row.country,
    profession: row.profession,
    professionOther: row.profession_other,
    clientCountBand: row.client_count_band,
    currentSolution: row.current_solution ?? [],
    currentSolutionOther: row.current_solution_other,
    desiredFeatures: row.desired_features ?? [],
    otherFeature: row.other_feature,
    quotedPriceMinor: row.quoted_price_minor,
    quotedCurrency: row.quoted_currency,
    priceBand: row.price_band,
    message: row.message,
  };
}

export interface UserListPage {
  rows: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserDetail {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    createdAt: string;
    lastSignInAt: string | null;
  };
  counts: {
    clientCount: number;
    openFollowupCount: number;
    completedFollowupCount: number;
    submissionCount: number;
  };
  submissions: WtpSuggestionSummary[];
}

/**
 * Fill the bounded account window from the Auth Admin API. Loops pages
 * until a short page or the safety ceiling — never unbounded. Order is
 * whatever the Auth API returns; the directory sorts newest-first in code.
 */
async function fetchBoundedUsers(
  service: ReturnType<typeof createAdminServiceClient>,
): Promise<AdminApiUser[]> {
  const users: AdminApiUser[] = [];
  for (let page = 1; users.length < MAX_ADMIN_USERS_WINDOW; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: USERS_PER_AUTH_CALL,
    });
    if (error) throw new Error("Could not load user directory.");
    const batch = (data.users ?? []) as AdminApiUser[];
    users.push(...batch);
    if (batch.length < USERS_PER_AUTH_CALL) break;
  }
  return users.slice(0, MAX_ADMIN_USERS_WINDOW);
}

function toUserBase(user: AdminApiUser): Omit<UserSummary, keyof UserUsageCounts> {
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: displayNameFromMetadata(user.user_metadata),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

interface UserUsageCounts {
  clientCount: number;
  openFollowupCount: number;
  completedFollowupCount: number;
  submissionCount: number;
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Count-only usage aggregation for a set of user ids. Selects user_id
 * columns only — never customer rows, names, notes, or amounts. Chunked
 * so `.in()` lists stay bounded; exact while per-chunk rows stay under
 * the PostgREST row cap (true at early-stage scale; see carryover).
 */
async function aggregateUsage(
  service: ReturnType<typeof createAdminServiceClient>,
  ids: string[],
): Promise<Map<string, UserUsageCounts>> {
  const counts = new Map<string, UserUsageCounts>();
  const ensure = (id: string): UserUsageCounts => {
    let entry = counts.get(id);
    if (!entry) {
      entry = {
        clientCount: 0,
        openFollowupCount: 0,
        completedFollowupCount: 0,
        submissionCount: 0,
      };
      counts.set(id, entry);
    }
    return entry;
  };
  for (const chunk of chunkIds(ids, USER_AGGREGATION_CHUNK_SIZE)) {
    if (chunk.length === 0) continue;
    const [clients, followups, submissions] = await Promise.all([
      service.from("radar_clients").select("user_id").in("user_id", chunk),
      service.from("client_followups").select("user_id,completed_at").in("user_id", chunk),
      service.from("wtp_interest").select("user_id").in("user_id", chunk),
    ]);
    if (clients.error) throw new Error("Could not load client counts.");
    if (followups.error) throw new Error("Could not load follow-up counts.");
    if (submissions.error) throw new Error("Could not load submission counts.");
    for (const [id, count] of countByUserId(
      (clients.data ?? []) as Array<{ user_id: string | null }>,
    )) {
      ensure(id).clientCount = count;
    }
    const split = splitFollowupsByUser(
      (followups.data ?? []) as Array<{ user_id: string | null; completed_at: string | null }>,
    );
    for (const [id, count] of split.open) ensure(id).openFollowupCount = count;
    for (const [id, count] of split.completed) ensure(id).completedFollowupCount = count;
    for (const [id, count] of countByUserId(
      (submissions.data ?? []) as Array<{ user_id: string | null }>,
    )) {
      ensure(id).submissionCount = count;
    }
  }
  return counts;
}

/**
 * Paginated user directory over the bounded account window. Search and
 * usage filters apply in code over fetched summaries — honest about the
 * Auth API having no server-side user search. Usage aggregation runs over
 * the search-narrowed set (chunked, count-only, no N+1).
 */
export async function listUsersPage(filters: UserFilters, page: number): Promise<UserListPage> {
  const service = await adminClient();
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  const allUsers = await fetchBoundedUsers(service);
  const searched = applyUserSearch(
    allUsers.map((user) => ({
      ...toUserBase(user),
      clientCount: 0,
      openFollowupCount: 0,
      completedFollowupCount: 0,
      submissionCount: 0,
    })),
    filters.q,
  );
  const usage = await aggregateUsage(
    service,
    searched.map((s) => s.id),
  );
  const withCounts: UserSummary[] = searched.map((summary) => {
    const counts = usage.get(summary.id);
    return {
      ...summary,
      clientCount: counts?.clientCount ?? 0,
      openFollowupCount: counts?.openFollowupCount ?? 0,
      completedFollowupCount: counts?.completedFollowupCount ?? 0,
      submissionCount: counts?.submissionCount ?? 0,
    };
  });
  const filtered = applyUserUsageFilter(withCounts, filters.usage);

  const total = filtered.length;
  const from = (safePage - 1) * USER_PAGE_SIZE;
  return {
    rows: filtered.slice(from, from + USER_PAGE_SIZE),
    total,
    page: safePage,
    pageSize: USER_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / USER_PAGE_SIZE)),
  };
}

/**
 * One user profile with usage counts and WTP research history linked by
 * `wtp_interest.user_id` — the only authoritative linkage (never email
 * matching). Returns null for malformed or unknown ids; callers map both
 * uniformly to `notFound()`.
 */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  if (!isValidUuid(userId)) return null;
  const service = await adminClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const user = data.user as AdminApiUser;

  const [clients, followups, submissions] = await Promise.all([
    service
      .from("radar_clients")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId),
    service.from("client_followups").select("completed_at").eq("user_id", userId),
    service
      .from("wtp_interest")
      .select(
        "id,created_at,user_id,email,country,profession,client_count_band,price_band,desired_features,message",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (clients.error) throw new Error("Could not load client count.");
  if (followups.error) throw new Error("Could not load follow-up counts.");
  if (submissions.error) throw new Error("Could not load user submissions.");

  const submissionRows = (submissions.data ?? []) as WtpRow[];
  const submissionCount =
    typeof submissions.count === "number" && Number.isFinite(submissions.count)
      ? submissions.count
      : submissionRows.length;

  const followupRows = (followups.data ?? []) as Array<{ completed_at: string | null }>;
  let openFollowups = 0;
  let completedFollowups = 0;
  for (const row of followupRows) {
    if (row.completed_at) completedFollowups += 1;
    else openFollowups += 1;
  }
  const clientCount =
    typeof clients.count === "number" && Number.isFinite(clients.count) ? clients.count : 0;

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      displayName: displayNameFromMetadata(user.user_metadata),
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    counts: {
      clientCount,
      openFollowupCount: openFollowups,
      completedFollowupCount: completedFollowups,
      submissionCount,
    },
    submissions: submissionRows.map(toSummary),
  };
}
