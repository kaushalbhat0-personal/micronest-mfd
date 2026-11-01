import { describe, expect, it } from "vitest";
import { filterBookItems } from "@/features/radar/book";
import { markContacted } from "@/features/radar/model";
import { toClientRecord, toStoredClient } from "@/features/radar/repository";
import { buildTodayItems, countToday, filterTodayItems } from "@/features/radar/today";
import type { StoredRadarClient } from "@/features/radar/repository";

const TODAY = "2026-10-26";
// Silence older than the default 90-day reconnect interval.
const QUIET = "2026-07-10";

function stored(overrides: Partial<StoredRadarClient> = {}): StoredRadarClient {
  return {
    id: "sync-1",
    name: "Sync Owner",
    phone: "9876543210",
    investmentType: "SIP",
    sipAmountPaise: null,
    lumpsumAmountPaise: null,
    amountPaise: null,
    lastInvested: null,
    lastContacted: QUIET,
    note: "",
    ...overrides,
  };
}

/**
 * Cross-route state synchronization (RCCF-MFD cross-route sync audit).
 * The reported bug: "I spoke to them" persisted correctly and Today
 * updated optimistically, but Clients kept the pre-mutation attention
 * count and back-navigation resurrected it on Today until a hard
 * refresh. The persistence + projection contract below is what the
 * revalidateWorkspace/router.refresh fix relies on: once
 * last_contacted is persisted, every fresh server projection (Today
 * page AND Clients page both build from listClients rows via
 * toClientRecord + buildTodayItems) must agree the client no longer
 * needs attention — no second model, no per-route divergence.
 */
describe("cross-route sync after mark contacted", () => {
  it("client initially requires attention on both Today and Clients projections", () => {
    const records = [toClientRecord(stored(), 0, TODAY)];
    expect(records[0].signals).toContain("reconnect-due");

    const items = buildTodayItems(records, [], TODAY);
    expect(countToday(items, TODAY).attention).toBe(1);
    expect(filterTodayItems(items, "attention", TODAY).map((i) => i.record.id)).toEqual([
      "sync-1",
    ]);
    expect(filterBookItems(items, "attention", "", TODAY).map((i) => i.record.id)).toEqual([
      "sync-1",
    ]);
  });

  it("persisted last_contacted re-projects without the actionable signal on both views", () => {
    // 1. The optimistic transition the workspace applies after persisting.
    const contacted = markContacted(toClientRecord(stored(), 0, TODAY), TODAY);
    expect(contacted.lastContacted).toBe(TODAY);

    // 2. What the database holds after updateLastContacted succeeds: the
    // same stored shape with last_contacted rewritten, round-tripped
    // through the repository mapper exactly as the server pages receive it.
    const persisted = toStoredClient({
      id: "sync-1",
      name: "Sync Owner",
      mobile: "9876543210",
      investment_type: "SIP",
      sip_amount_paise: null,
      lumpsum_amount_paise: null,
      amount_paise: null,
      last_invested: null,
      last_contacted: TODAY,
      note: "",
    });
    expect(persisted.lastContacted).toBe(TODAY);

    // 3. Fresh server projections (Today page body and Clients page body)
    // rebuild from the persisted row — derived signals must no longer
    // contain the previous actionable signal.
    const reprojected = toClientRecord(persisted, 0, TODAY);
    expect(reprojected.lastContacted).toBe(TODAY);
    expect(reprojected.signals).not.toContain("reconnect-due");
    expect(reprojected.signals).not.toContain("new-client");

    // 4. Subsequent Today AND Clients projections use the updated record:
    // attention drops to zero on both, and both views agree.
    const items = buildTodayItems([reprojected], [], TODAY);
    const counts = countToday(items, TODAY);
    expect(counts.attention).toBe(0);
    expect(counts.contacted).toBe(1);
    expect(filterTodayItems(items, "attention", TODAY)).toHaveLength(0);
    expect(filterBookItems(items, "attention", "", TODAY)).toHaveLength(0);
    expect(filterTodayItems(items, "contacted", TODAY).map((i) => i.record.id)).toEqual([
      "sync-1",
    ]);

    // 5. A never-contacted new relationship follows the same contract:
    // contact graduates the lifecycle instead of flipping to reconnect.
    const fresh = toClientRecord(stored({ id: "sync-2", name: "Sync New", lastContacted: null }), 1, TODAY);
    expect(fresh.signals).toContain("new-client");
    const freshContacted = markContacted(fresh, TODAY);
    expect(freshContacted.signals).not.toContain("new-client");
    expect(freshContacted.signals).not.toContain("reconnect-due");
    const both = buildTodayItems([reprojected, freshContacted], [], TODAY);
    expect(countToday(both, TODAY).attention).toBe(0);
    expect(filterBookItems(both, "attention", "", TODAY)).toHaveLength(0);
  });
});
