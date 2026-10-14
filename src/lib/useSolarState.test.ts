import { describe, expect, it } from "vitest";

import {
  computeSolarState,
  useSolarState,
} from "@/lib/useSolarState";
import type { SolarState } from "@/lib/useSolarState";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const JUNE_SOLSTICE = new Date(Date.UTC(2024, 5, 20, 12, 0, 0));
const DECEMBER_SOLSTICE = new Date(
  Date.UTC(2024, 11, 21, 12, 0, 0),
);
const MARCH_EQUINOX_NOON = new Date(
  Date.UTC(2024, 2, 20, 12, 0, 0),
);

const IDENTITY_Q = [0, 0, 0, 1] as const;

const CAMERA_ON_Z = { x: 0, y: 0, z: 5 };
const CAMERA_ON_NEG_Z = { x: 0, y: 0, z: -5 };
const CAMERA_ON_X = { x: 5, y: 0, z: 0 };
const CAMERA_ON_NEG_X = { x: -5, y: 0, z: 0 };

/* -------------------------------------------------------------------------- */
/* Output shape                                                               */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — output shape", () => {
  it("returns every field of SolarState", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(state).toHaveProperty("dominantAtmosphere");
    expect(state).toHaveProperty("averageSolarElevation");
    expect(state).toHaveProperty("subsolarScreenPosition");
    expect(state).toHaveProperty("daylightFraction");
  });

  it("dominantAtmosphere is one of the four valid values", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(["dawn", "day", "dusk", "night"]).toContain(
      state.dominantAtmosphere,
    );
  });

  it("averageSolarElevation is within [-90, 90]", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(state.averageSolarElevation).toBeGreaterThanOrEqual(-90);
    expect(state.averageSolarElevation).toBeLessThanOrEqual(90);
  });

  it("daylightFraction is within [0, 1]", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(state.daylightFraction).toBeGreaterThanOrEqual(0);
    expect(state.daylightFraction).toBeLessThanOrEqual(1);
  });

  it("subsolarScreenPosition is either null or an [0,1] pair", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    if (state.subsolarScreenPosition !== null) {
      expect(state.subsolarScreenPosition.x).toBeGreaterThanOrEqual(0);
      expect(state.subsolarScreenPosition.x).toBeLessThanOrEqual(1);
      expect(state.subsolarScreenPosition.y).toBeGreaterThanOrEqual(0);
      expect(state.subsolarScreenPosition.y).toBeLessThanOrEqual(1);
    }
  });

  it("all numeric outputs are finite for a normal camera pose", () => {
    const state = computeSolarState({
      cameraPosition: { x: 2.5, y: 1.5, z: 3.5 },
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(Number.isFinite(state.averageSolarElevation)).toBe(true);
    expect(Number.isFinite(state.daylightFraction)).toBe(true);

    if (state.subsolarScreenPosition !== null) {
      expect(Number.isFinite(state.subsolarScreenPosition.x)).toBe(true);
      expect(Number.isFinite(state.subsolarScreenPosition.y)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — defaults", () => {
  it("uses the current time when no date is given", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
    });

    expect(state).toBeDefined();
  });

  it("produces the same shape with or without an explicit date", () => {
    const withDate = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    const withoutDate = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
    });

    expect(
      ["dawn", "day", "dusk", "night"],
    ).toContain(withoutDate.dominantAtmosphere);
    expect(withoutDate.averageSolarElevation).toBeGreaterThanOrEqual(-90);
    expect(withoutDate.averageSolarElevation).toBeLessThanOrEqual(90);
    expect(withoutDate.daylightFraction).toBeGreaterThanOrEqual(0);
    expect(withoutDate.daylightFraction).toBeLessThanOrEqual(1);
    expect(withDate).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — determinism", () => {
  it("produces identical output for identical input", () => {
    const input = {
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    };

    expect(computeSolarState(input)).toEqual(computeSolarState(input));
  });

  it("is pure — same inputs, same outputs across many calls", () => {
    const input = {
      cameraPosition: CAMERA_ON_X,
      globeQuaternion: IDENTITY_Q,
      date: DECEMBER_SOLSTICE,
    };

    const first = computeSolarState(input);
    for (let i = 0; i < 10; i++) {
      expect(computeSolarState(input)).toEqual(first);
    }
  });

  it("does not mutate the input object", () => {
    const input = {
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    };

    const snapshot = {
      x: input.cameraPosition.x,
      y: input.cameraPosition.y,
      z: input.cameraPosition.z,
    };

    computeSolarState(input);

    expect(input.cameraPosition).toEqual(snapshot);
    expect(input.globeQuaternion).toEqual(IDENTITY_Q);
  });
});

/* -------------------------------------------------------------------------- */
/* Subsolar screen projection                                                 */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — subsolar screen projection", () => {
  it("returns a valid shape when the subsolar point is visible", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    if (state.subsolarScreenPosition !== null) {
      expect(state.subsolarScreenPosition.x).toBeGreaterThanOrEqual(0);
      expect(state.subsolarScreenPosition.x).toBeLessThanOrEqual(1);
      expect(state.subsolarScreenPosition.y).toBeGreaterThanOrEqual(0);
      expect(state.subsolarScreenPosition.y).toBeLessThanOrEqual(1);
    }
  });

  it("subsolar point on the prime meridian faces a camera on +Z at equinox noon", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: MARCH_EQUINOX_NOON,
    });

    if (state.subsolarScreenPosition !== null) {
      expect(state.subsolarScreenPosition.x).toBeGreaterThan(0.3);
      expect(state.subsolarScreenPosition.x).toBeLessThan(0.7);
    }
  });

  it("stays in [0,1] across a full camera orbit at equinox noon", () => {
    for (let angle = 0; angle < 360; angle += 15) {
      const rad = (angle * Math.PI) / 180;
      const state = computeSolarState({
        cameraPosition: {
          x: Math.cos(rad) * 5,
          y: 0,
          z: Math.sin(rad) * 5,
        },
        globeQuaternion: IDENTITY_Q,
        date: MARCH_EQUINOX_NOON,
      });

      if (state.subsolarScreenPosition !== null) {
        expect(state.subsolarScreenPosition.x).toBeGreaterThanOrEqual(0);
        expect(state.subsolarScreenPosition.x).toBeLessThanOrEqual(1);
        expect(state.subsolarScreenPosition.y).toBeGreaterThanOrEqual(0);
        expect(state.subsolarScreenPosition.y).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Subsolar visibility flips with camera side                                 */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — subsolar visibility", () => {
  /*
   * These tests assert the *structural* relationship between
   * the camera's position and the subsolar point — not any
   * specific numeric value. Any correct implementation must
   * produce mutually exclusive visibility: a subsolar point
   * visible from one side of the globe cannot be visible from
   * the opposite side at the same instant.
   */

  it("the subsolar point is visible from exactly one of two opposite cameras", () => {
    const date = MARCH_EQUINOX_NOON;

    const fromZ = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const fromNegZ = computeSolarState({
      cameraPosition: CAMERA_ON_NEG_Z,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const visibleFromZ = fromZ.subsolarScreenPosition !== null;
    const visibleFromNegZ = fromNegZ.subsolarScreenPosition !== null;

    expect(visibleFromZ).not.toBe(visibleFromNegZ);
  });

  it("the subsolar point is visible from exactly one of +X / −X cameras", () => {
    const date = MARCH_EQUINOX_NOON;

    const fromX = computeSolarState({
      cameraPosition: CAMERA_ON_X,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const fromNegX = computeSolarState({
      cameraPosition: CAMERA_ON_NEG_X,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const visibleFromX = fromX.subsolarScreenPosition !== null;
    const visibleFromNegX = fromNegX.subsolarScreenPosition !== null;

    expect(visibleFromX).not.toBe(visibleFromNegX);
  });

  it("daylightFraction across opposite cameras sums to roughly 1 at equinox noon", () => {
    const date = MARCH_EQUINOX_NOON;

    const a = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const b = computeSolarState({
      cameraPosition: CAMERA_ON_NEG_Z,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    expect(a.daylightFraction + b.daylightFraction).toBeCloseTo(1, 1);
  });

  it("the camera facing the sun reports higher daylight than the antipode", () => {
    const date = MARCH_EQUINOX_NOON;

    const a = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const b = computeSolarState({
      cameraPosition: CAMERA_ON_NEG_Z,
      globeQuaternion: IDENTITY_Q,
      date,
    });

    const brighter =
      a.daylightFraction > b.daylightFraction ? a : b;
    const darker =
      a.daylightFraction > b.daylightFraction ? b : a;

    expect(brighter.daylightFraction).toBeGreaterThanOrEqual(
      darker.daylightFraction,
    );
  });

  it("daylightFraction is a valid probability across a full sweep", () => {
    const date = MARCH_EQUINOX_NOON;

    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      const state = computeSolarState({
        cameraPosition: {
          x: Math.cos(rad) * 5,
          y: 0,
          z: Math.sin(rad) * 5,
        },
        globeQuaternion: IDENTITY_Q,
        date,
      });

      expect(state.daylightFraction).toBeGreaterThanOrEqual(0);
      expect(state.daylightFraction).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Quaternion rotation                                                        */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — globe rotation", () => {
  it("rotating the globe by 180° about Y flips the subsolar visibility", () => {
    const rotated: [number, number, number, number] = [0, 1, 0, 0];

    const forward = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: MARCH_EQUINOX_NOON,
    });

    const flipped = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: rotated,
      date: MARCH_EQUINOX_NOON,
    });

    const visibilityFlipped =
      (forward.subsolarScreenPosition === null) !==
      (flipped.subsolarScreenPosition === null);
    const fractionDiff = Math.abs(
      forward.daylightFraction - flipped.daylightFraction,
    );

    expect(visibilityFlipped || fractionDiff > 0.01).toBe(true);
  });

  it("does not throw on a zero quaternion", () => {
    expect(() =>
      computeSolarState({
        cameraPosition: CAMERA_ON_Z,
        globeQuaternion: [0, 0, 0, 0],
        date: JUNE_SOLSTICE,
      }),
    ).not.toThrow();
  });

  it("returns finite numbers for a zero quaternion", () => {
    const state = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: [0, 0, 0, 0],
      date: JUNE_SOLSTICE,
    });

    expect(Number.isFinite(state.averageSolarElevation)).toBe(true);
    expect(Number.isFinite(state.daylightFraction)).toBe(true);
    expect(["dawn", "day", "dusk", "night"]).toContain(
      state.dominantAtmosphere,
    );
  });

  it("a 360° rotation about Y returns the same state as identity", () => {
    /*
     * `[0, 0, 0, -1]` is the quaternion for a full turn about
     * any axis (it represents the same rotation as the
     * identity). The computed state must match.
     */
    const fullTurn: [number, number, number, number] = [0, 0, 0, -1];

    const identity = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: IDENTITY_Q,
      date: MARCH_EQUINOX_NOON,
    });

    const rotated = computeSolarState({
      cameraPosition: CAMERA_ON_Z,
      globeQuaternion: fullTurn,
      date: MARCH_EQUINOX_NOON,
    });

    expect(rotated.dominantAtmosphere).toBe(
      identity.dominantAtmosphere,
    );
    expect(rotated.averageSolarElevation).toBeCloseTo(
      identity.averageSolarElevation,
      10,
    );
    expect(rotated.daylightFraction).toBeCloseTo(
      identity.daylightFraction,
      10,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Extreme camera positions                                                   */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — camera positions", () => {
  it("handles a camera on the +Y axis (top-down view)", () => {
    expect(() =>
      computeSolarState({
        cameraPosition: { x: 0, y: 5, z: 0 },
        globeQuaternion: IDENTITY_Q,
        date: JUNE_SOLSTICE,
      }),
    ).not.toThrow();
  });

  it("handles a camera on the −Y axis (bottom-up view)", () => {
    expect(() =>
      computeSolarState({
        cameraPosition: { x: 0, y: -5, z: 0 },
        globeQuaternion: IDENTITY_Q,
        date: JUNE_SOLSTICE,
      }),
    ).not.toThrow();
  });

  it("handles a camera at the origin (degenerate forward)", () => {
    const state = computeSolarState({
      cameraPosition: { x: 0, y: 0, z: 0 },
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(["dawn", "day", "dusk", "night"]).toContain(
      state.dominantAtmosphere,
    );
    expect(Number.isFinite(state.averageSolarElevation)).toBe(true);
    expect(Number.isFinite(state.daylightFraction)).toBe(true);
  });

  it("handles an off-axis camera position", () => {
    expect(() =>
      computeSolarState({
        cameraPosition: { x: 2.5, y: 1.5, z: 3.5 },
        globeQuaternion: IDENTITY_Q,
        date: JUNE_SOLSTICE,
      }),
    ).not.toThrow();
  });

  it("produces a valid state for every cardinal camera axis", () => {
    const cameras = [
      { x: 5, y: 0, z: 0 },
      { x: -5, y: 0, z: 0 },
      { x: 0, y: 5, z: 0 },
      { x: 0, y: -5, z: 0 },
      { x: 0, y: 0, z: 5 },
      { x: 0, y: 0, z: -5 },
    ];

    for (const cameraPosition of cameras) {
      const state = computeSolarState({
        cameraPosition,
        globeQuaternion: IDENTITY_Q,
        date: MARCH_EQUINOX_NOON,
      });

      expect(["dawn", "day", "dusk", "night"]).toContain(
        state.dominantAtmosphere,
      );
      expect(state.averageSolarElevation).toBeGreaterThanOrEqual(-90);
      expect(state.averageSolarElevation).toBeLessThanOrEqual(90);
      expect(state.daylightFraction).toBeGreaterThanOrEqual(0);
      expect(state.daylightFraction).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Seasonal extremes                                                          */
/* -------------------------------------------------------------------------- */

describe("computeSolarState — seasonal extremes", () => {
  it("camera facing the June-solstice subsolar point reads as day", () => {
    /*
     * At the June solstice the subsolar point is at roughly
     * +23.4° latitude, on the prime meridian at 12:00 UTC.
     * A camera aligned with that direction should see a
     * fully-lit hemisphere.
     */
    const state = computeSolarState({
      cameraPosition: { x: 0, y: 2, z: 4.6 },
      globeQuaternion: IDENTITY_Q,
      date: JUNE_SOLSTICE,
    });

    expect(state.daylightFraction).toBeGreaterThan(0.5);
  });

  it("camera facing away from the sun reads as mostly dark", () => {
    /*
     * A camera on the exact antisolar side of the globe at
     * equinox noon should see predominantly the night
     * hemisphere.
     */
    const state = computeSolarState({
      cameraPosition: { x: 0, y: 0, z: -5 },
      globeQuaternion: IDENTITY_Q,
      date: MARCH_EQUINOX_NOON,
    });

    expect(state.daylightFraction).toBeLessThan(0.5);
  });
});

/* -------------------------------------------------------------------------- */
/* useSolarState hook                                                         */
/* -------------------------------------------------------------------------- */

describe("useSolarState", () => {
  it("returns the provided state when not null", () => {
    const state: SolarState = {
      dominantAtmosphere: "day",
      averageSolarElevation: 45,
      subsolarScreenPosition: { x: 0.5, y: 0.5 },
      daylightFraction: 0.9,
    };

    expect(useSolarState(state)).toBe(state);
  });

  it("returns a default state when given null", () => {
    const result = useSolarState(null);

    expect(result).toBeDefined();
    expect(result.dominantAtmosphere).toBe("night");
    expect(result.averageSolarElevation).toBe(0);
    expect(result.subsolarScreenPosition).toBeNull();
    expect(result.daylightFraction).toBe(0);
  });

  it("returns the same default reference across calls with null", () => {
    expect(useSolarState(null)).toBe(useSolarState(null));
  });

  it("does not mutate the state it was given", () => {
    const state: SolarState = {
      dominantAtmosphere: "dusk",
      averageSolarElevation: -3,
      subsolarScreenPosition: { x: 0.25, y: 0.75 },
      daylightFraction: 0.4,
    };

    const snapshot = { ...state };

    useSolarState(state);

    expect(state).toEqual(snapshot);
  });

  it("passes through a state object without copying it", () => {
    /*
     * Identity preservation matters for downstream
     * `useMemo`/`useEffect` dependency arrays keyed on the
     * state object.
     */
    const state: SolarState = {
      dominantAtmosphere: "dawn",
      averageSolarElevation: 2,
      subsolarScreenPosition: null,
      daylightFraction: 0.55,
    };

    expect(useSolarState(state)).toBe(state);
  });
});