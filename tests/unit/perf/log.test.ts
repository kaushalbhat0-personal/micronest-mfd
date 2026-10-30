import { afterEach, describe, expect, it, vi } from "vitest";
import { logPerf, timed } from "@/lib/perf/log";

function lastJsonLine(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const args = spy.mock.calls[spy.mock.calls.length - 1];
  return JSON.parse(args[0] as string) as Record<string, unknown>;
}

describe("logPerf", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits one JSON line with the aggregate fields only", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPerf({ op: "supabase.clients.list", durationMs: 42, ok: true, rows: 10 });
    expect(info).toHaveBeenCalledTimes(1);
    expect(lastJsonLine(info)).toEqual({
      src: "mfd-perf",
      op: "supabase.clients.list",
      durationMs: 42,
      ok: true,
      rows: 10,
    });
  });

  it("routes failures to console.warn without error details", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPerf({ op: "supabase.clients.get", durationMs: 7, ok: false });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = lastJsonLine(warn);
    expect(line.ok).toBe(false);
    expect("message" in line).toBe(false);
    expect("error" in line).toBe(false);
  });
});

describe("timed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the wrapped value and logs duration with rows and route", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const value = await timed("supabase.followups.list-open", () => Promise.resolve([1, 2, 3]), {
      route: "/workspace/today",
      rowsOf: (rows) => rows.length,
    });
    expect(value).toEqual([1, 2, 3]);
    const line = lastJsonLine(info);
    expect(line.op).toBe("supabase.followups.list-open");
    expect(line.ok).toBe(true);
    expect(line.rows).toBe(3);
    expect(line.route).toBe("/workspace/today");
    expect(typeof line.durationMs).toBe("number");
  });

  it("rethrows the original error after logging ok:false", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("boom");
    await expect(
      timed("supabase.clients.get", () => Promise.reject(failure), {
        route: "/workspace/clients/[id]",
      }),
    ).rejects.toBe(failure);
    const line = lastJsonLine(warn);
    expect(line).toMatchObject({ op: "supabase.clients.get", ok: false });
    expect("stack" in line).toBe(false);
  });
});
