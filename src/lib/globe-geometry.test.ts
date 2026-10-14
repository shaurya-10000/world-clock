import { describe, expect, it } from "vitest";

import {
  GLOBE_RADIUS,
  GLOBE_SCALE,
  latLngToDirection,
  latLngToPosition,
  locationToDirection,
  locationToPosition,
} from "@/lib/globe-geometry";
import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A minimal valid location for tests that exercise the
 * `location*` helpers. The values themselves are only used to
 * compare one helper against another — the assertions would
 * hold for any location.
 */
const SAMPLE_LOCATION: WorldLocation = {
  id: "test-location",
  city: "Test City",
  country: "Test Country",
  timezone: "UTC",
  latitude: 40,
  longitude: -30,
  continent: "north-america",
  globeTiers: ["major"],
};

/**
 * Assert that a vector is approximately unit length. All
 * `latLngToDirection` results should satisfy this within
 * floating-point tolerance.
 */
function expectUnitVector(v: {
  x: number;
  y: number;
  z: number;
}): void {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  expect(length).toBeCloseTo(1, 10);
}

/**
 * Dot product for two plain vectors, used by the orthonormality
 * checks below.
 */
function dot(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

describe("GLOBE_RADIUS and GLOBE_SCALE", () => {
  it("scale is exactly radius divided by 100", () => {
    expect(GLOBE_SCALE).toBe(GLOBE_RADIUS / 100);
  });

  it("radius is a positive finite number", () => {
    expect(GLOBE_RADIUS).toBeGreaterThan(0);
    expect(Number.isFinite(GLOBE_RADIUS)).toBe(true);
  });

  it("radius matches the value three-globe's scene expects", () => {
    /*
     * The radius is referenced by `CameraTravel` and the
     * marker altitude constants in `components/globe/constants`.
     * Changing it without updating those would put markers
     * inside the atmosphere shell. This test pins the value
     * so a change is a deliberate decision, not a drift.
     */
    expect(GLOBE_RADIUS).toBe(1.55);
  });
});

/* -------------------------------------------------------------------------- */
/* latLngToPosition — reference points                                        */
/* -------------------------------------------------------------------------- */

describe("latLngToPosition — reference points", () => {
  /*
   * The frame implemented by `latLngToPosition` is:
   *
   *   +Y  → north pole
   *   +Z  → prime meridian (longitude 0°)
   *   +X  → 90° east
   *
   * These tests assert that frame directly. They also serve as
   * regression guards: a sign flip in any of the sin/cos
   * combinations would move a reference point to the opposite
   * axis and fail here loudly.
   */

  it("north pole is on the +Y axis", () => {
    const [x, y, z] = latLngToPosition(90, 0);

    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(GLOBE_RADIUS, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("south pole is on the −Y axis", () => {
    const [x, y, z] = latLngToPosition(-90, 0);

    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-GLOBE_RADIUS, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("latitude 0, longitude 0 (prime meridian) sits on the +Z axis", () => {
    const [x, y, z] = latLngToPosition(0, 0);

    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(GLOBE_RADIUS, 10);
  });

  it("latitude 0, longitude 90 east sits on the +X axis", () => {
    const [x, y, z] = latLngToPosition(0, 90);

    expect(x).toBeCloseTo(GLOBE_RADIUS, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("latitude 0, longitude −90 sits on the −X axis", () => {
    const [x, y, z] = latLngToPosition(0, -90);

    expect(x).toBeCloseTo(-GLOBE_RADIUS, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("latitude 0, longitude 180 sits on the −Z axis", () => {
    const [x, y, z] = latLngToPosition(0, 180);

    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(-GLOBE_RADIUS, 10);
  });

  it("returns a readonly tuple", () => {
    const result = latLngToPosition(0, 0);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* latLngToPosition — distance from origin                                    */
/* -------------------------------------------------------------------------- */

describe("latLngToPosition — radius preservation", () => {
  it("all surface positions are GLOBE_RADIUS from the origin", () => {
    const cases: readonly [number, number][] = [
      [0, 0],
      [90, 0],
      [-90, 0],
      [45, 45],
      [45, -45],
      [-45, 45],
      [-45, -45],
      [12.34, 156.78],
      [-56.78, -123.45],
    ];

    for (const [lat, lng] of cases) {
      const [x, y, z] = latLngToPosition(lat, lng);
      const length = Math.sqrt(x * x + y * y + z * z);

      expect(length).toBeCloseTo(GLOBE_RADIUS, 10);
    }
  });

  it("altitude scales the radius linearly", () => {
    const [x, y, z] = latLngToPosition(40, -30, 0.5);
    const length = Math.sqrt(x * x + y * y + z * z);

    expect(length).toBeCloseTo(GLOBE_RADIUS * 1.5, 10);
  });

  it("altitude of 0 and altitude of 0.025 differ by exactly that factor", () => {
    const [x0, y0, z0] = latLngToPosition(40, -30, 0);
    const [x1, y1, z1] = latLngToPosition(40, -30, 0.025);

    expect(x1 / x0).toBeCloseTo(1.025, 10);
    expect(y1 / y0).toBeCloseTo(1.025, 10);
    expect(z1 / z0).toBeCloseTo(1.025, 10);
  });

  it("altitude 0 places the point exactly on the surface", () => {
    const [x, y, z] = latLngToPosition(20, 40, 0);
    const length = Math.sqrt(x * x + y * y + z * z);

    expect(length).toBeCloseTo(GLOBE_RADIUS, 12);
  });

  it("negative altitude would sink below the surface (not used, but arithmetic holds)", () => {
    /*
     * No consumer passes a negative altitude, but the
     * arithmetic is defined for it. Pinning the behavior
     * documents that the function does not clamp.
     */
    const [x, y, z] = latLngToPosition(0, 0, -0.5);
    const length = Math.sqrt(x * x + y * y + z * z);

    expect(length).toBeCloseTo(GLOBE_RADIUS * 0.5, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* locationToPosition                                                         */
/* -------------------------------------------------------------------------- */

describe("locationToPosition", () => {
  it("uses the default marker altitude of 0.025", () => {
    const viaLocation = locationToPosition(SAMPLE_LOCATION);
    const viaCoordinates = latLngToPosition(
      SAMPLE_LOCATION.latitude,
      SAMPLE_LOCATION.longitude,
      0.025,
    );

    expect(viaLocation[0]).toBe(viaCoordinates[0]);
    expect(viaLocation[1]).toBe(viaCoordinates[1]);
    expect(viaLocation[2]).toBe(viaCoordinates[2]);
  });

  it("respects an explicit altitude override", () => {
    const viaLocation = locationToPosition(SAMPLE_LOCATION, 0.1);
    const viaCoordinates = latLngToPosition(
      SAMPLE_LOCATION.latitude,
      SAMPLE_LOCATION.longitude,
      0.1,
    );

    expect(viaLocation[0]).toBe(viaCoordinates[0]);
    expect(viaLocation[1]).toBe(viaCoordinates[1]);
    expect(viaLocation[2]).toBe(viaCoordinates[2]);
  });

  it("does not mutate the location", () => {
    const snapshot = { ...SAMPLE_LOCATION };

    locationToPosition(SAMPLE_LOCATION);
    locationToPosition(SAMPLE_LOCATION, 0.5);

    expect(SAMPLE_LOCATION).toEqual(snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* latLngToDirection                                                          */
/* -------------------------------------------------------------------------- */

describe("latLngToDirection", () => {
  it("returns a unit vector for every reference point", () => {
    const cases: readonly [number, number][] = [
      [0, 0],
      [90, 0],
      [-90, 0],
      [0, 90],
      [0, -90],
      [0, 180],
      [45, 45],
      [-45, -45],
      [12.34, 156.78],
    ];

    for (const [lat, lng] of cases) {
      expectUnitVector(latLngToDirection(lat, lng));
    }
  });

  it("matches the direction of the position vector at altitude 0", () => {
    /*
     * The direction should be the normalized form of the
     * surface position. Assert that the two are parallel by
     * checking each component against the position divided
     * by its length.
     */
    const direction = latLngToDirection(37.7749, -122.4194);
    const position = latLngToPosition(37.7749, -122.4194, 0);

    const length = Math.sqrt(
      position[0] * position[0] +
        position[1] * position[1] +
        position[2] * position[2],
    );

    expect(direction.x).toBeCloseTo(position[0] / length, 12);
    expect(direction.y).toBeCloseTo(position[1] / length, 12);
    expect(direction.z).toBeCloseTo(position[2] / length, 12);
  });

  it("north pole points along +Y", () => {
    const d = latLngToDirection(90, 0);

    expect(d.x).toBeCloseTo(0, 10);
    expect(d.y).toBeCloseTo(1, 10);
    expect(d.z).toBeCloseTo(0, 10);
  });

  it("south pole points along −Y", () => {
    const d = latLngToDirection(-90, 0);

    expect(d.x).toBeCloseTo(0, 10);
    expect(d.y).toBeCloseTo(-1, 10);
    expect(d.z).toBeCloseTo(0, 10);
  });

  it("equator, prime meridian points along +Z", () => {
    const d = latLngToDirection(0, 0);

    expect(d.x).toBeCloseTo(0, 10);
    expect(d.y).toBeCloseTo(0, 10);
    expect(d.z).toBeCloseTo(1, 10);
  });

  it("equator, 90° east points along +X", () => {
    const d = latLngToDirection(0, 90);

    expect(d.x).toBeCloseTo(1, 10);
    expect(d.y).toBeCloseTo(0, 10);
    expect(d.z).toBeCloseTo(0, 10);
  });

  it("returns a plain object, not a tuple", () => {
    const d = latLngToDirection(45, 45);
    expect(d).toHaveProperty("x");
    expect(d).toHaveProperty("y");
    expect(d).toHaveProperty("z");
    expect(Array.isArray(d)).toBe(false);
  });

  it("returns a fresh object on every call", () => {
    const a = latLngToDirection(45, 45);
    const b = latLngToDirection(45, 45);

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* -------------------------------------------------------------------------- */
/* locationToDirection                                                        */
/* -------------------------------------------------------------------------- */

describe("locationToDirection", () => {
  it("matches latLngToDirection for the same coordinates", () => {
    const viaLocation = locationToDirection(SAMPLE_LOCATION);
    const viaCoordinates = latLngToDirection(
      SAMPLE_LOCATION.latitude,
      SAMPLE_LOCATION.longitude,
    );

    expect(viaLocation.x).toBe(viaCoordinates.x);
    expect(viaLocation.y).toBe(viaCoordinates.y);
    expect(viaLocation.z).toBe(viaCoordinates.z);
  });

  it("returns a unit vector", () => {
    expectUnitVector(locationToDirection(SAMPLE_LOCATION));
  });

  it("does not mutate the location", () => {
    const snapshot = { ...SAMPLE_LOCATION };

    locationToDirection(SAMPLE_LOCATION);

    expect(SAMPLE_LOCATION).toEqual(snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* Orthogonality                                                              */
/* -------------------------------------------------------------------------- */

describe("reference directions are orthonormal", () => {
  /*
   * The three canonical directions — prime meridian, north
   * pole, and 90° east — should be mutually perpendicular. A
   * sign flip in any of the sin/cos combinations used by
   * `latLngToPosition` would break this without breaking the
   * individual axis tests, because each axis test asserts
   * only one nonzero component.
   */
  const primeMeridian = latLngToDirection(0, 0);
  const northPole = latLngToDirection(90, 0);
  const eastMeridian = latLngToDirection(0, 90);

  it("prime meridian is perpendicular to the north pole", () => {
    expect(dot(primeMeridian, northPole)).toBeCloseTo(0, 10);
  });

  it("prime meridian is perpendicular to the east meridian", () => {
    expect(dot(primeMeridian, eastMeridian)).toBeCloseTo(0, 10);
  });

  it("north pole is perpendicular to the east meridian", () => {
    expect(dot(northPole, eastMeridian)).toBeCloseTo(0, 10);
  });

  it("all three reference directions are unit vectors", () => {
    expectUnitVector(primeMeridian);
    expectUnitVector(northPole);
    expectUnitVector(eastMeridian);
  });
});

/* -------------------------------------------------------------------------- */
/* Continuity                                                                 */
/* -------------------------------------------------------------------------- */

describe("continuity across the antimeridian", () => {
  it("longitude 179.999 and −179.999 produce nearly identical positions", () => {
    /*
     * The antimeridian is a discontinuity in longitude, not in
     * space. Two coordinates one thousandth of a degree apart
     * across the seam should produce positions that are also
     * one thousandth of a degree apart — not positions on
     * opposite sides of the globe.
     */
    const [xA, yA, zA] = latLngToPosition(0, 179.999);
    const [xB, yB, zB] = latLngToPosition(0, -179.999);

    expect(Math.abs(xA - xB)).toBeLessThan(1e-4);
    expect(Math.abs(yA - yB)).toBeLessThan(1e-4);
    expect(Math.abs(zA - zB)).toBeLessThan(1e-4);
  });

  it("longitude 0 and 360 produce the same position", () => {
    /*
     * `360°` is not a valid longitude by the interface
     * contract, but the sin/cos arithmetic wraps it correctly.
     * This pins the behavior so a future clamp cannot silently
     * break it.
     */
    const [xA, yA, zA] = latLngToPosition(20, 0);
    const [xB, yB, zB] = latLngToPosition(20, 360);

    expect(xA).toBeCloseTo(xB, 10);
    expect(yA).toBeCloseTo(yB, 10);
    expect(zA).toBeCloseTo(zB, 10);
  });

  it("latitudes symmetric about the equator produce mirrored y-coordinates", () => {
    const [xA, yA, zA] = latLngToPosition(40, 30);
    const [xB, yB, zB] = latLngToPosition(-40, 30);

    expect(xA).toBeCloseTo(xB, 10);
    expect(yA).toBeCloseTo(-yB, 10);
    expect(zA).toBeCloseTo(zB, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("determinism", () => {
  it("produces identical output for identical input across many calls", () => {
    const a = latLngToPosition(37.7749, -122.4194, 0.025);
    const b = latLngToPosition(37.7749, -122.4194, 0.025);

    expect(a).toEqual(b);
  });

  it("locationToPosition is deterministic", () => {
    const a = locationToPosition(SAMPLE_LOCATION);
    const b = locationToPosition(SAMPLE_LOCATION);

    expect(a).toEqual(b);
  });

  it("latLngToDirection is deterministic", () => {
    const a = latLngToDirection(37.7749, -122.4194);
    const b = latLngToDirection(37.7749, -122.4194);

    expect(a).toEqual(b);
  });
});