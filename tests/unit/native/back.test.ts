import { describe, expect, it, beforeEach } from "vitest";
import {
  pushBackDismiss,
  tryDismissTop,
  resolveRootBack,
  __resetBackDismissForTests,
} from "@/lib/native/back";

describe("native hardware-back stack", () => {
  beforeEach(() => {
    __resetBackDismissForTests();
  });

  it("reports unconsumed when nothing is registered", () => {
    expect(tryDismissTop()).toBe(false);
  });

  it("invokes the topmost handler without removing it", () => {
    const order: string[] = [];
    const unregisterFirst = pushBackDismiss(() => {
      order.push("first");
      return true;
    });
    const unregisterSecond = pushBackDismiss(() => {
      order.push("second");
      return true;
    });
    expect(tryDismissTop()).toBe(true);
    expect(order).toEqual(["second"]);
    // Top stays registered until its owner unregisters (e.g. on close).
    unregisterSecond();
    expect(tryDismissTop()).toBe(true);
    expect(order).toEqual(["second", "first"]);
    unregisterFirst();
    expect(tryDismissTop()).toBe(false);
  });

  it("falls through when the top handler is busy", () => {
    pushBackDismiss(() => false);
    expect(tryDismissTop()).toBe(false);
  });

  it("unregisters on close", () => {
    const unregister = pushBackDismiss(() => true);
    unregister();
    expect(tryDismissTop()).toBe(false);
  });

  it("root-back exits only on explicit confirm", () => {
    expect(resolveRootBack(true)).toBe(true);
    expect(resolveRootBack(false)).toBe(false);
  });
});
