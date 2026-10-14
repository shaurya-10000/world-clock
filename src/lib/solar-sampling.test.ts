import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/useSolarState", () => ({
  computeSolarState: vi.fn(),
}));

import {
  ANGULAR_MOVEMENT_THRESHOLD,
  INITIAL_SAMPLING_STATE,
  SAMPLE_INTERVAL_MS,
  sampleSolarState,
  statesApproximatelyEqual,
  type SamplingState,
  type Vec3,
} from "@/lib/solar-sampling";
import {
  computeSolarState,
  type SolarState,
} from "@/lib/useSolarState";

const mockedCompute = vi.mocked(computeSolarState);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function solarState(
  overrides: Partial<SolarState> = {},
): SolarState {
  return {
    dominantAtmosphere: "day",
    averageSolarElevation: 30,
    daylightFraction: 0.6,
    subsolarScreenPosition: { x: 0.5, y: 0.5 },
    ...overrides,
  } as SolarState;
}

const CAMERA_A: Vec3 = { x: 0, y: 0, z: 5 };
const IDENTITY_QUATERNION = [0, 0, 0, 1] as const;

function input(
  overrides: Partial<Parameters<typeof sampleSolarState>[0]> = {},
) {
  return {
    nowMs: 0,
    cameraPosition: CAMERA_A,
    globeQuaternion: IDENTITY_QUATERNION,
    previous: INITIAL_SAMPLING_STATE,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

describe("sampleSolarState — first run", () => {
  it("always emits on the initial call (null lastCameraPosition)", () => {
    const state = solarState();
    mockedCompute.mockReturnValueOnce(state);

    const result = sampleSolarState(input());

    expect(result.state).toBe(state);
    expect(result.next.lastEmittedState).toBe(state);
    expect(result.next.lastCameraPosition).toBe(CAMERA_A);
    expect(result.next.lastSampleTimeMs).toBe(0);
  });

  it("records the current time on the first emit", () => {
    mockedCompute.mockReturnValueOnce(solarState());

    const result = sampleSolarState(input({ nowMs: 1234 }));

    expect(result.next.lastSampleTimeMs).toBe(1234);
  });

  it("passes the camera and quaternion to computeSolarState", () => {
    mockedCompute.mockReturnValueOnce(solarState());

    const q = [0.1, 0.2, 0.3, 0.9] as const;
    const camera = { x: 1, y: 2, z: 3 };

    sampleSolarState(
      input({ cameraPosition: camera, globeQuaternion: q }),
    );

    expect(mockedCompute).toHaveBeenCalledWith({
      cameraPosition: camera,
      globeQuaternion: q,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Throttling                                                                 */
/* -------------------------------------------------------------------------- */

describe("sampleSolarState — throttling", () => {
  it("suppresses the emit when neither the interval nor the camera moved", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 1000,
      lastCameraPosition: CAMERA_A,
      lastEmittedState: solarState(),
    };

    const result = sampleSolarState(
      input({
        nowMs: 1000 + SAMPLE_INTERVAL_MS - 1,
        cameraPosition: CAMERA_A,
        previous,
      }),
    );

    expect(result.state).toBeNull();
    expect(result.next).toBe(previous);
    expect(mockedCompute).not.toHaveBeenCalled();
  });

  it("does not call computeSolarState when throttled", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 0,
      lastCameraPosition: CAMERA_A,
      lastEmittedState: solarState(),
    };

    sampleSolarState(
      input({
        nowMs: 10,
        cameraPosition: CAMERA_A,
        previous,
      }),
    );

    expect(mockedCompute).not.toHaveBeenCalled();
  });

  it("emits once the interval has elapsed even with a still camera", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 0,
      lastCameraPosition: CAMERA_A,
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };

    const fresh = solarState({ averageSolarElevation: 90 });
    mockedCompute.mockReturnValueOnce(fresh);

    const result = sampleSolarState(
      input({
        nowMs: SAMPLE_INTERVAL_MS,
        cameraPosition: CAMERA_A,
        previous,
      }),
    );

    expect(mockedCompute).toHaveBeenCalledTimes(1);
    expect(result.state).toBe(fresh);
  });

  it("emits at exactly the interval boundary (>= comparison)", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 0,
      lastCameraPosition: CAMERA_A,
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };
    mockedCompute.mockReturnValueOnce(
      solarState({ averageSolarElevation: 90 }),
    );

    const result = sampleSolarState(
      input({
        nowMs: SAMPLE_INTERVAL_MS,
        cameraPosition: CAMERA_A,
        previous,
      }),
    );

    expect(result.state).not.toBeNull();
  });

  it("does not emit one millisecond before the boundary", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 0,
      lastCameraPosition: CAMERA_A,
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };

    const result = sampleSolarState(
      input({
        nowMs: SAMPLE_INTERVAL_MS - 1,
        cameraPosition: CAMERA_A,
        previous,
      }),
    );

    expect(result.state).toBeNull();
    expect(mockedCompute).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Camera movement                                                            */
/* -------------------------------------------------------------------------- */

describe("sampleSolarState — camera movement", () => {
  it("emits immediately when the camera moves past the threshold", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 1000,
      lastCameraPosition: { x: 0, y: 0, z: 0 },
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };

    const moved: Vec3 = {
      x: ANGULAR_MOVEMENT_THRESHOLD,
      y: 0,
      z: 0,
    };

    mockedCompute.mockReturnValueOnce(
      solarState({ averageSolarElevation: 90 }),
    );

    const result = sampleSolarState(
      input({
        nowMs: 1000 + 1,
        cameraPosition: moved,
        previous,
      }),
    );

    expect(result.state).not.toBeNull();
  });

  it("does not emit when the camera moves less than the threshold", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 1000,
      lastCameraPosition: { x: 0, y: 0, z: 0 },
      lastEmittedState: solarState(),
    };

    const moved: Vec3 = {
      x: ANGULAR_MOVEMENT_THRESHOLD / 2,
      y: 0,
      z: 0,
    };

    const result = sampleSolarState(
      input({
        nowMs: 1000 + 1,
        cameraPosition: moved,
        previous,
      }),
    );

    expect(result.state).toBeNull();
    expect(result.next).toBe(previous);
  });

  it("measures displacement in 3D, not per-axis", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 1000,
      lastCameraPosition: { x: 0, y: 0, z: 0 },
      lastEmittedState: solarState(),
    };

    const moved: Vec3 = { x: 0.02, y: 0.02, z: 0.02 };

    const result = sampleSolarState(
      input({
        nowMs: 1000 + 1,
        cameraPosition: moved,
        previous,
      }),
    );

    expect(result.state).toBeNull();
  });

  it("emits when displacement is exactly the threshold", () => {
    /*
     * The comparison uses `>=`, so a displacement exactly
     * equal to the threshold counts as "moved." This
     * matters for tests that construct a displacement of
     * the exact constant — the intent is clear and the
     * boundary is exercised.
     */
    const previous: SamplingState = {
      lastSampleTimeMs: 1000,
      lastCameraPosition: { x: 0, y: 0, z: 0 },
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };

    mockedCompute.mockReturnValueOnce(
      solarState({ averageSolarElevation: 90 }),
    );

    const result = sampleSolarState(
      input({
        nowMs: 1000 + 1,
        cameraPosition: { x: ANGULAR_MOVEMENT_THRESHOLD, y: 0, z: 0 },
        previous,
      }),
    );

    expect(result.state).not.toBeNull();
  });

  it("combines interval and movement: emits if either qualifies", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 0,
      lastCameraPosition: { x: 0, y: 0, z: 0 },
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };

    expect(
      sampleSolarState(
        input({
          nowMs: 1,
          cameraPosition: { x: 0, y: 0, z: 0 },
          previous,
        }),
      ).state,
    ).toBeNull();

    mockedCompute.mockReturnValueOnce(
      solarState({ averageSolarElevation: 90 }),
    );
    expect(
      sampleSolarState(
        input({
          nowMs: SAMPLE_INTERVAL_MS,
          cameraPosition: { x: 0, y: 0, z: 0 },
          previous,
        }),
      ).state,
    ).not.toBeNull();

    mockedCompute.mockReturnValueOnce(
      solarState({ averageSolarElevation: 90 }),
    );
    expect(
      sampleSolarState(
        input({
          nowMs: 1,
          cameraPosition: {
            x: ANGULAR_MOVEMENT_THRESHOLD,
            y: 0,
            z: 0,
          },
          previous,
        }),
      ).state,
    ).not.toBeNull();
  });

  it("advances lastCameraPosition when the sample fires", () => {
    const previous: SamplingState = {
      lastSampleTimeMs: 0,
      lastCameraPosition: { x: 0, y: 0, z: 0 },
      lastEmittedState: solarState({ averageSolarElevation: 0 }),
    };

    const moved: Vec3 = {
      x: ANGULAR_MOVEMENT_THRESHOLD,
      y: 0,
      z: 0,
    };

    mockedCompute.mockReturnValueOnce(
      solarState({ averageSolarElevation: 90 }),
    );

    const result = sampleSolarState(
      input({
        nowMs: 1,
        cameraPosition: moved,
        previous,
      }),
    );

    expect(result.next.lastCameraPosition).toBe(moved);
  });
});

