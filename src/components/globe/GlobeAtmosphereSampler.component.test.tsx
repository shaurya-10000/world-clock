import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * ## What is mocked, and why
 *
 * `GlobeAtmosphereSampler` uses `useThree` and `useFrame` from
 * `@react-three/fiber` directly, and calls into the shared
 * `sampleGlobeAtmosphere` module and the `resolveFrameDate`
 * helper. Each of those is a real seam that a component test
 * can mock at the module boundary.
 *
 * `useFrame` and `useThree` are the two R3F hooks this
 * component needs. Both are module exports, so mocking them
 * works cleanly — unlike the R3F *intrinsics*, which are
 * strings and cannot be intercepted. This component renders
 * nothing, so there is no intrinsic to worry about.
 *
 * ## Typed mock signatures
 *
 * The `sampleGlobeAtmosphere` mock is typed via a shared
 * alias so that `mockReturnValueOnce` accepts any member of
 * the `Atmosphere` union. An untyped `vi.fn(() => "night" as
 * const)` narrows the return type to the single literal
 * `"night"`, and no other atmosphere value can be stubbed.
 */

const frameCallbacks: Array<
  (state: { clock: { elapsedTime: number } }) => void
> = [];

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 0, 3.6);

const globeGroup = new THREE.Object3D();
globeGroup.name = "world-clock-globe";

const scene = {
  getObjectByName: vi.fn((name: string) =>
    name === "world-clock-globe" ? globeGroup : undefined,
  ),
};

vi.mock("@react-three/fiber", async () => {
  const actual =
    await vi.importActual<typeof import("@react-three/fiber")>(
      "@react-three/fiber",
    );
  return {
    ...actual,
    useThree: () => ({ camera, scene }),
    useFrame: (
      cb: (state: { clock: { elapsedTime: number } }) => void,
    ) => {
      frameCallbacks.push(cb);
    },
  };
});

/* -------------------------------------------------------------------------- */
/* Sampling mock                                                              */
/* -------------------------------------------------------------------------- */

/*
 * The mock's return type is the full `Atmosphere` union.
 * Without this, `vi.fn(() => "night" as const)` narrows the
 * mock to `() => "night"` and every attempt to stub a
 * different value fails type-checking.
 */
const mockedSampleGlobeAtmosphere = vi.fn<
  (input: unknown) => import("@/lib/atmosphere").Atmosphere
>(() => "night");

vi.mock("@/components/globe/globeAtmosphere", () => ({
  sampleGlobeAtmosphere: (input: unknown) =>
    mockedSampleGlobeAtmosphere(input),
}));

/* -------------------------------------------------------------------------- */
/* Frame-date mock                                                            */
/* -------------------------------------------------------------------------- */

const mockedResolveFrameDate = vi.fn<() => Date>(() => new Date(0));

vi.mock("@/components/globe/frameDate", () => ({
  resolveFrameDate: () => mockedResolveFrameDate(),
}));

import GlobeAtmosphereSampler from "@/components/globe/GlobeAtmosphereSampler";
import {
  globeAtmosphereRef,
  lastSampleTimeRef,
} from "@/components/globe/globeAtmosphereContext";

function fireFrame(elapsedTime: number): void {
  for (const cb of frameCallbacks) {
    cb({ clock: { elapsedTime } });
  }
}

