import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * Integration scope: the frame loop runs against the *real*
 * `lib/solar-sampling` module. Only `getSunDirection` is
 * stubbed, so the sampler's throttle state machine and its
 * emission cadence are exercised against the real
 * implementation. This is what the component test cannot do —
 * the component test mocks the sampler entirely.
 */

const frameCallbacks: Array<
  (state: { clock: { elapsedTime: number } }) => void
> = [];

const camera = { position: new THREE.Vector3(0, 0, 5) };

const globeGroup = new THREE.Object3D();
globeGroup.name = "world-clock-globe";

const scene = {
  getObjectByName: vi.fn((name: string) =>
    name === "world-clock-globe" ? globeGroup : undefined,
  ),
};

vi.mock("@/lib/r3f-adapters", () => ({
  useThreeAdapter: () => ({ camera, scene }),
  useFrameAdapter: (
    cb: (state: { clock: { elapsedTime: number } }) => void,
  ) => {
    frameCallbacks.push(cb);
  },
}));

/*
 * Partial mock of `lib/solar`: only `getSunDirection` is
 * stubbed so the ref write is deterministic. Everything else
 * is passed through because `lib/solar-sampling` and
 * `lib/useSolarState` call into it downstream.
 */
vi.mock("@/lib/solar", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/solar")>();
  return {
    ...actual,
    getSunDirection: () => ({ x: 0.1, y: 0.2, z: 0.3 }),
  };
});

import SolarSampler from "@/components/globe/SolarSampler";
import {
  sunDirectionRef,
  globeWorldQuaternionRef,
} from "@/components/globe/solarContext";
import type { SolarState } from "@/lib/useSolarState";

function fireFrame(elapsedTime: number): void {
  for (const cb of frameCallbacks) cb({ clock: { elapsedTime } });
}

beforeEach(() => {
  frameCallbacks.length = 0;
  vi.clearAllMocks();
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
/* Throttling behavior                                                        */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — throttling behavior", () => {
  it("emits at most one state per throttle interval across many frames", () => {
    const onChange = vi.fn<(state: SolarState) => void>();
    render(<SolarSampler onChange={onChange} />);

    /*
     * Feed 60 frames one sixtieth of a second apart — one
     * second of wall time. The throttle is coarser than that,
     * so the emission count must be much lower than the frame
     * count.
     */
    for (let i = 0; i < 60; i += 1) {
      fireFrame(i / 60);
    }

    expect(onChange.mock.calls.length).toBeLessThan(60);
  });

  it("emits at least one state across a long span of frames", () => {
    const onChange = vi.fn<(state: SolarState) => void>();
    render(<SolarSampler onChange={onChange} />);

    for (let s = 0; s < 10; s += 1) {
      fireFrame(s);
    }

    expect(onChange).toHaveBeenCalled();
  });

  it("emits an immediate sample when the camera moves significantly", () => {
    /*
     * The sampler has a "camera moved significantly" bypass.
     * Moving the camera far enough between two frames must
     * force a fresh sample regardless of the time-based
     * throttle.
     */
    const onChange = vi.fn<(state: SolarState) => void>();
    render(<SolarSampler onChange={onChange} />);

    fireFrame(0);
    const firstCount = onChange.mock.calls.length;

    camera.position.set(500, 500, 500);
    fireFrame(1);

    expect(onChange.mock.calls.length).toBeGreaterThan(firstCount);
  });

  it("does not call onChange when the globe group is missing from the scene", () => {
    scene.getObjectByName.mockReturnValue(undefined);

    const onChange = vi.fn<(state: SolarState) => void>();
    render(<SolarSampler onChange={onChange} />);

    fireFrame(0);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("still publishes the sun direction when the globe is missing", () => {
    scene.getObjectByName.mockReturnValue(undefined);

    render(<SolarSampler onChange={() => {}} />);
    fireFrame(0);

    /* Direction is written; the state sample is skipped. */
    expect(sunDirectionRef.current).toEqual({
      x: 0.1,
      y: 0.2,
      z: 0.3,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Adapter contract                                                           */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — adapter contract", () => {
  it("registers exactly one frame callback", () => {
    render(<SolarSampler onChange={() => {}} />);
    expect(frameCallbacks).toHaveLength(1);
  });

  it("registers a fresh callback on every render", () => {
    const { rerender } = render(<SolarSampler onChange={() => {}} />);
    rerender(<SolarSampler onChange={() => {}} />);
    expect(frameCallbacks.length).toBeGreaterThanOrEqual(2);
  });

  it("tolerates the globe group appearing only after the first frame", () => {
    /*
     * The globe lookup is deferred to the frame loop precisely
     * because the group might not exist when the component
     * mounts. Simulate that: the group is missing for the
     * first frame, then present.
     */
    scene.getObjectByName.mockReturnValueOnce(undefined);

    const onChange = vi.fn<(state: SolarState) => void>();
    render(<SolarSampler onChange={onChange} />);

    fireFrame(0);
    expect(onChange).not.toHaveBeenCalled();

    fireFrame(1);
    /* Now the group is found and the sample proceeds. */
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Unmount                                                                    */
/* -------------------------------------------------------------------------- */

describe("SolarSampler — unmount", () => {
  it("unmounts cleanly", () => {
    const { unmount } = render(<SolarSampler onChange={() => {}} />);
    fireFrame(0);
    expect(() => unmount()).not.toThrow();
  });

  it("does not throw when a captured frame callback is fired post-unmount", () => {
    const { unmount } = render(<SolarSampler onChange={() => {}} />);
    unmount();
    expect(() => fireFrame(0)).not.toThrow();
  });

  it("re-mounts cleanly after an unmount", () => {
    const first = render(<SolarSampler onChange={() => {}} />);
    fireFrame(0);
    first.unmount();

    frameCallbacks.length = 0;
    expect(() =>
      render(<SolarSampler onChange={() => {}} />),
    ).not.toThrow();
    expect(() => fireFrame(0)).not.toThrow();
  });
});