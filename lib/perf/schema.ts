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

/**
 * Product validation beacon (MFD-72 Phase 1). Account/product-level events
 * only: which milestone happened and the resulting client count. No names,
 * phones, notes, amounts, reasons, messages, user ids, or any other client
 * content — the allow-list below rejects anything else, so validation data
 * cannot smuggle PII by shape.
 */
export type ValidationEvent =
  | "signup"
  | "first_client"
  | "client_count_10"
  | "client_count_50"
  | "client_count_99"
  | "client_count_100"
  | "workspace_active"
  | "template_download"
  | "import_success";

export interface ValidationBeacon {
  op: "validation.event";
  event: ValidationEvent;
  /** Resulting owned client count, when the event is count-related. */
  clientCount?: number;
  /** Milestone threshold crossed, when the event is milestone-related. */
  milestone?: number;
}

export type PerfBeacon = ImportSessionBeacon | FollowupMutationBeacon | ValidationBeacon;

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

const VALIDATION_KEYS = new Set(["op", "event", "clientCount", "milestone"]);

const VALIDATION_EVENTS = new Set([
  "signup",
  "first_client",
  "client_count_10",
  "client_count_50",
  "client_count_99",
  "client_count_100",
  "workspace_active",
  "template_download",
  "import_success",
]);

const VALIDATION_MILESTONES = new Set([1, 10, 50, 99, 100]);

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
  if (input.op === "validation.event") {
    if (!hasOnlyKeys(input, VALIDATION_KEYS)) return null;
    const { event, clientCount, milestone } = input;
    if (typeof event !== "string" || !VALIDATION_EVENTS.has(event)) return null;
    if (clientCount !== undefined && !isCount(clientCount, 100000)) return null;
    if (
      milestone !== undefined &&
      (typeof milestone !== "number" || !VALIDATION_MILESTONES.has(milestone))
    ) {
      return null;
    }
    return {
      op: "validation.event",
      event: event as ValidationBeacon["event"],
      ...(clientCount === undefined ? {} : { clientCount }),
      ...(milestone === undefined ? {} : { milestone }),
    };
  }
  return null;
}
