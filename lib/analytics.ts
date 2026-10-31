import { reportValidation } from "./perf/report";
import type { ValidationBeacon } from "./perf/schema";

/**
 * Product validation events (MFD-72 Phase 1). Answers: are people signing
 * up, adding clients, reaching milestones, using the workspace, and
 * importing/downloading templates.
 *
 * PRIVACY CONTRACT (same as perf beacons): account/product-level events
 * only — milestone thresholds and resulting client counts. Never client
 * names, phones, notes, amounts, reasons, messages, user ids, or any other
 * client content. The server schema allow-lists every field.
 *
 * DUPLICATION CONTRACT: milestone/signup/active events fire from guarded
 * emitters below — never from render paths. Milestones fire on observed
 * count transitions (prev < m <= next), so re-renders and refetches can
 * never duplicate them.
 */

/** Client-count milestones that emit events (1 maps to first_client). */
export const CLIENT_MILESTONES = [1, 10, 50, 99, 100] as const;

/**
 * Pure transition helper: which milestones were crossed going from
 * prevTotal to nextTotal owned clients. Deterministic and unit-tested.
 */
export function milestonesCrossed(prevTotal: number, nextTotal: number): number[] {
  if (!Number.isFinite(prevTotal) || !Number.isFinite(nextTotal) || nextTotal <= prevTotal) {
    return [];
  }
  return CLIENT_MILESTONES.filter((m) => prevTotal < m && nextTotal >= m);
}

function milestoneEvent(milestone: number): ValidationBeacon {
  if (milestone === 1) {
    return { op: "validation.event", event: "first_client", milestone: 1 };
  }
  return {
    op: "validation.event",
    event: `client_count_${milestone}` as ValidationBeacon["event"],
    milestone,
  };
}

/**
 * Fire milestone events for an observed owned-client-count transition.
 * Call once per completed add/import with the before/after totals.
 */
export function trackClientCountTransition(prevTotal: number, nextTotal: number): void {
  for (const milestone of milestonesCrossed(prevTotal, nextTotal)) {
    reportValidation({ ...milestoneEvent(milestone), clientCount: nextTotal });
  }
}

const SIGNUP_KEY = "micronest-validation-signup";

/**
 * First observed authenticated identity on this device. Fires at most once
 * per user id (the stored value is the id it already reported for).
 */
export function trackSignupOnce(userId: string): void {
  try {
    if (typeof localStorage === "undefined" || userId.length === 0) return;
    if (localStorage.getItem(SIGNUP_KEY) === userId) return;
    localStorage.setItem(SIGNUP_KEY, userId);
    reportValidation({ op: "validation.event", event: "signup" });
  } catch {
    // Telemetry is best-effort by design.
  }
}

const ACTIVE_KEY = "micronest-validation-active";

/** Once per tab session: the workspace rendered for a signed-in user. */
export function trackWorkspaceActiveOnce(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(ACTIVE_KEY) !== null) return;
    sessionStorage.setItem(ACTIVE_KEY, "1");
    reportValidation({ op: "validation.event", event: "workspace_active" });
  } catch {
    // Telemetry is best-effort by design.
  }
}

/** A client template file (CSV or XLSX) was downloaded. */
export function trackTemplateDownload(): void {
  reportValidation({ op: "validation.event", event: "template_download" });
}

/** An import completed with the given number of created + updated rows. */
export function trackImportSuccess(imported: number): void {
  if (!Number.isFinite(imported) || imported < 0) return;
  reportValidation({ op: "validation.event", event: "import_success", clientCount: imported });
}
