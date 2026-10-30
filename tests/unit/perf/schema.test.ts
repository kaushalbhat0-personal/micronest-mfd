import { describe, expect, it } from "vitest";
import { parsePerfBeacon } from "@/lib/perf/schema";

const VALID_IMPORT = {
  op: "import.session",
  attempted: 10,
  ready: 8,
  skipped: 1,
  invalid: 1,
  duplicate: 0,
  added: 8,
  failed: 0,
  writeMs: 1200,
  durationMs: 1500,
};

const VALID_MUTATION = {
  op: "followup.mutation",
  kind: "complete",
  ok: true,
  writeMs: 300,
  requeryMs: 200,
  rows: 4,
};

describe("parsePerfBeacon", () => {
  it("accepts a valid import session beacon", () => {
    expect(parsePerfBeacon(VALID_IMPORT)).toEqual(VALID_IMPORT);
  });

  it("accepts a valid follow-up mutation beacon", () => {
    expect(parsePerfBeacon(VALID_MUTATION)).toEqual(VALID_MUTATION);
  });

  it("accepts a mutation beacon without the optional rows field", () => {
    const rest = {
      op: "followup.mutation",
      kind: "complete",
      ok: true,
      writeMs: 300,
      requeryMs: 200,
    } as const;
    expect(parsePerfBeacon(rest)).toEqual(rest);
  });

  it("rejects non-objects, arrays, and unknown ops", () => {
    expect(parsePerfBeacon(null)).toBeNull();
    expect(parsePerfBeacon("import.session")).toBeNull();
    expect(parsePerfBeacon([])).toBeNull();
    expect(parsePerfBeacon({ op: "page.view", path: "/workspace/today" })).toBeNull();
  });

  it("rejects extra fields that could carry client data", () => {
    expect(parsePerfBeacon({ ...VALID_IMPORT, clientName: "Rajesh" })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_IMPORT, phone: "9876543210" })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_MUTATION, reason: "Call back" })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_MUTATION, userId: "abc" })).toBeNull();
  });

  it("rejects non-numeric, negative, or unbounded values", () => {
    expect(parsePerfBeacon({ ...VALID_IMPORT, attempted: -1 })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_IMPORT, writeMs: Number.NaN })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_IMPORT, durationMs: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_IMPORT, added: "8" })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_MUTATION, kind: "delete" })).toBeNull();
    expect(parsePerfBeacon({ ...VALID_MUTATION, ok: "yes" })).toBeNull();
  });
});
