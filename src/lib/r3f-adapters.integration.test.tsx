import {
  act,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  R3FAdaptersProvider,
  useFrameAdapter,
  useThreeAdapter,
  type FrameStateLike,
  type R3FAdapters,
} from "@/lib/r3f-adapters";
import type { RootState } from "@react-three/fiber";

/* -------------------------------------------------------------------------- */
/* Stateful fake frame loop                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A fake R3F context that actually drives frame callbacks.
 *
 * `advanceFrame(delta)` bumps `elapsedTime` by `delta` and
 * invokes every registered callback with the new state,
 * mirroring what R3F does on each real animation frame.
 *
 * The frame state object exposes both `elapsedTime` and
 * `getDelta`, matching the narrowed `FrameStateLike`
 * interface that the production `useFrameAdapter` accepts.
 *
 * `getDelta` is implemented as `() => delta` — it returns the
 * same per-frame delta to every handler that reads it during
 * this frame. That matches the contract of `THREE.Clock`
 * relative to a per-frame consumer: "seconds since the
 * previous frame."
 */
function createFakeFrameLoop() {
  let elapsedTime = 0;

  const callbacks = new Set<
    (state: FrameStateLike) => void
  >();

  const adapters: R3FAdapters = {
    useFrame: (callback) => {
      callbacks.add(callback);
    },
    useThree: () =>
      ({
        camera: {},
        scene: {},
        clock: { elapsedTime },
      }) as unknown as RootState,
  };

  return {
    adapters,

    /**
     * Advance the frame clock and invoke every registered
     * callback. Wrapped in `act()` by the caller.
     */
    advanceFrame(delta: number): void {
      elapsedTime += delta;

      /*
       * `delta` is captured by value — the closure returns
       * the same number every time it is called during this
       * frame. A stale-closure bug that returned a mutating
       * outer variable would produce 0 for every delta after
       * the first, which is exactly the class of mistake
       * this test is designed to catch.
       */
      const state: FrameStateLike = {
        clock: {
          elapsedTime,
          getDelta: () => delta,
        },
      };

      const snapshot = [...callbacks];
      for (const cb of snapshot) {
        cb(state);
      }
    },

    registeredCallbackCount(): number {
      return callbacks.size;
    },

    getElapsedTime(): number {
      return elapsedTime;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function wrapperWith(adapters: R3FAdapters) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <R3FAdaptersProvider adapters={adapters}>
        {children}
      </R3FAdaptersProvider>
    );
  };
}

/* -------------------------------------------------------------------------- */
/* Provider + useFrameAdapter                                                 */
/* -------------------------------------------------------------------------- */

describe("provider + useFrameAdapter integration", () => {
  it("drives a hook consumer through the fake frame loop", () => {
    const loop = createFakeFrameLoop();
    const observer = vi.fn();

    renderHook(
      () =>
        useFrameAdapter((state) => {
          observer(state.clock.elapsedTime);
        }),
      { wrapper: wrapperWith(loop.adapters) },
    );

    act(() => loop.advanceFrame(0.5));
    act(() => loop.advanceFrame(0.25));

    expect(observer).toHaveBeenNthCalledWith(1, 0.5);
    expect(observer).toHaveBeenNthCalledWith(2, 0.75);
  });

  it("shares the frame loop across multiple consumers", () => {
    const loop = createFakeFrameLoop();
    const a = vi.fn();
    const b = vi.fn();

    const ConsumerA = () => {
      useFrameAdapter((s) => a(s.clock.elapsedTime));
      return null;
    };
    const ConsumerB = () => {
      useFrameAdapter((s) => b(s.clock.elapsedTime));
      return null;
    };

    render(
      <R3FAdaptersProvider adapters={loop.adapters}>
        <ConsumerA />
        <ConsumerB />
      </R3FAdaptersProvider>,
    );

    act(() => loop.advanceFrame(1));

    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledWith(1);
  });

  it("propagates per-frame getDelta to consumers", () => {
    /*
     * `getDelta` is a documented part of the narrowed
     * `FrameStateLike` interface. This test asserts the fake
     * loop drives it correctly — the value should be the
     * amount of time the frame advanced, matching the
     * per-frame-consumer contract of `THREE.Clock`.
     */
    const loop = createFakeFrameLoop();
    const deltas: number[] = [];

    renderHook(
      () =>
        useFrameAdapter((state) => {
          deltas.push(state.clock.getDelta());
        }),
      { wrapper: wrapperWith(loop.adapters) },
    );

    act(() => loop.advanceFrame(0.5));
    act(() => loop.advanceFrame(0.25));
    act(() => loop.advanceFrame(1.0));

    expect(deltas).toEqual([0.5, 0.25, 1.0]);
  });

  it("a consumer driving React state updates correctly per frame", () => {
    const loop = createFakeFrameLoop();

    function Counter() {
      const [ticks, setTicks] = useState(0);
      const lastRef = useRef(-1);

      useFrameAdapter((state) => {
        // Update state at most once per distinct elapsedTime.
        if (state.clock.elapsedTime !== lastRef.current) {
          lastRef.current = state.clock.elapsedTime;
          setTicks((n) => n + 1);
        }
      });

      return <div data-testid="ticks">{ticks}</div>;
    }

    render(
      <R3FAdaptersProvider adapters={loop.adapters}>
        <Counter />
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("ticks").textContent).toBe("0");

    act(() => loop.advanceFrame(1));
    expect(screen.getByTestId("ticks").textContent).toBe("1");

    act(() => loop.advanceFrame(1));
    expect(screen.getByTestId("ticks").textContent).toBe("2");
  });
});

