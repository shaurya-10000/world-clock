import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { renderHook } from "@testing-library/react";
import {
  createElement,
  type ReactElement,
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
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const FAKE_ROOT_STATE = {
  camera: { type: "PerspectiveCamera", name: "fake-camera" },
  scene: { type: "Scene", name: "fake-scene" },
  clock: { elapsedTime: 0 },
} as unknown as RootState;

function makeFakeAdapters(): {
  adapters: R3FAdapters;
  frameCallbacks: Array<(state: FrameStateLike) => void>;
  threeCallCount: { value: number };
} {
  const frameCallbacks: Array<(state: FrameStateLike) => void> = [];
  const threeCallCount = { value: 0 };

  const adapters: R3FAdapters = {
    useFrame: (callback) => {
      frameCallbacks.push(callback);
    },
    useThree: () => {
      threeCallCount.value += 1;
      return FAKE_ROOT_STATE;
    },
  };

  return { adapters, frameCallbacks, threeCallCount };
}

/**
 * A frame state that satisfies the narrowed `FrameStateLike`
 * interface. `getDelta` returns a fixed value — tests that
 * care about delta behavior should use their own fixture.
 */
function makeFrameState(
  elapsedTime: number,
  delta = 0,
): FrameStateLike {
  return {
    clock: {
      elapsedTime,
      getDelta: () => delta,
    },
  };
}

function makeWrapper(adapters: R3FAdapters) {
  return function Wrapper({
    children,
  }: {
    children: ReactNode;
  }): ReactElement {
    return createElement(R3FAdaptersProvider, {
      adapters,
      children,
    });
  };
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* R3FAdaptersProvider                                                        */
/* -------------------------------------------------------------------------- */

describe("R3FAdaptersProvider", () => {
  it("renders its children", () => {
    const { adapters } = makeFakeAdapters();
    const { result } = renderHook(() => "ok", {
      wrapper: makeWrapper(adapters),
    });

    expect(result.current).toBe("ok");
  });

  it("provides the supplied adapters to descendants", () => {
    const { adapters } = makeFakeAdapters();

    const { result } = renderHook(() => useThreeAdapter(), {
      wrapper: makeWrapper(adapters),
    });

    expect(result.current).toBe(FAKE_ROOT_STATE);
  });

  it("passes the adapters object by reference, not by copy", () => {
    /*
     * `useAdapters` returns the exact object passed to the
     * provider. If a refactor started spreading or copying
     * the object, callback identity checks elsewhere would
     * break silently.
     */
    const { adapters } = makeFakeAdapters();

    let captured: R3FAdapters | null = null;
    renderHook(
      () => {
        captured = adapters;
      },
      { wrapper: makeWrapper(adapters) },
    );

    expect(captured).toBe(adapters);
  });
});

/* -------------------------------------------------------------------------- */
/* useFrameAdapter                                                            */
/* -------------------------------------------------------------------------- */

describe("useFrameAdapter", () => {
  it("calls the supplied useFrame once per render", () => {
    const { adapters, frameCallbacks } = makeFakeAdapters();

    const callback = vi.fn();
    renderHook(() => useFrameAdapter(callback), {
      wrapper: makeWrapper(adapters),
    });

    expect(frameCallbacks).toHaveLength(1);
  });

  it("forwards the exact callback reference to useFrame", () => {
    const { adapters, frameCallbacks } = makeFakeAdapters();

    const callback = vi.fn();
    renderHook(() => useFrameAdapter(callback), {
      wrapper: makeWrapper(adapters),
    });

    expect(frameCallbacks[0]).toBe(callback);
  });

  it("invokes the callback with a frame-state-like object", () => {
    const { adapters, frameCallbacks } = makeFakeAdapters();

    const callback = vi.fn();
    renderHook(() => useFrameAdapter(callback), {
      wrapper: makeWrapper(adapters),
    });

    frameCallbacks[0]?.(makeFrameState(1.25));

    expect(callback).toHaveBeenCalledWith({
      clock: {
        elapsedTime: 1.25,
        getDelta: expect.any(Function),
      },
    });
  });

  it("throws when rendered outside the provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() =>
      renderHook(() => useFrameAdapter(() => {})),
    ).toThrow(/R3F adapters are not available/);

    consoleError.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* useThreeAdapter                                                            */
/* -------------------------------------------------------------------------- */

describe("useThreeAdapter", () => {
  it("returns whatever the injected useThree returns", () => {
    const { adapters } = makeFakeAdapters();

    const { result } = renderHook(() => useThreeAdapter(), {
      wrapper: makeWrapper(adapters),
    });

    expect(result.current).toBe(FAKE_ROOT_STATE);
  });

  it("calls the injected useThree exactly once per render", () => {
    const { adapters, threeCallCount } = makeFakeAdapters();

    renderHook(() => useThreeAdapter(), {
      wrapper: makeWrapper(adapters),
    });

    expect(threeCallCount.value).toBe(1);
  });

  it("throws when rendered outside the provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => renderHook(() => useThreeAdapter())).toThrow(
      /R3F adapters are not available/,
    );

    consoleError.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* Error message                                                              */
/* -------------------------------------------------------------------------- */

describe("error message", () => {
  it("names the missing provider so the fix is obvious", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    let message = "";
    try {
      renderHook(() => useThreeAdapter());
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toContain("R3FAdaptersProvider");
    consoleError.mockRestore();
  });

  it("names the missing provider for useFrameAdapter too", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    let message = "";
    try {
      renderHook(() => useFrameAdapter(() => {}));
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toContain("R3FAdaptersProvider");
    consoleError.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* Dev-mode stability warning                                                 */
/* -------------------------------------------------------------------------- */

describe("useFrameAdapter — dev-mode stability warning", () => {
  it("warns once when the callback identity changes on every render", () => {
    const { adapters } = makeFakeAdapters();
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const { rerender } = renderHook(
      () =>
        useFrameAdapter(() => {
          /* new inline arrow on every render */
        }),
      { wrapper: makeWrapper(adapters) },
    );

    // First render: previous === undefined, so no warning yet.
    expect(warn).not.toHaveBeenCalled();

    // Second render produces a new callback identity → warn.
    rerender();
    expect(warn).toHaveBeenCalledTimes(1);

    // Third render produces another new identity, but we
    // warn once per component instance.
    rerender();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when the callback is memoized", () => {
    const { adapters } = makeFakeAdapters();
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const stable = () => {
      /* stable reference */
    };

    const { rerender } = renderHook(
      () => useFrameAdapter(stable),
      { wrapper: makeWrapper(adapters) },
    );

    rerender();
    rerender();
    rerender();

    expect(warn).not.toHaveBeenCalled();
  });

  it("names useCallback in the warning message", () => {
    const { adapters } = makeFakeAdapters();
    const warn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const { rerender } = renderHook(
      () => useFrameAdapter(() => {}),
      { wrapper: makeWrapper(adapters) },
    );

    rerender();

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("useCallback");
  });
});