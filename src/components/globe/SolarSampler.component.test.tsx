import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * Capture every frame callback so the tests can drive the
 * render loop manually. The real adapter wires callbacks into
 * R3F's frame loop; here we just hold onto them.
 *
 * ## Why the array, not a single slot
 *
 * The mock captures every call to `useFrameAdapter` — including
 * the calls from rerenders — so a test can inspect the
 * identities that were passed across multiple renders. This is
 * what makes the "registers a stable callback identity across
 * renders" test meaningful: it asserts that every entry in the
 * array is the same function reference, not just that the
 * component registered at least one callback.
 */
const frameCallbacks: Array<() => void> = [];

/*
 * A minimal camera fixture. The frame callback reads
 * `camera.position`, so it needs the shape but not a real
 * THREE.Camera.
 */
const camera = { position: new THREE.Vector3(0, 0, 5) };

/*
 * A minimal globe group. The frame callback reads
 * `globe.quaternion`, so a plain Object3D is sufficient.
 */
const globeGroup = new THREE.Object3D();
globeGroup.name = "world-clock-globe";

const scene = {
  getObjectByName: vi.fn((name: string) =>
    name === "world-clock-globe" ? globeGroup : undefined,
  ),
};

vi.mock("@/lib/r3f-adapters", () => ({
  useThreeAdapter: () => ({ camera, scene }),
  useFrameAdapter: (cb: () => void) => {
    frameCallbacks.push(cb);
  },
}));

vi.mock("@/lib/solar", () => ({
  getSunDirection: () => ({ x: 0.1, y: 0.2, z: 0.3 }),
}));

/*
 * `SamplingState` is a private shape. The mock does not need
 * to construct a real one — the sampler just threads the value
 * back into `sampleSolarState` on the next frame. Cast a
 * sentinel through `unknown` so no real fields are required.
 *
 * ## Why the default implementation is re-installed in
 * ## `beforeEach`
 *
 * `vi.clearAllMocks()` clears call history but does *not*
 * reset a mock's implementation — that requires
 * `mockReset()`. A test that calls `mockReturnValue(...)`
 * to install a custom return value leaves that value in
 * place for every subsequent test in the file, even after
 * `clearAllMocks()`. The `beforeEach` below calls
 * `mockReset()` on this specific mock and re-installs the
 * default `state: null` implementation, so each test starts
 * from the state the fixture declares.
 *
 * The same bug existed in an earlier version of this file
 * and was masked by test ordering: the two tests that assert
 * `onChange` is *not* called happened to run before the
 * tests that install a non-null state, so the contamination
 * never surfaced. Vitest's default file-level ordering is
 * stable, so this is not flaky — but it is fragile, and a
 * future reordering would silently break the null-state
 * assertion.
 */
vi.mock("@/lib/solar-sampling", () => ({
  INITIAL_SAMPLING_STATE: { marker: "initial" } as unknown,
  sampleSolarState: vi.fn(() => ({
    next: { marker: "next" } as unknown,
    state: null,
  })),
}));

import SolarSampler from "@/components/globe/SolarSampler";
import { sampleSolarState } from "@/lib/solar-sampling";
import {
  globeWorldQuaternionRef,
  sunDirectionRef,
} from "@/components/globe/solarContext";

const mockedSampleSolarState = vi.mocked(sampleSolarState);

function fireFrame(): void {
  for (const cb of frameCallbacks) cb();
}

