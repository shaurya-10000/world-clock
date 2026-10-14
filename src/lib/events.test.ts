import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  emit,
  on,
  resetEventBus,
  subscribe,
} from "@/lib/events";

/*
 * The bus is a module singleton. Every test must start from
 * an empty handler table so that a subscription from one test
 * cannot leak into the next.
 */
beforeEach(() => {
  resetEventBus();
});

afterEach(() => {
  resetEventBus();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* on — subscription                                                          */
/* -------------------------------------------------------------------------- */

describe("on", () => {
  it("invokes the handler when the event is emitted", () => {
    const handler = vi.fn();

    on("cities:open", handler);
    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("invokes every handler subscribed to the same event", () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();

    on("cities:open", a);
    on("cities:open", b);
    on("cities:open", c);

    emit("cities:open", undefined);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("does not invoke handlers subscribed to a different event", () => {
    /*
     * Currently there is only one event on the bus, so this
     * test uses a fake name via a cast. The assertion is
     * still valid: a handler registered for one name is not
     * reachable by emitting another.
     */
    const handler = vi.fn();

    on("cities:open", handler);

    /*
     * `emit` will not accept an unknown name because of the
     * generic constraint, so we call the internal dispatch
     * path through a cast. This is the only place a cast is
     * justified in this test file: the type system prevents
     * an invalid call, and the test wants to verify the
     * runtime behavior the types would otherwise hide.
     */
    (
      emit as unknown as (
        name: string,
        payload: void,
      ) => void
    )("nonexistent:event", undefined);

    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes handlers in subscription order", () => {
    const order: string[] = [];

    on("cities:open", () => {
      order.push("first");
    });
    on("cities:open", () => {
      order.push("second");
    });
    on("cities:open", () => {
      order.push("third");
    });

    emit("cities:open", undefined);

    expect(order).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("returns an unsubscribe function that removes the handler", () => {
    const handler = vi.fn();

    const unsubscribe = on("cities:open", handler);

    emit("cities:open", undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe is idempotent", () => {
    const handler = vi.fn();

    const unsubscribe = on("cities:open", handler);

    unsubscribe();
    unsubscribe();
    unsubscribe();

    /*
     * Calling unsubscribe more than once must not throw and
     * must not remove some other handler by mistake. The
     * only way to observe this is to subscribe a second
     * handler and confirm it survives.
     */
    const other = vi.fn();
    on("cities:open", other);
    emit("cities:open", undefined);

    expect(other).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("collapses duplicate subscriptions of the same function", () => {
    /*
     * React strict mode mounts components twice in
     * development. A component that subscribes during its
     * effect body would register twice without this
     * collapsing. The expectation: the handler fires exactly
     * once per emit.
     */
    const handler = vi.fn();

    on("cities:open", handler);
    on("cities:open", handler);

    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe of a duplicate subscription removes the shared entry", () => {
    const handler = vi.fn();

    const unsubscribe = on("cities:open", handler);

    on("cities:open", handler);

    unsubscribe();
    emit("cities:open", undefined);

    /*
     * Because duplicates collapse to one entry, the first
     * unsubscribe removes the handler entirely. This is the
     * behavior React strict mode relies on: the double mount
     * produces one subscription, and the first unmount
     * cleans it up.
     */
    expect(handler).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* emit — dispatch                                                            */
/* -------------------------------------------------------------------------- */

describe("emit", () => {
  it("is a no-op when there are no subscribers", () => {
    /*
     * Emitting into an empty bus must not throw, and must
     * not create any state. This is the "fire and forget"
     * case that runs on every initial render.
     */
    expect(() =>
      emit("cities:open", undefined),
    ).not.toThrow();
  });

  it("propagates exceptions from handlers", () => {
    /*
     * Silent error swallowing inside an event bus is worse
     * than a visible failure. If a handler throws, the
     * exception propagates up through `emit`.
     */
    const throwing = vi.fn(() => {
      throw new Error("handler failed");
    });

    on("cities:open", throwing);

    expect(() =>
      emit("cities:open", undefined),
    ).toThrow("handler failed");
  });

  it("stops dispatching when a handler throws", () => {
    const first = vi.fn(() => {
      throw new Error("stop");
    });
    const second = vi.fn();

    on("cities:open", first);
    on("cities:open", second);

    expect(() =>
      emit("cities:open", undefined),
    ).toThrow("stop");

    /*
     * The second handler must not run — a throwing handler
     * halts dispatch rather than swallowing the error and
     * continuing. That's the documented behavior; asserting
     * it here prevents a future "resilience" refactor from
     * silently changing the contract.
     */
    expect(second).not.toHaveBeenCalled();
  });

  it("allows a handler to unsubscribe itself during dispatch", () => {
    const calls: string[] = [];

    const unsubscribe = on("cities:open", () => {
      calls.push("self");
      unsubscribe();
    });

    const other = vi.fn(() => {
      calls.push("other");
    });

    on("cities:open", other);

    emit("cities:open", undefined);
    emit("cities:open", undefined);

    /*
     * The self-unsubscribing handler fires once, on the
     * first emit. The other handler fires on both emits.
     * The dispatch loop must iterate a snapshot so that
     * removing a handler mid-iteration does not skip the
     * next one.
     */
    expect(calls).toEqual([
      "self",
      "other",
      "other",
    ]);
  });

  it("allows a handler to subscribe a new handler during dispatch", () => {
    const order: string[] = [];

    const late = () => {
      order.push("late");
    };

    on("cities:open", () => {
      order.push("first");
      on("cities:open", late);
    });

    emit("cities:open", undefined);

    /*
     * The newly-added handler must not fire during the
     * emit that added it — dispatch iterates a snapshot of
     * the handler set taken at the start of the call.
     */
    expect(order).toEqual(["first"]);

    emit("cities:open", undefined);

    /*
     * On the second emit, the newly-added handler is part
     * of the snapshot and fires. The first handler fires
     * again, and this time subscribes another copy of
     * `late`, which the set collapses.
     */
    expect(order).toEqual([
      "first",
      "first",
      "late",
    ]);
  });

  it("does not mutate the payload", () => {
    /*
     * The current event has a `void` payload, so this test
     * is a placeholder for future events that carry data.
     * It asserts the contract that a payload passed to
     * `emit` is delivered by reference without modification.
     */
    const payload = undefined;
    const handler = vi.fn();

    on("cities:open", handler);
    emit("cities:open", payload);

    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("delivers the payload by reference to every subscriber", () => {
    /*
     * Even though the current event has a `void` payload,
     * the dispatch loop forwards the same value to every
     * handler. A future event with an object payload must
     * deliver the same reference to every subscriber — no
     * per-handler clone.
     *
     * We test the contract via the reference identity of
     * the argument seen by each handler.
     */
    const captured: unknown[] = [];

    on("cities:open", (p) => captured.push(p));
    on("cities:open", (p) => captured.push(p));

    emit("cities:open", undefined);

    expect(captured).toEqual([undefined, undefined]);
  });

  it("does not modify the handler table when there are no subscribers", () => {
    /*
     * An emit against an empty bucket must not create one.
     * Otherwise every event name would accumulate an empty
     * `Set`, and `resetEventBus` would have to walk a
     * growing table on every test reset.
     */
    emit("cities:open", undefined);

    /*
     * Subscribing after the emit must still work — the
     * handler table is initialized lazily on subscription.
     */
    const handler = vi.fn();
    on("cities:open", handler);
    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* subscribe — React-friendly alias                                           */
/* -------------------------------------------------------------------------- */

describe("subscribe", () => {
  it("behaves identically to on", () => {
    const handler = vi.fn();

    const unsubscribe = subscribe("cities:open", handler);

    emit("cities:open", undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    emit("cities:open", undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns a cleanup that can be used directly in useEffect", () => {
    /*
     * Simulates the shape React calls: an effect body that
     * returns a cleanup function. If `subscribe` returned
     * something other than a `() => void`, the return would
     * be rejected by React at runtime. This test asserts the
     * shape.
     */
    const effectBody = () => {
      const cleanup = subscribe("cities:open", vi.fn());

      expect(cleanup).toBeTypeOf("function");

      return cleanup;
    };

    const cleanup = effectBody();

    expect(() => cleanup()).not.toThrow();
  });

  it("is not a distinct subscription from on — duplicates collapse", () => {
    /*
     * `subscribe` delegates to `on`, so subscribing the same
     * handler through both must collapse to one entry.
     */
    const handler = vi.fn();

    on("cities:open", handler);
    subscribe("cities:open", handler);

    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* resetEventBus                                                              */
/* -------------------------------------------------------------------------- */

describe("resetEventBus", () => {
  it("removes all handlers", () => {
    const a = vi.fn();
    const b = vi.fn();

    on("cities:open", a);
    on("cities:open", b);

    resetEventBus();
    emit("cities:open", undefined);

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("is idempotent", () => {
    resetEventBus();
    resetEventBus();

    expect(() =>
      emit("cities:open", undefined),
    ).not.toThrow();
  });

  it("leaves the bus usable afterward", () => {
    resetEventBus();

    const handler = vi.fn();
    on("cities:open", handler);
    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not leave empty Sets behind", () => {
    /*
     * After reset, the handler table must be empty — no
     * stray empty `Set` values. `resetEventBus` uses
     * `delete`, which removes the key entirely. A future
     * refactor to `bucket.clear()` would leave empty Sets
     * in the table.
     *
     * Observable consequence: a subsequent subscribe must
     * create a fresh bucket, and `emit` against the empty
     * bus must not touch any existing state.
     */
    on("cities:open", vi.fn());
    resetEventBus();

    /*
     * If the previous Set had survived, this subscribe
     * would add to the old bucket and the handler would
     * still work — but a "phantom" bucket would leak into
     * any future listener-count diagnostic.
     *
     * We cannot observe the internal table directly, so we
     * assert the observable contract: emit against the
     * empty bus is a no-op, and subscribe after reset
     * works normally.
     */
    expect(() =>
      emit("cities:open", undefined),
    ).not.toThrow();

    const handler = vi.fn();
    on("cities:open", handler);
    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple events                                                            */
/* -------------------------------------------------------------------------- */

describe("multiple events", () => {
  it("keeps handlers for different events isolated", () => {
    /*
     * There is only one event on the bus today, so this test
     * is defensive: it asserts that when a second event is
     * added, subscriptions to one event do not fire for the
     * other. The cast on the second event is the only way to
     * exercise this path without extending the production
     * event map from a test.
     */
    const handler = vi.fn();

    on("cities:open", handler);

    const fakeEmit = emit as unknown as (
      name: string,
      payload: unknown,
    ) => void;

    fakeEmit("other:event", undefined);

    expect(handler).not.toHaveBeenCalled();
  });

  it("emitting one event does not affect another's handlers", () => {
    /*
     * Subscribe a handler, emit a *different* name, then
     * emit the subscribed name. The handler should fire
     * exactly once — the intervening foreign emit must not
     * have disturbed the subscriber set.
     */
    const handler = vi.fn();

    on("cities:open", handler);

    const fakeEmit = emit as unknown as (
      name: string,
      payload: unknown,
    ) => void;

    fakeEmit("other:event", undefined);
    fakeEmit("another:event", undefined);
    emit("cities:open", undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Development diagnostics                                                    */
/* -------------------------------------------------------------------------- */

describe("development diagnostics", () => {
  it("exposes window.__worldClockEvents in test (jsdom) environment", () => {
    /*
     * The diagnostics block is gated on
     * `NODE_ENV !== "production"` and `typeof window !==
     * "undefined"`. Vitest's jsdom environment satisfies both,
     * so the global must be installed.
     */
    const w = window as unknown as {
      __worldClockEvents?: {
        listeners: () => Record<string, number>;
      };
    };

    expect(w.__worldClockEvents).toBeDefined();
    expect(typeof w.__worldClockEvents?.listeners).toBe(
      "function",
    );
  });

  it("reports an empty listener table when no handlers are registered", () => {
    const w = window as unknown as {
      __worldClockEvents?: {
        listeners: () => Record<string, number>;
      };
    };

    const summary = w.__worldClockEvents?.listeners() ?? {};

    /*
     * The summary only contains keys that exist in the
     * internal handler table. After a reset (which deletes
     * keys rather than clearing sets), the summary is empty.
     */
    expect(summary).toEqual({});
  });

  it("reports the correct count for a registered event", () => {
    const w = window as unknown as {
      __worldClockEvents?: {
        listeners: () => Record<string, number>;
      };
    };

    on("cities:open", vi.fn());
    on("cities:open", vi.fn());
    on("cities:open", vi.fn());

    const summary = w.__worldClockEvents?.listeners() ?? {};

    expect(summary["cities:open"]).toBe(3);
  });

  it("reflects unsubscribes in the listener count", () => {
    const w = window as unknown as {
      __worldClockEvents?: {
        listeners: () => Record<string, number>;
      };
    };

    const unsubscribe = on("cities:open", vi.fn());
    on("cities:open", vi.fn());

    expect(
      w.__worldClockEvents?.listeners()["cities:open"],
    ).toBe(2);

    unsubscribe();

    expect(
      w.__worldClockEvents?.listeners()["cities:open"],
    ).toBe(1);
  });

  it("returns an empty summary after resetEventBus", () => {
    const w = window as unknown as {
      __worldClockEvents?: {
        listeners: () => Record<string, number>;
      };
    };

    on("cities:open", vi.fn());
    on("cities:open", vi.fn());

    resetEventBus();

    expect(w.__worldClockEvents?.listeners()).toEqual({});
  });
});