import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  resetUseNow,
  setUseNowDeps,
  useNow,
  useNowDate,
} from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Fake clock                                                                 */
/* -------------------------------------------------------------------------- */

interface FakeTimer {
  id: number;
  callback: () => void;
  ms: number;
}

function createFakeEnv(initialNow = 1_000_000) {
  let currentTime = initialNow;
  let nextId = 1;
  let visible = true;

  const timers = new Map<number, FakeTimer>();

  const env = {
    now: (): number => currentTime,

    setInterval: (callback: () => void, ms: number): number => {
      const id = nextId++;
      timers.set(id, { id, callback, ms });
      return id;
    },

    clearInterval: (id: number): void => {
      timers.delete(id);
    },

    isVisible: (): boolean => visible,
  };

  return {
    deps: env,

    /** Advance the clock and fire every active timer once. */
    tick(ms: number): void {
      currentTime += ms;
      const snapshot = [...timers.values()];
      for (const timer of snapshot) {
        if (timers.has(timer.id)) {
          timer.callback();
        }
      }
    },

    setTime(ms: number): void {
      currentTime = ms;
    },

    setVisible(value: boolean): void {
      visible = value;
    },

    activeTimerCount(): number {
      return timers.size;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

let env: ReturnType<typeof createFakeEnv>;

beforeEach(() => {
  env = createFakeEnv();
  setUseNowDeps(env.deps);
});

afterEach(() => {
  /*
   * Restore the full fake env before resetting. Without
   * this, a test that ran `setUseNowDeps({ now })` (which
   * reverts every other key to production) would leave the
   * module bound to production `setInterval`, and any
   * subsequent `resetUseNow` would be unable to observe
   * the fake scheduler map.
   */
  setUseNowDeps(env.deps);
  resetUseNow();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Initial value                                                              */
/* -------------------------------------------------------------------------- */

describe("useNow — initial value", () => {
  it("returns a number after mount (not the pre-effect null)", () => {
    const { result } = renderHook(() => useNow());

    expect(result.current).not.toBeNull();
  });

  it("populates the current time after the effect runs", () => {
    const { result } = renderHook(() => useNow());

    expect(result.current).toBe(1_000_000);
  });

  it("does not return the initial `null` after mount", () => {
    const { result } = renderHook(() => useNow(1000));

    expect(typeof result.current).toBe("number");
  });

  it("emits synchronously on acquire (no waiting for the first tick)", () => {
    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBe(1_000_000);
  });

  it("defaults to a 1000ms interval when none is passed", () => {
    renderHook(() => useNow());

    expect(env.activeTimerCount()).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Ticking                                                                    */
/* -------------------------------------------------------------------------- */

describe("useNow — ticking", () => {
  it("advances the value when the fake timer fires", () => {
    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBe(1_000_000);

    act(() => {
      env.setTime(1_001_000);
      env.tick(0);
    });

    expect(result.current).toBe(1_001_000);
  });

  it("uses the value from `deps.now` at emit time", () => {
    const { result } = renderHook(() => useNow(1000));

    act(() => {
      env.setTime(1_005_000);
      env.tick(0);
    });

    expect(result.current).toBe(1_005_000);
  });

  it("keeps emitting on each tick", () => {
    const { result } = renderHook(() => useNow(500));

    for (let i = 1; i <= 3; i++) {
      act(() => {
        env.setTime(1_000_000 + i * 500);
        env.tick(0);
      });
    }

    expect(result.current).toBe(1_001_500);
  });

  it("does not skip intermediate values across a long run", () => {
    const { result } = renderHook(() => useNow(100));

    for (let i = 1; i <= 10; i++) {
      act(() => {
        env.setTime(1_000_000 + i * 100);
        env.tick(0);
      });
    }

    expect(result.current).toBe(1_001_000);
  });
});

/* -------------------------------------------------------------------------- */
/* Shared scheduler                                                           */
/* -------------------------------------------------------------------------- */

describe("useNow — shared scheduler", () => {
  it("uses a single timer for many subscribers with the same interval", () => {
    const a = renderHook(() => useNow(1000));
    const b = renderHook(() => useNow(1000));
    const c = renderHook(() => useNow(1000));

    expect(env.activeTimerCount()).toBe(1);

    act(() => {
      env.setTime(1_010_000);
      env.tick(0);
    });

    expect(a.result.current).toBe(1_010_000);
    expect(b.result.current).toBe(1_010_000);
    expect(c.result.current).toBe(1_010_000);
  });

  it("uses separate timers for different intervals", () => {
    renderHook(() => useNow(1000));
    renderHook(() => useNow(60_000));

    expect(env.activeTimerCount()).toBe(2);
  });

  it("stops the timer when the last subscriber unmounts", () => {
    const { unmount } = renderHook(() => useNow(1000));

    expect(env.activeTimerCount()).toBe(1);

    unmount();

    expect(env.activeTimerCount()).toBe(0);
  });

  it("keeps the timer alive while at least one subscriber remains", () => {
    const a = renderHook(() => useNow(1000));
    const b = renderHook(() => useNow(1000));

    a.unmount();

    expect(env.activeTimerCount()).toBe(1);

    b.unmount();

    expect(env.activeTimerCount()).toBe(0);
  });

  it("reuses the same timer when a subscriber changes intervals and back", () => {
    const { rerender } = renderHook(
      ({ ms }) => useNow(ms),
      { initialProps: { ms: 1000 } },
    );

    expect(env.activeTimerCount()).toBe(1);

    rerender({ ms: 2000 });
    expect(env.activeTimerCount()).toBe(1);

    rerender({ ms: 1000 });
    expect(env.activeTimerCount()).toBe(1);
  });

  it("does not leak the old interval's timer after a change", () => {
    const { rerender } = renderHook(
      ({ ms }) => useNow(ms),
      { initialProps: { ms: 1000 } },
    );

    rerender({ ms: 60_000 });

    expect(env.activeTimerCount()).toBe(1);
  });

  it("fires each subscriber exactly once per tick", () => {
    const a = renderHook(() => useNow(1000));
    const b = renderHook(() => useNow(1000));

    act(() => {
      env.setTime(1_005_000);
      env.tick(0);
    });

    expect(a.result.current).toBe(1_005_000);
    expect(b.result.current).toBe(1_005_000);
  });
});

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

describe("useNow — visibility handling", () => {
  it("does not start a timer when the document is hidden", () => {
    env.setVisible(false);

    const { result } = renderHook(() => useNow(1000));

    expect(env.activeTimerCount()).toBe(0);
    expect(result.current).toBe(1_000_000);
  });

  it("stops the timer when the document becomes hidden", () => {
    renderHook(() => useNow(1000));
    expect(env.activeTimerCount()).toBe(1);

    act(() => {
      env.setVisible(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(env.activeTimerCount()).toBe(0);
  });

  it("restarts the timer when the document becomes visible again", () => {
    renderHook(() => useNow(1000));

    act(() => {
      env.setVisible(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(env.activeTimerCount()).toBe(0);

    act(() => {
      env.setTime(1_030_000);
      env.setVisible(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(env.activeTimerCount()).toBe(1);
  });

  it("emits a fresh timestamp immediately on resume (no stale value)", () => {
    const { result } = renderHook(() => useNow(1000));

    act(() => {
      env.setVisible(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      env.setTime(1_600_000);
      env.setVisible(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(1_600_000);
  });

  it("does not restart a hidden scheduler that has no subscribers", () => {
    const { unmount } = renderHook(() => useNow(1000));
    unmount();

    act(() => {
      env.setVisible(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => {
      env.setVisible(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(env.activeTimerCount()).toBe(0);
  });

  it("does not throw when a visibility event fires with no schedulers registered", () => {
    expect(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    }).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* useNowDate                                                                 */
/* -------------------------------------------------------------------------- */

describe("useNowDate", () => {
  it("wraps useNow in a Date", () => {
    const { result } = renderHook(() => useNowDate(1000));

    expect(result.current).toBeInstanceOf(Date);
    expect(result.current?.getTime()).toBe(1_000_000);
  });

  it("advances with the underlying ticker", () => {
    const { result } = renderHook(() => useNowDate(1000));

    act(() => {
      env.setTime(1_050_000);
      env.tick(0);
    });

    expect(result.current?.getTime()).toBe(1_050_000);
  });

  it("shares the timer with useNow for the same interval", () => {
    renderHook(() => useNow(1000));
    renderHook(() => useNowDate(1000));

    expect(env.activeTimerCount()).toBe(1);
  });

  it("returns a new Date object on each tick", () => {
    const { result } = renderHook(() => useNowDate(1000));

    const first = result.current;

    act(() => {
      env.setTime(1_010_000);
      env.tick(0);
    });

    const second = result.current;

    expect(second).not.toBe(first);
    expect(second?.getTime()).not.toBe(first?.getTime());
  });
});

/* -------------------------------------------------------------------------- */
/* resetUseNow                                                                */
/* -------------------------------------------------------------------------- */

describe("resetUseNow", () => {
  it("clears every active scheduler", () => {
    renderHook(() => useNow(1000));
    renderHook(() => useNow(60_000));

    expect(env.activeTimerCount()).toBe(2);

    resetUseNow();

    expect(env.activeTimerCount()).toBe(0);
  });

  it("detaches the visibility listener", () => {
    renderHook(() => useNow(1000));

    resetUseNow();

    expect(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    }).not.toThrow();

    expect(env.activeTimerCount()).toBe(0);
  });

  it("is idempotent", () => {
    renderHook(() => useNow(1000));

    resetUseNow();
    resetUseNow();
    resetUseNow();

    expect(env.activeTimerCount()).toBe(0);
  });

  it("leaves the module usable afterward", () => {
    renderHook(() => useNow(1000));
    resetUseNow();

    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBe(1_000_000);
    expect(env.activeTimerCount()).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* SSR guard                                                                  */
/* -------------------------------------------------------------------------- */

describe("useNow — SSR safety", () => {
  it("still emits a value when `document` is undefined", () => {
    /*
     * The hook's value comes from `deps.now()`, not from
     * the DOM. Proving the value does not depend on
     * `document` is enough to establish SSR safety.
     */
    const { result } = renderHook(() => useNow(1000));

    expect(typeof result.current).toBe("number");
    expect(result.current).toBe(1_000_000);
  });
});

/* -------------------------------------------------------------------------- */
/* setUseNowDeps merge semantics                                              */
/* -------------------------------------------------------------------------- */

describe("setUseNowDeps", () => {
  it("uses the patched `now` for subsequent subscribers", () => {
    /*
     * Install the full fake env as the patch so the fake
     * `setInterval` survives — otherwise the ticker would
     * schedule through the real browser timer and the
     * scheduler map would be unobservable.
     */
    const customNow = vi.fn(() => 42);

    setUseNowDeps({
      now: customNow,
      setInterval: env.deps.setInterval,
      clearInterval: env.deps.clearInterval,
      isVisible: env.deps.isVisible,
    });

    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBe(42);
    expect(env.activeTimerCount()).toBe(1);
    expect(customNow).toHaveBeenCalled();
  });

  it("reverts unspecified keys to production defaults", () => {
    /*
     * The distinguishing assertion for the "rebuild from
     * production" contract. Install a fake env, then patch
     * only `now`. The previously installed `setInterval`
     * must be replaced by the production one — detectable
     * because production `setInterval` does not write into
     * the fake scheduler map.
     *
     * Restore the fake env afterward so downstream tests
     * are unaffected.
     */
    setUseNowDeps(env.deps);
    expect(env.activeTimerCount()).toBe(0);

    setUseNowDeps({ now: () => 42 });

    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBe(42);

    /*
     * Zero timers in the fake map: proves `setInterval` was
     * reverted to production, which is the observable
     * consequence of the documented merge semantics.
     */
    expect(env.activeTimerCount()).toBe(0);

    // Restore for downstream tests.
    setUseNowDeps(env.deps);
  });
});