beforeEach(() => {
  frameCallbacks.length = 0;

  /*
   * Reset the sampling mock to its default implementation.
   * See the block comment above the `vi.mock` factory for
   * why `clearAllMocks()` alone is insufficient.
   */
  mockedSampleSolarState.mockReset();
  mockedSampleSolarState.mockReturnValue({
    next: { marker: "next" } as unknown as ReturnType<
      typeof sampleSolarState
    >["next"],
    state: null,
  });

  scene.getObjectByName.mockReset();
  scene.getObjectByName.mockImplementation((name: string) =>
    name === "world-clock-globe" ? globeGroup : undefined,
  );

  globeGroup.quaternion.identity();
  sunDirectionRef.current = { x: 0, y: 0, z: 1 };
  globeWorldQuaternionRef.current = [0, 0, 0, 1];
  camera.position.set(0, 0, 5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Render contract                                                            */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — render", () => {
  it("renders nothing to the DOM", () => {
    const { container } = render(<SolarSampler onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("registers exactly one frame callback", () => {
    render(<SolarSampler onChange={() => {}} />);
    expect(frameCallbacks).toHaveLength(1);
  });

  it("registers a stable callback identity across renders", () => {
    /*
     * ## Why this test exists
     *
     * R3F keys its frame-loop subscription on callback
     * identity: a new identity causes an unsubscribe and
     * resubscribe. `SolarSampler` already decouples its
     * closure from the `onChange` prop by reading the prop
     * through `onChangeRef`; the frame callback itself reads
     * only refs and module-level imports, so it is memoized
     * with `useCallback`.
     *
     * Without this assertion, a future refactor that turned
     * the callback back into an inline arrow would silently
     * regress the subscription pattern — and would defeat the
     * whole point of `onChangeRef`.
     */
    const { rerender } = render(
      <SolarSampler onChange={() => {}} />,
    );

    const firstCallback = frameCallbacks[0];
    expect(firstCallback).toBeDefined();

    rerender(<SolarSampler onChange={() => {}} />);
    rerender(<SolarSampler onChange={() => {}} />);
    rerender(<SolarSampler onChange={() => {}} />);

    expect(frameCallbacks.length).toBeGreaterThanOrEqual(2);
    for (const cb of frameCallbacks) {
      expect(cb).toBe(firstCallback);
    }
  });

  it("fires the same callback across re-renders and delivers fresh state", () => {
    /*
     * The stability test above asserts the identity does not
     * change. This one asserts the consequence: a frame
     * fired *after* a re-render still observes the latest
     * `onChange` through the ref and delivers fresh state.
     *
     * The two tests are deliberately separate. A refactor
     * could keep the identity stable but break the ref wiring
     * (e.g. by capturing `onChange` in the memoized closure
     * instead of reading the ref), and only the second test
     * would catch it.
     */
    const first = vi.fn();
    const second = vi.fn();
    const sentinel = { isDay: true } as unknown;

    mockedSampleSolarState.mockReturnValue({
      next: { marker: "next" } as unknown as ReturnType<
        typeof sampleSolarState
      >["next"],
      state: sentinel as unknown as ReturnType<
        typeof sampleSolarState
      >["state"],
    });

    const { rerender } = render(<SolarSampler onChange={first} />);
    rerender(<SolarSampler onChange={second} />);
    fireFrame();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(sentinel);
  });

  it("looks up the globe group by name on the first frame", () => {
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(scene.getObjectByName).toHaveBeenCalledWith(
      "world-clock-globe",
    );
  });

  it("does not introduce any focusable elements", () => {
    const { container } = render(
      <SolarSampler onChange={() => {}} />,
    );
    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Sun-direction publication                                                  */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — sun-direction ref write", () => {
  it("writes the sun direction into the shared ref on every frame", () => {
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(sunDirectionRef.current).toEqual({
      x: 0.1,
      y: 0.2,
      z: 0.3,
    });
  });

  it("mutates the existing sun-direction object in place", () => {
    /*
     * The `sunDirectionRef.current` object is shared with
     * consumers that hold a reference to it. Replacing the
     * object would break those references. The write must be
     * field-by-field, not whole-object.
     */
    const before = sunDirectionRef.current;
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(sunDirectionRef.current).toBe(before);
  });

  it("writes the same sun direction across multiple frames", () => {
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();
    fireFrame();
    fireFrame();

    expect(sunDirectionRef.current).toEqual({
      x: 0.1,
      y: 0.2,
      z: 0.3,
    });
  });

  it("still publishes the sun direction when the globe group is missing", () => {
    /*
     * The sun direction is consumed by a shader that does not
     * depend on the globe group. If the group is missing, the
     * sampler should still write the direction so the shader
     * stays correct.
     */
    scene.getObjectByName.mockReturnValue(undefined);
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(sunDirectionRef.current).toEqual({
      x: 0.1,
      y: 0.2,
      z: 0.3,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Globe-quaternion publication                                               */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — globe-quaternion ref write", () => {
  it("writes the globe quaternion into the shared ref", () => {
    globeGroup.quaternion.set(0.1, 0.2, 0.3, 0.9);
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(globeWorldQuaternionRef.current).toEqual([
      0.1, 0.2, 0.3, 0.9,
    ]);
  });

  it("does not write the quaternion when the globe group is missing", () => {
    const sentinel: [number, number, number, number] = [9, 9, 9, 9];
    globeWorldQuaternionRef.current = sentinel;

    scene.getObjectByName.mockReturnValue(undefined);
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(globeWorldQuaternionRef.current).toBe(sentinel);
  });

  it("mirrors the latest globe rotation across frames", () => {
    render(<SolarSampler onChange={() => {}} />);

    globeGroup.quaternion.set(0.1, 0.2, 0.3, 0.9);
    fireFrame();
    expect(globeWorldQuaternionRef.current).toEqual([
      0.1, 0.2, 0.3, 0.9,
    ]);

    globeGroup.quaternion.set(0.4, 0.5, 0.6, 0.7);
    fireFrame();
    expect(globeWorldQuaternionRef.current).toEqual([
      0.4, 0.5, 0.6, 0.7,
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Sample invocation                                                          */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — sample invocation", () => {
  it("calls sampleSolarState with the frame time in milliseconds", () => {
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(mockedSampleSolarState).toHaveBeenCalledWith(
      expect.objectContaining({
        nowMs: expect.any(Number),
      }),
    );
  });

  it("forwards the camera position as a plain object", () => {
    camera.position.set(1, 2, 3);
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(mockedSampleSolarState).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraPosition: { x: 1, y: 2, z: 3 },
      }),
    );
  });

  it("forwards the globe quaternion as a four-tuple", () => {
    globeGroup.quaternion.set(0.5, 0.5, 0.5, 0.5);
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(mockedSampleSolarState).toHaveBeenCalledWith(
      expect.objectContaining({
        globeQuaternion: [0.5, 0.5, 0.5, 0.5],
      }),
    );
  });

  it("forwards the initial sampling state on the first frame", () => {
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(mockedSampleSolarState).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: { marker: "initial" },
      }),
    );
  });

  it("forwards the previous result's `next` on the following frame", () => {
    /*
     * The sampling-state ref is threaded through the frame
     * callback without depending on the callback's identity —
     * the memoization test above pins that the callback is
     * not re-created, and this test pins that the threaded
     * value still advances frame-to-frame.
     */
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();
    fireFrame();

    /* The second call must receive the first call's `next`. */
    const calls = mockedSampleSolarState.mock.calls;
    expect(calls[1]?.[0]).toEqual(
      expect.objectContaining({
        previous: { marker: "next" },
      }),
    );
  });

  it("does not call sampleSolarState when the globe is missing", () => {
    scene.getObjectByName.mockReturnValue(undefined);
    render(<SolarSampler onChange={() => {}} />);
    fireFrame();

    expect(mockedSampleSolarState).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* onChange forwarding                                                        */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — onChange forwarding", () => {
  it("does not call onChange when sampleSolarState returns null state", () => {
    const onChange = vi.fn();
    render(<SolarSampler onChange={onChange} />);
    fireFrame();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with the state when sampleSolarState returns one", () => {
    const sentinel = { isDay: true } as unknown as Parameters<
      typeof mockedSampleSolarState
    >[0] extends never
      ? never
      : { isDay: boolean };

    mockedSampleSolarState.mockReturnValueOnce({
      next: { marker: "next" } as unknown as ReturnType<
        typeof sampleSolarState
      >["next"],
      state: sentinel as unknown as ReturnType<
        typeof sampleSolarState
      >["state"],
    });

    const onChange = vi.fn();
    render(<SolarSampler onChange={onChange} />);
    fireFrame();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(sentinel);
  });

  it("uses the latest onChange after a re-render", () => {
    /*
     * The frame callback holds `onChangeRef.current`, not
     * `onChange` directly. After a re-render with a new
     * callback, the frame must call the new one — otherwise
     * consumers would silently never see updates after their
     * first render.
     *
     * This is the same behavior the earlier
     * "fires the same callback across re-renders" test
     * asserts, but from the perspective of the *forwarding*
     * logic rather than the callback identity. Both are kept
     * because they catch different regressions.
     */
    const first = vi.fn();
    const second = vi.fn();
    const sentinel = { isDay: true } as unknown;

    mockedSampleSolarState.mockReturnValue({
      next: { marker: "next" } as unknown as ReturnType<
        typeof sampleSolarState
      >["next"],
      state: sentinel as unknown as ReturnType<
        typeof sampleSolarState
      >["state"],
    });

    const { rerender } = render(<SolarSampler onChange={first} />);
    rerender(<SolarSampler onChange={second} />);
    fireFrame();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(sentinel);
  });

  it("does not call onChange when the globe is missing", () => {
    const onChange = vi.fn();
    scene.getObjectByName.mockReturnValue(undefined);
    render(<SolarSampler onChange={onChange} />);
    fireFrame();

    expect(onChange).not.toHaveBeenCalled();
  });
});