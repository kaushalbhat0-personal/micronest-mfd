/**
 * Aggregate-only performance telemetry (observability phase).
 *
 * Emits one JSON line per measured operation to stdout, which the Vercel
 * runtime collects as a log. No database writes, no network calls, no
 * global state, no per-user tracking.
 *
 * PRIVACY CONTRACT: callers pass counts and durations only. Never pass
 * client names, phones, emails, notes, amounts, investment details,
 * user ids, tokens, cookies, headers, keys, or raw rows. Error values
 * are never logged (ok boolean only) so safe copy stays safe.
 */

export interface PerfFields {
  op: string;
  /** Wall-clock operation time. Never awaited by callers. */
  durationMs: number;
  ok: boolean;
  /** Aggregate row count where the operation returns rows. */
  rows?: number;
  /** Static route literal only (e.g. "/workspace/today"). Never ids. */
  route?: string;
  /** Extra aggregate numeric/string fields (counts, sub-timings, enums). */
  [key: string]: string | number | boolean | undefined;
}

export function logPerf(fields: PerfFields): void {
  const line = JSON.stringify({ src: "mfd-perf", ...fields });
  if (fields.ok) {
    console.info(line);
  } else {
    console.warn(line);
  }
}

interface TimedMeta<T> {
  route?: string;
  rowsOf?: (value: T) => number | undefined;
}

/**
 * Measures an async operation, logs one aggregate line, and returns or
 * rethrows exactly as the wrapped function would. Adds zero queries and
 * never changes control flow.
 */
export async function timed<T>(
  op: string,
  fn: () => Promise<T>,
  meta?: TimedMeta<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const value = await fn();
    const rows = meta?.rowsOf?.(value);
    logPerf({
      op,
      durationMs: Date.now() - start,
      ok: true,
      ...(meta?.route === undefined ? {} : { route: meta.route }),
      ...(rows === undefined ? {} : { rows }),
    });
    return value;
  } catch (error) {
    logPerf({
      op,
      durationMs: Date.now() - start,
      ok: false,
      ...(meta?.route === undefined ? {} : { route: meta.route }),
    });
    throw error;
  }
}