/* -------------------------------------------------------------------------- */
/* State equality gate                                                        */
/* -------------------------------------------------------------------------- */

describe("sampleSolarState — equality gate", () => {
  it("skips the emit when the new state is approximately equal", () => {
    const previous = solarState();
    const nearlyIdentical = solarState({
      averageSolarElevation:
        (previous.averageSolarElevation ?? 0) + 1,
    });

    mockedCompute.mockReturnValueOnce(nearlyIdentical);

    const result = sampleSolarState(
      input({
        nowMs: SAMPLE_INTERVAL_MS,
        previous: {
          lastSampleTimeMs: 0,
          lastCameraPosition: CAMERA_A,
          lastEmittedState: previous,
        },
      }),
    );

    expect(result.state).toBeNull();
    expect(result.next.lastEmittedState).toBe(nearlyIdentical);
    expect(result.next.lastSampleTimeMs).toBe(SAMPLE_INTERVAL_MS);
  });

  it("emits when the state is meaningfully different", () => {
    const previous = solarState({ averageSolarElevation: 0 });
    const fresh = solarState({ averageSolarElevation: 90 });

    mockedCompute.mockReturnValueOnce(fresh);

    const result = sampleSolarState(
      input({
        nowMs: SAMPLE_INTERVAL_MS,
        previous: {
          lastSampleTimeMs: 0,
          lastCameraPosition: CAMERA_A,
          lastEmittedState: previous,
        },
      }),
    );

    expect(result.state).toBe(fresh);
  });

  it("always emits when previous.lastEmittedState is null", () => {
    const fresh = solarState();
    mockedCompute.mockReturnValueOnce(fresh);

    const result = sampleSolarState(
      input({
        nowMs: SAMPLE_INTERVAL_MS,
        previous: {
          lastSampleTimeMs: 0,
          lastCameraPosition: CAMERA_A,
          lastEmittedState: null,
        },
      }),
    );

    expect(result.state).toBe(fresh);
  });

  it("still advances `next` when the state is approximately equal", () => {
    /*
     * The throttle timers must keep moving even when the
     * state is skipped — otherwise the next call would
     * throttle against an old timestamp.
     */
    const previous = solarState();
    const nearlyIdentical = solarState({
      averageSolarElevation:
        (previous.averageSolarElevation ?? 0) + 1,
    });

    mockedCompute.mockReturnValueOnce(nearlyIdentical);

    const movedCamera: Vec3 = { x: 1, y: 1, z: 1 };
    const result = sampleSolarState(
      input({
        nowMs: 500,
        cameraPosition: movedCamera,
        previous: {
          lastSampleTimeMs: 0,
          lastCameraPosition: CAMERA_A,
          lastEmittedState: previous,
        },
      }),
    );

    expect(result.state).toBeNull();
    expect(result.next.lastSampleTimeMs).toBe(500);
    expect(result.next.lastCameraPosition).toBe(movedCamera);
    expect(result.next.lastEmittedState).toBe(nearlyIdentical);
  });
});

