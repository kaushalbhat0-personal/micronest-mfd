import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { detectSensitiveInput } from "@/lib/sensitive";
import {
  validateWtpSubmission,
  type WtpSubmissionInput,
} from "@/features/wtp/validation";

/**
 * Public research submission ingestion (MFD-78).
 *
 * Accepts the shared-validated research shape only. Ownership is derived
 * server-side from the session — any client-supplied user identity is
 * ignored — and anonymous submissions store NULL user_id. RLS on
 * wtp_interest is the final enforcement (insert-only, owner-or-null).
 * Nothing is ever read back through this route.
 */

const MAX_BODY_BYTES = 16_384;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "string")) return null;
  return value as string[];
}

function toMinorOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : null;
}

function normalize(input: Record<string, unknown>): WtpSubmissionInput | null {
  const currentSolution = toStringArray(input.currentSolution);
  const desiredFeatures = toStringArray(input.desiredFeatures);
  if (currentSolution === null || desiredFeatures === null) return null;
  const country = toStringOrNull(input.country);
  const profession = toStringOrNull(input.profession);
  const clientCountBand = toStringOrNull(input.clientCountBand);
  const priceBand = toStringOrNull(input.priceBand);
  if (country === null || profession === null || clientCountBand === null || priceBand === null) {
    return null;
  }
  return {
    email: toStringOrNull(input.email),
    country,
    profession,
    professionOther: toStringOrNull(input.professionOther),
    clientCountBand,
    currentSolution,
    currentSolutionOther: toStringOrNull(input.currentSolutionOther),
    desiredFeatures,
    otherFeature: toStringOrNull(input.otherFeature),
    quotedPriceMinor: toMinorOrNull(input.quotedPriceMinor),
    quotedCurrency: toStringOrNull(input.quotedCurrency),
    priceBand,
    message: toStringOrNull(input.message),
  };
}

/** Refuse free text that looks like PAN/Aadhaar/OTP/password material. */
function sensitiveError(input: WtpSubmissionInput): { field: string; message: string } | null {
  const freeText: Array<[string, string | null]> = [
    ["professionOther", input.professionOther],
    ["currentSolutionOther", input.currentSolutionOther],
    ["otherFeature", input.otherFeature],
    ["message", input.message],
  ];
  for (const [field, value] of freeText) {
    if (!value || value.trim().length === 0) continue;
    const hit = detectSensitiveInput(field, value);
    if (hit) return { field, message: hit.reason };
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    body = text.length === 0 ? null : (JSON.parse(text) as unknown);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Client-controlled ownership is never accepted: only the known research
  // fields are picked out of the payload.
  const input = normalize(body);
  if (!input) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const errors = validateWtpSubmission(input);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }
  const sensitive = sensitiveError(input);
  if (sensitive) {
    return NextResponse.json({ ok: false, errors: [sensitive] }, { status: 400 });
  }

  const trimOrNull = (v: string | null) => {
    if (v === null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  };

  // Authenticated ownership, resolved server-side. Anonymous stays NULL.
  let userId: string | null = null;
  try {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }
  } catch {
    userId = null;
  }

  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    const { error } = await supabase.from("wtp_interest").insert({
      user_id: userId,
      email: trimOrNull(input.email)?.toLowerCase() ?? null,
      country: input.country.trim(),
      profession: input.profession,
      profession_other: trimOrNull(input.professionOther),
      client_count_band: input.clientCountBand,
      current_solution: input.currentSolution,
      current_solution_other: trimOrNull(input.currentSolutionOther),
      desired_features: input.desiredFeatures,
      other_feature: trimOrNull(input.otherFeature),
      quoted_price_minor: input.quotedPriceMinor,
      quoted_currency: input.quotedCurrency,
      price_band: input.priceBand,
      message: trimOrNull(input.message),
    });
    if (error) {
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
