import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearTimeOverride,
  getEffectiveNow,
  getTimeOverride,
  isTimeOverridden,
  resetTimeOverride,
  setTimeOverride,
  subscribeToTimeOverride,
} from "@/lib/time-override";

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetTimeOverride();
});

afterEach(() => {
  resetTimeOverride();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Initial state                                                              */
/* -------------------------------------------------------------------------- */

describe("time-override — initial state", () => {
  it("starts with no override", () => {
    expect(getTimeOverride()).toBeNull();
  });

  it("reports isTimeOverridden as false", () => {
    expect(isTimeOverridden()).toBe(false);
  });

  it("getEffectiveNow falls through to Date.now when no override", () => {
    const before = Date.now();
    const effective = getEffectiveNow();
    const after = Date.now();

    expect(effective).toBeGreaterThanOrEqual(before);
    expect(effective).toBeLessThanOrEqual(after);
  });
});

/* -------------------------------------------------------------------------- */
/* setTimeOverride                                                            */
/* -------------------------------------------------------------------------- */

describe("setTimeOverride", () => {
  it("stores the given instant", () => {
    setTimeOverride(1_700_000_000_000);

    expect(getTimeOverride()).toBe(1_700_000_000_000);
  });

  it("flips isTimeOverridden to true", () => {
    setTimeOverride(1_700_000_000_000);

    expect(isTimeOverridden()).toBe(true);
  });

  it("makes getEffectiveNow return the override", () => {
    setTimeOverride(1_700_000_000_000);

    expect(getEffectiveNow()).toBe(1_700_000_000_000);
  });

  it("accepts epoch 0", () => {
    setTimeOverride(0);

    expect(getTimeOverride()).toBe(0);
    expect(isTimeOverridden()).toBe(true);
    expect(getEffectiveNow()).toBe(0);
  });

  it("accepts negative epochs (pre-1970)", () => {
    setTimeOverride(-1_000_000);

    expect(getTimeOverride()).toBe(-1_000_000);
    expect(getEffectiveNow()).toBe(-1_000_000);
  });

  it("accepts the exact upper bound", () => {
    setTimeOverride(8.64e15);

    expect(getTimeOverride()).toBe(8.64e15);
  });

  it("accepts the exact lower bound", () => {
    setTimeOverride(-8.64e15);

    expect(getTimeOverride()).toBe(-8.64e15);
  });

  it("rejects NaN as a no-op", () => {
    setTimeOverride(1_000);
    setTimeOverride(NaN);

    expect(getTimeOverride()).toBe(1_000);
  });

  it("rejects Infinity as a no-op", () => {
    setTimeOverride(1_000);
    setTimeOverride(Infinity);

    expect(getTimeOverride()).toBe(1_000);
  });

  it("rejects -Infinity as a no-op", () => {
    setTimeOverride(1_000);
    setTimeOverride(-Infinity);

    expect(getTimeOverride()).toBe(1_000);
  });

  it("rejects values above the valid Date range", () => {
    setTimeOverride(1_000);
    setTimeOverride(8.64e15 + 1);

    expect(getTimeOverride()).toBe(1_000);
  });

  it("rejects values below the valid Date range", () => {
    setTimeOverride(1_000);
    setTimeOverride(-8.64e15 - 1);

    expect(getTimeOverride()).toBe(1_000);
  });

  it("does not fire subscribers when setting the same value twice", () => {
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    setTimeOverride(1_700_000_000_000);
    setTimeOverride(1_700_000_000_000);
    setTimeOverride(1_700_000_000_000);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not fire subscribers on a rejected value", () => {
    setTimeOverride(1_000);

    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    setTimeOverride(NaN);
    setTimeOverride(Infinity);
    setTimeOverride(1_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("overwrites a previous override", () => {
    setTimeOverride(1_000);
    setTimeOverride(2_000);

    expect(getTimeOverride()).toBe(2_000);
  });
});

/* -------------------------------------------------------------------------- */
/* clearTimeOverride                                                          */
/* -------------------------------------------------------------------------- */

describe("clearTimeOverride", () => {
  it("returns the module to live-time mode", () => {
    setTimeOverride(1_700_000_000_000);
    clearTimeOverride();

    expect(getTimeOverride()).toBeNull();
    expect(isTimeOverridden()).toBe(false);
  });

  it("is idempotent when no override is active", () => {
    expect(() => clearTimeOverride()).not.toThrow();
    expect(() => clearTimeOverride()).not.toThrow();

    expect(getTimeOverride()).toBeNull();
  });

  it("does not fire subscribers when there is nothing to clear", () => {
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    clearTimeOverride();
    clearTimeOverride();

    expect(listener).not.toHaveBeenCalled();
  });

  it("fires subscribers when clearing an active override", () => {
    setTimeOverride(1_700_000_000_000);

    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    clearTimeOverride();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("getEffectiveNow falls through to Date.now after clearing", () => {
    setTimeOverride(1_000);
    clearTimeOverride();

    const before = Date.now();
    const effective = getEffectiveNow();
    const after = Date.now();

    expect(effective).toBeGreaterThanOrEqual(before);
    expect(effective).toBeLessThanOrEqual(after);
  });
});

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

describe("subscribeToTimeOverride", () => {
  it("fires the listener when an override is set", () => {
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    setTimeOverride(1_700_000_000_000);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1_700_000_000_000);
  });

  it("fires the listener with null when cleared", () => {
    setTimeOverride(1_700_000_000_000);

    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    clearTimeOverride();

    expect(listener).toHaveBeenCalledWith(null);
  });

  it("fires every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();

    subscribeToTimeOverride(a);
    subscribeToTimeOverride(b);
    subscribeToTimeOverride(c);

    setTimeOverride(1_700_000_000_000);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("does not fire immediately on subscription", () => {
    /*
     * `useSyncExternalStore` reads the current value
     * separately from the subscription. Firing on subscribe
     * would double-invoke the consumer on mount.
     */
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    expect(listener).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function that removes the listener", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTimeOverride(listener);

    setTimeOverride(1_000);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setTimeOverride(2_000);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe is idempotent", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTimeOverride(listener);

    unsubscribe();
    unsubscribe();
    unsubscribe();

    setTimeOverride(1_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("collapses duplicate subscriptions of the same function", () => {
    const listener = vi.fn();

    subscribeToTimeOverride(listener);
    subscribeToTimeOverride(listener);

    setTimeOverride(1_000);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe of a duplicate subscription removes the shared entry", () => {
    const listener = vi.fn();

    const unsubscribe = subscribeToTimeOverride(listener);
    subscribeToTimeOverride(listener);

    unsubscribe();
    setTimeOverride(1_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("allows a listener to unsubscribe itself during dispatch", () => {
    const calls: number[] = [];

    const unsubscribe = subscribeToTimeOverride((value) => {
      calls.push(value ?? -1);
      unsubscribe();
    });

    const other = vi.fn();

    subscribeToTimeOverride(other);

    setTimeOverride(1_000);
    setTimeOverride(2_000);

    expect(calls).toEqual([1_000]);
    expect(other).toHaveBeenCalledTimes(2);
  });

  it("allows a listener to subscribe a new listener during dispatch", () => {
    const order: string[] = [];

    const late = (): void => {
      order.push("late");
    };

    subscribeToTimeOverride(() => {
      order.push("first");
      subscribeToTimeOverride(late);
    });

    setTimeOverride(1_000);
    expect(order).toEqual(["first"]);

    setTimeOverride(2_000);
    expect(order).toEqual(["first", "first", "late"]);
  });

  it("propagates exceptions from a subscriber", () => {
    const throwing = vi.fn(() => {
      throw new Error("listener failed");
    });

    subscribeToTimeOverride(throwing);

    expect(() => setTimeOverride(1_000)).toThrow("listener failed");
  });

  it("stops dispatching when a subscriber throws", () => {
    const first = vi.fn(() => {
      throw new Error("stop");
    });
    const second = vi.fn();

    subscribeToTimeOverride(first);
    subscribeToTimeOverride(second);

    expect(() => setTimeOverride(1_000)).toThrow("stop");

    expect(second).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* resetTimeOverride                                                          */
/* -------------------------------------------------------------------------- */

describe("resetTimeOverride", () => {
  it("clears an active override", () => {
    setTimeOverride(1_000);
    resetTimeOverride();

    expect(getTimeOverride()).toBeNull();
  });

  it("detaches every subscriber", () => {
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    resetTimeOverride();
    setTimeOverride(1_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("is idempotent", () => {
    resetTimeOverride();
    resetTimeOverride();

    expect(getTimeOverride()).toBeNull();
  });

  it("leaves the module usable afterward", () => {
    resetTimeOverride();

    setTimeOverride(1_000);

    expect(getTimeOverride()).toBe(1_000);

    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    setTimeOverride(2_000);

    expect(listener).toHaveBeenCalledWith(2_000);
  });
});

/* -------------------------------------------------------------------------- */
/* getEffectiveNow                                                            */
/* -------------------------------------------------------------------------- */

describe("getEffectiveNow", () => {
  it("returns Date.now() when no override is active", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(12_345);

    expect(getEffectiveNow()).toBe(12_345);

    spy.mockRestore();
  });

  it("returns the override when one is active, ignoring Date.now", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(12_345);

    setTimeOverride(99_999);

    expect(getEffectiveNow()).toBe(99_999);

    spy.mockRestore();
  });

  it("does not call Date.now while an override is active", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(12_345);

    setTimeOverride(99_999);
    spy.mockClear();

    getEffectiveNow();
    getEffectiveNow();

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("returns epoch 0 correctly (does not fall through on falsy)", () => {
    /*
     * Regression guard: `currentOverride ?? Date.now()` is
     * the correct expression. `currentOverride || Date.now()`
     * would fall through on `0`, which is a valid instant.
     */
    setTimeOverride(0);

    const spy = vi.spyOn(Date, "now").mockReturnValue(12_345);

    expect(getEffectiveNow()).toBe(0);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* Interaction with the "back to now" flow                                    */
/* -------------------------------------------------------------------------- */

describe("override lifecycle", () => {
  it("set → clear → set works correctly", () => {
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    setTimeOverride(1_000);
    clearTimeOverride();
    setTimeOverride(2_000);

    expect(listener.mock.calls).toEqual([
      [1_000],
      [null],
      [2_000],
    ]);
    expect(getTimeOverride()).toBe(2_000);
  });

  it("setting the same value across a clear fires twice (clear → set)", () => {
    const listener = vi.fn();
    subscribeToTimeOverride(listener);

    setTimeOverride(1_000);
    clearTimeOverride();
    setTimeOverride(1_000);

    expect(listener).toHaveBeenCalledTimes(3);
  });
});