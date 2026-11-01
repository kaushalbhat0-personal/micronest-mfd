import { describe, expect, it, vi } from "vitest";
import { countOwnedClients } from "@/features/radar/repository";
import {
  FREE_CLIENT_LIMIT,
  LIMIT_WARNING_THRESHOLD,
  importAdmission,
  isApproachingClientLimit,
  isAtClientLimit,
} from "@/features/radar/limits";
import { parsePerfBeacon } from "@/lib/perf/schema";
import { reportValidation } from "@/lib/perf/report";
import { trackClientCreationBlocked } from "@/lib/analytics";

vi.mock("@/lib/perf/report", () => ({ reportValidation: vi.fn() }));

const mockedReport = vi.mocked(reportValidation);

describe("free client limit rules", () => {
  it("fixes the boundary at 100 with the warning band at 90", () => {
    expect(FREE_CLIENT_LIMIT).toBe(100);
    expect(LIMIT_WARNING_THRESHOLD).toBe(90);
  });

  it("blocks creation at exactly 100 and above, allows below", () => {
    expect(isAtClientLimit(0)).toBe(false);
    expect(isAtClientLimit(89)).toBe(false);
    expect(isAtClientLimit(99)).toBe(false);
    expect(isAtClientLimit(100)).toBe(true);
    expect(isAtClientLimit(101)).toBe(true);
    expect(isAtClientLimit(5000)).toBe(true);
  });

  it("nudges only inside 90–99", () => {
    expect(isApproachingClientLimit(89)).toBe(false);
    expect(isApproachingClientLimit(90)).toBe(true);
    expect(isApproachingClientLimit(99)).toBe(true);
    expect(isApproachingClientLimit(100)).toBe(false);
    expect(isApproachingClientLimit(150)).toBe(false);
  });

  it("admits under-limit imports and rejects over-limit ones with exact counts", () => {
    expect(importAdmission(90, 1)).toEqual({ allowed: true });
    expect(importAdmission(90, 10)).toEqual({ allowed: true });
    expect(importAdmission(90, 11)).toEqual({ allowed: false, wanted: 101, overBy: 1 });
    expect(importAdmission(100, 0)).toEqual({ allowed: true });
    expect(importAdmission(100, 1)).toEqual({ allowed: false, wanted: 101, overBy: 1 });
    expect(importAdmission(0, 150)).toEqual({ allowed: false, wanted: 150, overBy: 50 });
    expect(importAdmission(120, 5)).toEqual({ allowed: false, wanted: 125, overBy: 25 });
  });
});

describe("countOwnedClients", () => {
  function stubCount(resolution: { count?: number | null; error?: { code?: string; message: string } }) {
    const select = vi.fn(async () => resolution);
    return { from: vi.fn(() => ({ select })), calls: { select } };
  }

  it("issues an RLS-scoped exact head count and returns it", async () => {
    const table = stubCount({ count: 42 });
    await expect(countOwnedClients(table as never)).resolves.toBe(42);
    expect(table.calls.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("returns zero for non-numeric counts", async () => {
    const table = stubCount({ count: null });
    await expect(countOwnedClients(table as never)).resolves.toBe(0);
  });

  it("maps failures to the load code without leaking details", async () => {
    const table = stubCount({ error: { code: "XX000", message: "supersecret detail" } });
    const error = await countOwnedClients(table as never).catch((e) => e);
    expect(error.code).toBe("load");
    expect(error.message).not.toContain("supersecret");
  });

  it("maps auth failures to the auth code", async () => {
    const table = stubCount({ error: { message: "jwt expired" } });
    await expect(countOwnedClients(table as never)).rejects.toMatchObject({ code: "auth" });
  });
});

describe("client_creation_blocked analytics", () => {
  it("emits owned/wanted counts and nothing else", () => {
    mockedReport.mockClear();
    trackClientCreationBlocked(100, 101);
    expect(mockedReport).toHaveBeenCalledTimes(1);
    expect(mockedReport).toHaveBeenCalledWith({
      op: "validation.event",
      event: "client_creation_blocked",
      owned: 100,
      wanted: 101,
    });
  });

  it("never emits non-finite or negative counts", () => {
    mockedReport.mockClear();
    trackClientCreationBlocked(Number.NaN, 101);
    trackClientCreationBlocked(100, -1);
    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("passes the server schema with counts only, still rejecting PII", () => {
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "client_creation_blocked",
        owned: 100,
        wanted: 101,
      }),
    ).toEqual({
      op: "validation.event",
      event: "client_creation_blocked",
      owned: 100,
      wanted: 101,
    });
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "client_creation_blocked",
        owned: 100,
        wanted: 101,
        email: "a@b.c",
      }),
    ).toBeNull();
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "client_creation_blocked",
        owned: -1,
        wanted: 101,
      }),
    ).toBeNull();
  });
});
