import type { PerfBeacon } from "./schema";

/**
 * Fire-and-forget client performance beacon (POST /api/perf).
 * Uses sendBeacon so reporting never blocks rendering or navigation.
 * Silently drops when unavailable — telemetry must never break flows.
 * Payloads are aggregate counts/durations only (see schema.ts).
 */
export function reportPerf(beacon: PerfBeacon): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    const body = JSON.stringify(beacon);
    if (body.length > 2048) return;
    navigator.sendBeacon("/api/perf", new Blob([body], { type: "application/json" }));
  } catch {
    // Telemetry is best-effort by design.
  }
}