beforeEach(() => {
  frameCallbacks.length = 0;
  globeAtmosphereRef.current = null;
  lastSampleTimeRef.current = 0;
  camera.position.set(0, 0, 3.6);
  scene.getObjectByName.mockImplementation((name: string) =>
    name === "world-clock-globe" ? globeGroup : undefined,
  );
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — mount", () => {
  it("renders nothing to the DOM", () => {
    const { container } = render(<GlobeAtmosphereSampler />);
    expect(container.firstChild).toBeNull();
  });

  it("registers exactly one frame callback", () => {
    render(<GlobeAtmosphereSampler />);
    expect(frameCallbacks).toHaveLength(1);
  });

  it("registers a stable callback identity across renders", () => {
    /*
     * ## Why this test exists
     *
     * R3F keys its frame-loop subscription on callback
     * identity: a new identity causes an unsubscribe and
     * resubscribe. `GlobeAtmosphereSampler` reads only refs
     * and module-level imports inside its frame callback —
     * nothing that changes between renders — so the callback
     * is memoized with `useCallback`.
     *
     * Without an assertion here, a future refactor that
     * turned the callback back into an inline arrow would
     * silently regress the subscription pattern. The mock
     * captures every call to `useFrame`, so the identities
     * that crossed the seam can be inspected directly:
     * every entry must be `===` the first.
     */
    const { rerender } = render(<GlobeAtmosphereSampler />);

    const firstCallback = frameCallbacks[0];
    expect(firstCallback).toBeDefined();

    rerender(<GlobeAtmosphereSampler />);
    rerender(<GlobeAtmosphereSampler />);
    rerender(<GlobeAtmosphereSampler />);

    expect(frameCallbacks.length).toBeGreaterThanOrEqual(2);
    for (const cb of frameCallbacks) {
      expect(cb).toBe(firstCallback);
    }
  });

  it("does not introduce any focusable elements", () => {
    const { container } = render(<GlobeAtmosphereSampler />);
    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Lazy globe lookup                                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — lazy globe lookup", () => {
  it("looks up the globe group by name on the first frame", () => {
    render(<GlobeAtmosphereSampler />);
    fireFrame(0.1);

    expect(scene.getObjectByName).toHaveBeenCalledWith(
      "world-clock-globe",
    );
  });

  it("caches the globe group after the first lookup", () => {
    render(<GlobeAtmosphereSampler />);

    fireFrame(0.1);
    const callsAfterFirst = scene.getObjectByName.mock.calls.length;

    /*
     * Advance the clock past the throttle so a second sample
     * actually runs. The lookup happens only when the ref is
     * null, so it should not be called again.
     */
    fireFrame(0.5);
    expect(scene.getObjectByName.mock.calls.length).toBe(
      callsAfterFirst,
    );
  });

  it("tolerates the globe group being missing on the first frame", () => {
    scene.getObjectByName.mockReturnValueOnce(undefined);
    render(<GlobeAtmosphereSampler />);
    expect(() => fireFrame(0.1)).not.toThrow();
  });

  it("retries the lookup on later frames if the group was missing", () => {
    scene.getObjectByName.mockReturnValueOnce(undefined);
    render(<GlobeAtmosphereSampler />);

    fireFrame(0.1);
    fireFrame(0.5);

    /* Second call went back to the mock, which now returns the group. */
    expect(scene.getObjectByName.mock.calls.length).toBeGreaterThan(
      1,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Throttle                                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — throttle", () => {
  it("does not sample on every frame when the camera is stationary", () => {
    render(<GlobeAtmosphereSampler />);

    /*
     * Fifty frames at 1/60th of a second = ~0.83 seconds of
     * simulated time. The throttle is 250 ms, so at most three
     * or four samples should fire across this span.
     */
    for (let i = 0; i < 50; i += 1) {
      fireFrame(i / 60);
    }

    expect(
      mockedSampleGlobeAtmosphere.mock.calls.length,
    ).toBeLessThan(50);
  });

  it("samples at least once across a long span", () => {
    render(<GlobeAtmosphereSampler />);

    for (let s = 0; s < 10; s += 1) {
      fireFrame(s);
    }

    expect(mockedSampleGlobeAtmosphere).toHaveBeenCalled();
  });

  it("advances the sample clock on every accepted frame", () => {
    render(<GlobeAtmosphereSampler />);
    fireFrame(1);

    expect(lastSampleTimeRef.current).toBe(1000);
  });
});

/* -------------------------------------------------------------------------- */
/* Camera-movement bypass                                                     */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — camera movement", () => {
  it("samples on the very first frame regardless of throttle", () => {
    render(<GlobeAtmosphereSampler />);

    /* `lastCameraPositionRef` starts null, so `cameraMoved` is true. */
    fireFrame(0);

    expect(mockedSampleGlobeAtmosphere).toHaveBeenCalledTimes(1);
  });

  it("forces a sample when the camera moves significantly", () => {
    render(<GlobeAtmosphereSampler />);

    fireFrame(0);
    const callsAfterFirst = mockedSampleGlobeAtmosphere.mock.calls.length;

    /*
     * Move the camera well beyond the 0.15-world-unit
     * threshold, then fire a frame within the throttle
     * window.
     */
    camera.position.set(500, 500, 500);
    fireFrame(0.05);

    expect(
      mockedSampleGlobeAtmosphere.mock.calls.length,
    ).toBeGreaterThan(callsAfterFirst);
  });

  it("does not force a sample when the camera moves slightly", () => {
    render(<GlobeAtmosphereSampler />);

    fireFrame(0);
    const callsAfterFirst = mockedSampleGlobeAtmosphere.mock.calls.length;

    /*
     * Move the camera less than the 0.15-world-unit threshold,
     * then fire a frame within the throttle window.
     */
    camera.position.x += 0.01;
    fireFrame(0.05);

    expect(mockedSampleGlobeAtmosphere.mock.calls.length).toBe(
      callsAfterFirst,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Sample invocation                                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — sample invocation", () => {
  it("forwards the camera position as a plain object", () => {
    camera.position.set(1, 2, 3);
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(mockedSampleGlobeAtmosphere).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraPosition: { x: 1, y: 2, z: 3 },
      }),
    );
  });

  it("forwards the globe quaternion as a four-tuple", () => {
    globeGroup.quaternion.set(0.1, 0.2, 0.3, 0.9);
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(mockedSampleGlobeAtmosphere).toHaveBeenCalledWith(
      expect.objectContaining({
        globeQuaternion: [0.1, 0.2, 0.3, 0.9],
      }),
    );
  });

  it("passes the date resolved by `resolveFrameDate`", () => {
    const sentinel = new Date(123_456_789);
    mockedResolveFrameDate.mockReturnValueOnce(sentinel);
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(mockedSampleGlobeAtmosphere).toHaveBeenCalledWith(
      expect.objectContaining({ date: sentinel }),
    );
  });

  it("does not call sampleGlobeAtmosphere when the globe group is missing", () => {
    scene.getObjectByName.mockReturnValue(undefined);
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(mockedSampleGlobeAtmosphere).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Ref publication                                                            */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — atmosphere ref", () => {
  it("writes the sample result into the shared ref", () => {
    mockedSampleGlobeAtmosphere.mockReturnValueOnce("dawn");
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(globeAtmosphereRef.current).toBe("dawn");
  });

  it("leaves the ref untouched when the globe group is missing", () => {
    globeAtmosphereRef.current = "dusk";
    scene.getObjectByName.mockReturnValue(undefined);
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(globeAtmosphereRef.current).toBe("dusk");
  });

  it("updates the ref on a subsequent sample", () => {
    mockedSampleGlobeAtmosphere.mockReturnValueOnce("dawn");
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);
    expect(globeAtmosphereRef.current).toBe("dawn");

    mockedSampleGlobeAtmosphere.mockReturnValueOnce("night");
    fireFrame(1);
    expect(globeAtmosphereRef.current).toBe("night");
  });

  it("leaves the ref at null until the first real sample fires", () => {
    /*
     * Companion to the write-contract docstring: the ref's
     * initial state is `null`, and it stays `null` if no
     * sample succeeds. A consumer must be able to
     * distinguish "sampled night" from "no sample yet".
     */
    scene.getObjectByName.mockReturnValue(undefined);
    render(<GlobeAtmosphereSampler />);

    expect(globeAtmosphereRef.current).toBeNull();

    fireFrame(0);
    fireFrame(1);

    expect(globeAtmosphereRef.current).toBeNull();
  });
});