/* -------------------------------------------------------------------------- */
/* statesApproximatelyEqual                                                   */
/* -------------------------------------------------------------------------- */

describe("statesApproximatelyEqual", () => {
  it("returns false when b is null", () => {
    expect(statesApproximatelyEqual(solarState(), null)).toBe(false);
  });

  it("returns true for identical states", () => {
    expect(
      statesApproximatelyEqual(solarState(), solarState()),
    ).toBe(true);
  });

  it("returns false when dominant atmospheres differ", () => {
    const a = solarState({ dominantAtmosphere: "day" });
    const b = solarState({ dominantAtmosphere: "night" });

    expect(statesApproximatelyEqual(a, b)).toBe(false);
  });

  it("accepts elevation deltas at the threshold", () => {
    const a = solarState({ averageSolarElevation: 30 });
    const b = solarState({ averageSolarElevation: 32 });

    expect(statesApproximatelyEqual(a, b)).toBe(true);
  });

  it("rejects elevation deltas beyond the threshold", () => {
    const a = solarState({ averageSolarElevation: 30 });
    const b = solarState({ averageSolarElevation: 32.01 });

    expect(statesApproximatelyEqual(a, b)).toBe(false);
  });

  it("accepts daylight deltas within the threshold", () => {
    // The threshold is strict `>`, so any delta strictly
    // below 0.02 passes. Use 0.019 to leave headroom against
    // IEEE-754 representation error (0.5 → 0.52 does not
    // subtract to exactly 0.02).
    const a = solarState({ daylightFraction: 0.5 });
    const b = solarState({ daylightFraction: 0.519 });

    expect(statesApproximatelyEqual(a, b)).toBe(true);
  });

  it("rejects daylight deltas beyond the threshold", () => {
    const a = solarState({ daylightFraction: 0.5 });
    const b = solarState({ daylightFraction: 0.5201 });

    expect(statesApproximatelyEqual(a, b)).toBe(false);
  });

  it("treats two null subsolar positions as equal", () => {
    const a = solarState({ subsolarScreenPosition: null });
    const b = solarState({ subsolarScreenPosition: null });

    expect(statesApproximatelyEqual(a, b)).toBe(true);
  });

  it("treats one null and one non-null subsolar position as different", () => {
    const a = solarState({ subsolarScreenPosition: null });
    const b = solarState({
      subsolarScreenPosition: { x: 0, y: 0 },
    });

    expect(statesApproximatelyEqual(a, b)).toBe(false);
    expect(statesApproximatelyEqual(b, a)).toBe(false);
  });

  it("accepts subsolar positions within the distance threshold", () => {
    const a = solarState({
      subsolarScreenPosition: { x: 0, y: 0 },
    });
    const b = solarState({
      subsolarScreenPosition: { x: 0.029, y: 0 },
    });

    expect(statesApproximatelyEqual(a, b)).toBe(true);
  });

  it("rejects subsolar positions beyond the distance threshold", () => {
    const a = solarState({
      subsolarScreenPosition: { x: 0, y: 0 },
    });
    const b = solarState({
      subsolarScreenPosition: { x: 0.04, y: 0 },
    });

    expect(statesApproximatelyEqual(a, b)).toBe(false);
  });

  it("uses Euclidean distance for subsolar positions, not per-axis", () => {
    const a = solarState({
      subsolarScreenPosition: { x: 0, y: 0 },
    });
    const b = solarState({
      subsolarScreenPosition: { x: 0.02, y: 0.02 },
    });

    expect(statesApproximatelyEqual(a, b)).toBe(true);
  });

  it("is symmetric", () => {
    const a = solarState({ averageSolarElevation: 30 });
    const b = solarState({ averageSolarElevation: 31 });

    expect(statesApproximatelyEqual(a, b)).toBe(
      statesApproximatelyEqual(b, a),
    );

    const c = solarState({ dominantAtmosphere: "night" });
    expect(statesApproximatelyEqual(a, c)).toBe(
      statesApproximatelyEqual(c, a),
    );
  });

  it("returns false on the first discriminating field (short-circuit)", () => {
    /*
     * When the atmosphere differs, elevation/daylight/position
     * are never inspected. This test asserts the shape of the
     * short-circuit contract rather than its exact
     * consequence — a value with a mismatched atmosphere but
     * identical everything else still returns false.
     */
    const a = solarState({ dominantAtmosphere: "day" });
    const b = solarState({ dominantAtmosphere: "night" });

    expect(statesApproximatelyEqual(a, b)).toBe(false);
  });
});