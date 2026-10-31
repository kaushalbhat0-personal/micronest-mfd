/**
 * Strict schema for the client performance beacon (POST /api/perf).
 *
 * The beacon carries aggregate counts and durations only. There are no
 * string fields except the fixed op/kind enums, so client data cannot
 * be smuggled through: anything outside this shape is rejected with
 * null (caller responds 400, nothing is logged).
 */

export interface ImportSessionBeacon {
  op: "import.session";
  attempted: number;
  ready: number;
  skipped: number;
  invalid: number;
  duplicate: number;
  added: number;
  /** Book records updated in place by an upsert import. Additive count only. */
  updated?: number;
  failed: number;
  writeMs: number;
  durationMs: number;
}

export interface FollowupMutationBeacon {
  op: "followup.mutation";
  kind: "create" | "complete" | "reopen";
  ok: boolean;
  writeMs: number;
  requeryMs: number;
  rows?: number;
}

export type PerfBeacon = ImportSessionBeacon | FollowupMutationBeacon;

const IMPORT_KEYS = new Set([
  "op",
  "attempted",
  "ready",
  "skipped",
  "invalid",
  "duplicate",
  "added",
  "updated",
  "failed",
  "writeMs",
  "durationMs",
]);

const FOLLOWUP_KEYS = new Set(["op", "kind", "ok", "writeMs", "requeryMs", "rows"]);

const FOLLOWUP_KINDS = new Set(["create", "complete", "reopen"]);

/** Upper bounds: counts fit real workloads, durations fit one session. */
function isCount(value: unknown, max = 100000): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function isDurationMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 3600000;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a validated beacon, or null when the payload is anything else.
 * Never throws, never logs.
 */
export function parsePerfBeacon(input: unknown): PerfBeacon | null {
  if (!isRecord(input)) return null;
  if (input.op === "import.session") {
    if (!hasOnlyKeys(input, IMPORT_KEYS)) return null;
    const {
      attempted,
      ready,
      skipped,
      invalid,
      duplicate,
      added,
      updated,
      failed,
      writeMs,
      durationMs,
    } = input;
    if (
      !isCount(attempted, 100000) ||
      !isCount(ready, 100000) ||
      !isCount(skipped, 100000) ||
      !isCount(invalid, 100000) ||
      !isCount(duplicate, 100000) ||
      !isCount(added, 100000) ||
      (updated !== undefined && !isCount(updated, 100000)) ||
      !isCount(failed, 100000) ||
      !isDurationMs(writeMs) ||
      !isDurationMs(durationMs)
    ) {
      return null;
    }
    return {
      op: "import.session",
      attempted,
      ready,
      skipped,
      invalid,
      duplicate,
      added,
      ...(updated === undefined ? {} : { updated }),
      failed,
      writeMs,
      durationMs,
    };
  }
  if (input.op === "followup.mutation") {
    if (!hasOnlyKeys(input, FOLLOWUP_KEYS)) return null;
    const { kind, ok, writeMs, requeryMs, rows } = input;
    if (
      typeof kind !== "string" ||
      !FOLLOWUP_KINDS.has(kind) ||
      typeof ok !== "boolean" ||
      !isDurationMs(writeMs) ||
      !isDurationMs(requeryMs) ||
      (rows !== undefined && !isCount(rows, 100000))
    ) {
      return null;
    }
    return {
      op: "followup.mutation",
      kind: kind as FollowupMutationBeacon["kind"],
      ok,
      writeMs,
      requeryMs,
      ...(rows === undefined ? {} : { rows }),
    };
  }
  return null;
}
