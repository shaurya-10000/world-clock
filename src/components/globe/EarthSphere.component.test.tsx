import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The R3F `useThree` hook is unavailable outside a `<Canvas>`.
 * We replace it with a stub that returns a fake camera object
 * whose `position.length()` returns a value we control. That
 * makes the frame callback's opacity update testable without a
 * real R3F runtime.
 */
const cameraPositionLength = { value: 5 };

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    camera: {
      position: {
        length: () => cameraPositionLength.value,
      },
    },
  }),
}));

/*
 * The frame adapter is the seam the component uses to
 * subscribe to the render loop. We capture every registered
 * callback so tests can fire it manually.
 *
 * ## What the mock captures
 *
 * R3F's real `useFrame` keys its subscription on callback
 * identity: a new identity means the previous subscription is
 * torn down and a new one is registered. The mock captures
 * every call — including calls that R3F would have deduped —
 * so a test can inspect the callback identities that were
 * passed across several renders and assert on their
 * stability.
 */
const frameCallbacks: Array<() => void> = [];

vi.mock("@/lib/r3f-adapters", () => ({
  useFrameAdapter: (cb: () => void) => {
    frameCallbacks.push(cb);
  },
}));

/*
 * The sun direction source is a module-level ref published by
 * another part of the scene. We stub it with a fixed vector so
 * the frame callback's sun uniform update is deterministic.
 */
const sunDirection = { x: 0.25, y: 0.5, z: 0.75 };

vi.mock("@/components/globe/solarContext", () => ({
  getSunDirectionInGlobeFrame: () => sunDirection,
}));

import EarthSphere from "@/components/globe/EarthSphere";

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  frameCallbacks.length = 0;
  cameraPositionLength.value = 5;
  sunDirection.x = 0.25;
  sunDirection.y = 0.5;
  sunDirection.z = 0.75;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — mount", () => {
  it("renders without throwing", () => {
    expect(() => render(<EarthSphere />)).not.toThrow();
  });

  it("registers exactly one frame callback with the adapter", () => {
    render(<EarthSphere />);
    expect(frameCallbacks).toHaveLength(1);
  });

  it("registers a stable callback identity across renders", () => {
    /*
     * ## Why this test exists
     *
     * R3F keys its frame-loop subscription on callback
     * identity. When the identity changes on every render,
     * R3F unsubscribes and resubscribes every time — the
     * exact opposite of what a stable subscription is
     * supposed to do. `useFrameAdapter`'s dev-mode
     * `useWarnIfUnstable` check also fires when the identity
     * changes, which pollutes the console for a codebase
     * that deliberately keeps its logs clean.
     *
     * `EarthSphere` reads only refs and module-level
     * functions in its frame callback, so there is nothing
     * the closure needs to re-bind to when the component
     * re-renders. The callback is memoized with
     * `useCallback([])` and every render must pass the same
     * function reference to `useFrameAdapter`.
     *
     * The mock records every call — including the calls from
     * rerenders — so we can inspect the identities that
     * actually crossed the seam. Asserting that
     * `frameCallbacks.length` grew past 1 would be
     * trivially true; the interesting assertion is that
     * every entry is `===` the first.
     */
    const { rerender } = render(<EarthSphere />);

    const firstCallback = frameCallbacks[0];
    expect(firstCallback).toBeDefined();

    rerender(<EarthSphere />);
    rerender(<EarthSphere />);
    rerender(<EarthSphere />);

    /*
     * The component called `useFrameAdapter` on every render,
     * so the mock captured several callbacks. All of them
     * must be the same function object.
     */
    expect(frameCallbacks.length).toBeGreaterThanOrEqual(2);
    for (const cb of frameCallbacks) {
      expect(cb).toBe(firstCallback);
    }
  });

  it("does not throw when the frame callback fires before the material is attached", () => {
    /*
     * Outside a real R3F canvas, the `<shaderMaterial>`
     * ref may be null. The frame callback must tolerate
     * that and return cleanly. Firing every captured
     * callback is safe because they are all the same
     * function reference — the stability test above pins
     * that — but the assertion here is only about not
     * throwing on the initial render's callback.
     */
    render(<EarthSphere />);
    expect(() => {
      for (const cb of frameCallbacks) cb();
    }).not.toThrow();
  });

  it("does not introduce focusable elements", () => {
    const { container } = render(<EarthSphere />);
    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not introduce landmark elements", () => {
    const { container } = render(<EarthSphere />);
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Unmount                                                                    */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — unmount", () => {
  it("unmounts without throwing", () => {
    const { unmount } = render(<EarthSphere />);
    expect(() => unmount()).not.toThrow();
  });

  it("does not fire the captured callback after unmount", () => {
    /*
     * The captured callback closes over a ref to the material.
     * After unmount, the ref's `.current` is cleared by React,
     * so a callback that fires afterwards should return early
     * without a crash.
     */
    const { unmount } = render(<EarthSphere />);

    const callbacks = [...frameCallbacks];

    unmount();

    expect(() => {
      for (const cb of callbacks) cb();
    }).not.toThrow();
  });
});