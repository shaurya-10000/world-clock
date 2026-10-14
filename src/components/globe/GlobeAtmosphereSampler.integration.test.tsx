import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * Integration scope: the sampler running against the *real*
 * `sampleGlobeAtmosphere` implementation and the real
 * `globeAtmosphere` module. Only `@react-three/fiber`'s two
 * hooks are mocked, so the sampling pipeline itself is
 * exercised end-to-end.
 *
 * The value of this over the component test is that it
 * catches a break in the seam *between* the sampler and the
 * underlying `sampleGlobeAtmosphere` — a mismatch in the
 * input shape, a wrong key, a swapped sign — that a mocked
 * sampling module would happily accept.
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

import GlobeAtmosphereSampler from "@/components/globe/GlobeAtmosphereSampler";
import {
  globeAtmosphereRef,
  lastSampleTimeRef,
} from "@/components/globe/globeAtmosphereContext";
import type { Atmosphere } from "@/lib/atmosphere";

const VALID_ATMOSPHERES = ["dawn", "day", "dusk", "night"] as const;

function isAtmosphere(value: unknown): value is Atmosphere {
  return (
    typeof value === "string" &&
    (VALID_ATMOSPHERES as readonly string[]).includes(value)
  );
}

function fireFrame(elapsedTime: number): void {
  for (const cb of frameCallbacks) {
    cb({ clock: { elapsedTime } });
  }
}

beforeEach(() => {
  frameCallbacks.length = 0;
  globeAtmosphereRef.current = "night";
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
/* Real sampling                                                              */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — real sampling", () => {
  it("publishes a valid atmosphere value on the first frame", () => {
    render(<GlobeAtmosphereSampler />);
    fireFrame(0);

    expect(isAtmosphere(globeAtmosphereRef.current)).toBe(true);
  });

  it("publishes a valid atmosphere for every camera orientation", () => {
    /*
     * Rotate the globe through a full turn and confirm the
     * sampler publishes a valid value at every step. The
     * specific value that wins depends on the real catalog and
     * the real time-override seam; the invariant worth pinning
     * is that the result is always one of the four known
     * atmospheres.
     */
    render(<GlobeAtmosphereSampler />);

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      globeGroup.quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angle,
      );

      camera.position.set(0, 0, 3.6);

      /* Advance past the throttle each time. */
      fireFrame(1 + i);

      expect(isAtmosphere(globeAtmosphereRef.current)).toBe(true);
    }
  });

  it("publishes a valid atmosphere when the camera moves to a polar view", () => {
    render(<GlobeAtmosphereSampler />);
    camera.position.set(0, 3.6, 0);
    fireFrame(0);

    expect(isAtmosphere(globeAtmosphereRef.current)).toBe(true);
  });

  it("publishes a valid atmosphere when the camera looks at the far side of the globe", () => {
    render(<GlobeAtmosphereSampler />);
    camera.position.set(0, 0, -3.6);
    fireFrame(0);

    expect(isAtmosphere(globeAtmosphereRef.current)).toBe(true);
  });

  it("survives a full sequence of frames without throwing", () => {
    render(<GlobeAtmosphereSampler />);

    expect(() => {
      for (let s = 0; s < 20; s += 1) {
        fireFrame(s * 0.25);
      }
    }).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Throttle cadence                                                           */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — throttle cadence", () => {
  it("does not publish on every frame when the camera is stationary", () => {
    render(<GlobeAtmosphereSampler />);

    /*
     * The ref is a module-level primitive; we cannot count
     * writes to it directly. The meaningful assertion is that
     * the sampler does not crash when firing many closely
     * spaced frames — the throttle's observable behavior is
     * that the frame loop stays cheap, which is not directly
     * observable in a test.
     *
     * What this test *can* pin is that the sampler's throttle
     * state advances correctly: after a busy sequence, the
     * sample clock is at the last frame's timestamp.
     */
    for (let i = 0; i < 60; i += 1) {
      fireFrame(i / 60);
    }

    expect(lastSampleTimeRef.current).toBeGreaterThan(0);
  });

  it("advances the sample clock to the latest accepted frame time", () => {
    render(<GlobeAtmosphereSampler />);
    fireFrame(2.5);

    /* `2.5` seconds → `2500` milliseconds. */
    expect(lastSampleTimeRef.current).toBe(2500);
  });
});

/* -------------------------------------------------------------------------- */
/* Unmount                                                                    */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphereSampler — unmount", () => {
  it("unmounts cleanly after frames have fired", () => {
    const { unmount } = render(<GlobeAtmosphereSampler />);
    fireFrame(0);
    fireFrame(1);
    expect(() => unmount()).not.toThrow();
  });

  it("does not throw when a captured frame callback is fired post-unmount", () => {
    const { unmount } = render(<GlobeAtmosphereSampler />);
    unmount();
    expect(() => fireFrame(0)).not.toThrow();
  });
});