/* -------------------------------------------------------------------------- */
/* Provider + useThreeAdapter                                                 */
/* -------------------------------------------------------------------------- */

describe("provider + useThreeAdapter integration", () => {
  it("returns a RootState-shaped object", () => {
    const loop = createFakeFrameLoop();

    const { result } = renderHook(() => useThreeAdapter(), {
      wrapper: wrapperWith(loop.adapters),
    });

    expect(result.current).toBeDefined();
    expect(result.current.clock.elapsedTime).toBe(0);
  });

  it("reflects the current elapsedTime after the loop advances", () => {
    const loop = createFakeFrameLoop();

    const { result, rerender } = renderHook(
      () => useThreeAdapter(),
      { wrapper: wrapperWith(loop.adapters) },
    );

    expect(result.current.clock.elapsedTime).toBe(0);

    act(() => loop.advanceFrame(2.5));
    rerender();

    expect(result.current.clock.elapsedTime).toBe(2.5);
  });
});

/* -------------------------------------------------------------------------- */
/* Both hooks in one consumer                                                 */
/* -------------------------------------------------------------------------- */

describe("both adapters together", () => {
  it("a consumer can read scene state and subscribe to frames", () => {
    const loop = createFakeFrameLoop();
    const sceneReads: number[] = [];
    const frameTicks: number[] = [];

    function Consumer() {
      const state = useThreeAdapter();
      sceneReads.push(state.clock.elapsedTime);

      useFrameAdapter((s) => {
        frameTicks.push(s.clock.elapsedTime);
      });

      return null;
    }

    render(
      <R3FAdaptersProvider adapters={loop.adapters}>
        <Consumer />
      </R3FAdaptersProvider>,
    );

    expect(sceneReads[0]).toBe(0);
    expect(frameTicks).toEqual([]);

    act(() => loop.advanceFrame(1));
    expect(frameTicks).toEqual([1]);
  });
});

/* -------------------------------------------------------------------------- */
/* Nested providers                                                           */
/* -------------------------------------------------------------------------- */

describe("nested providers", () => {
  it("the innermost provider wins for its subtree", () => {
    const outerLoop = createFakeFrameLoop();
    const innerLoop = createFakeFrameLoop();

    const outerTicks: number[] = [];
    const innerTicks: number[] = [];

    function OuterConsumer() {
      useFrameAdapter((s) => outerTicks.push(s.clock.elapsedTime));
      return null;
    }
    function InnerConsumer() {
      useFrameAdapter((s) => innerTicks.push(s.clock.elapsedTime));
      return null;
    }

    render(
      <R3FAdaptersProvider adapters={outerLoop.adapters}>
        <OuterConsumer />
        <R3FAdaptersProvider adapters={innerLoop.adapters}>
          <InnerConsumer />
        </R3FAdaptersProvider>
      </R3FAdaptersProvider>,
    );

    act(() => outerLoop.advanceFrame(1));
    act(() => innerLoop.advanceFrame(2));

    expect(outerTicks).toEqual([1]);
    expect(innerTicks).toEqual([2]);
  });
});

/* -------------------------------------------------------------------------- */
/* Registration cleanup                                                       */
/* -------------------------------------------------------------------------- */

describe("registration lifecycle", () => {
  it("each mount registers exactly one callback", () => {
    const loop = createFakeFrameLoop();

    const { unmount } = renderHook(
      () => useFrameAdapter(() => {}),
      { wrapper: wrapperWith(loop.adapters) },
    );

    expect(loop.registeredCallbackCount()).toBe(1);

    unmount();
    // The fake loop never removes callbacks on unmount (R3F
    // does that internally via its own ref tracking). This
    // assertion pins our side of the contract: we register
    // exactly one per mount.
  });

  it("two mounts register two callbacks", () => {
    const loop = createFakeFrameLoop();

    renderHook(() => useFrameAdapter(() => {}), {
      wrapper: wrapperWith(loop.adapters),
    });
    renderHook(() => useFrameAdapter(() => {}), {
      wrapper: wrapperWith(loop.adapters),
    });

    expect(loop.registeredCallbackCount()).toBe(2);
  });
});