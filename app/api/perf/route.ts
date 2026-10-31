import { NextResponse } from "next/server";
import { logPerf } from "@/lib/perf/log";
import { parsePerfBeacon } from "@/lib/perf/schema";

/**
 * Aggregate performance + validation beacon ingestion (observability phase).
 *
 * Accepts the strict beacon schema only (counts and durations, fixed
 * op/event enums — no free-form strings, so no client data can arrive).
 * Invalid payloads are dropped with a 400 and never logged. Valid beacons
 * emit one stdout JSON line each; nothing is stored, cached, or shared.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const beacon = parsePerfBeacon(body);
  if (!beacon) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (beacon.op === "import.session") {
    logPerf({
      op: "import.session",
      durationMs: beacon.durationMs,
      ok: true,
      rows: beacon.attempted,
      ready: beacon.ready,
      skipped: beacon.skipped,
      invalid: beacon.invalid,
      duplicate: beacon.duplicate,
      added: beacon.added,
      failed: beacon.failed,
      writeMs: beacon.writeMs,
    });
  } else if (beacon.op === "followup.mutation") {
    logPerf({
      op: "followup.mutation",
      durationMs: beacon.writeMs + beacon.requeryMs,
      ok: beacon.ok,
      ...(beacon.rows === undefined ? {} : { rows: beacon.rows }),
      kind: beacon.kind,
      writeMs: beacon.writeMs,
      requeryMs: beacon.requeryMs,
    });
  } else {
    logPerf({
      op: "validation.event",
      durationMs: 0,
      ok: true,
      event: beacon.event,
      ...(beacon.clientCount === undefined ? {} : { rows: beacon.clientCount }),
      ...(beacon.milestone === undefined ? {} : { milestone: beacon.milestone }),
    });
  }
  return NextResponse.json({ ok: true });
}
