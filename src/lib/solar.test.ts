import { describe, expect, it } from "vitest";

import {
  describeSolarElevation,
  getSolarElevation,
  getSubsolarPoint,
  getSunDirection,
  latLngToUnitVector,
} from "@/lib/solar";

/* -------------------------------------------------------------------------- */
/* Reference instants                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic instants used across tests. Fixed timestamps
 * so results are reproducible regardless of when the suite
 * runs.
 */
const J2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
const MARCH_EQUINOX_2024 = new Date(
  Date.UTC(2024, 2, 20, 3, 6, 0),
);
const JUNE_SOLSTICE_2024 = new Date(
  Date.UTC(2024, 5, 20, 20, 51, 0),
);
const SEPTEMBER_EQUINOX_2024 = new Date(
  Date.UTC(2024, 8, 22, 12, 44, 0),
);
const DECEMBER_SOLSTICE_2024 = new Date(
  Date.UTC(2024, 11, 21, 9, 21, 0),
);

function magnitude(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

/* -------------------------------------------------------------------------- */
/* getSubsolarPoint — invariants                                              */
/* -------------------------------------------------------------------------- */

describe("getSubsolarPoint — output range", () => {
  it("returns a latitude within the solar declination range (±23.44°)", () => {
    const instants = [
      J2000,
      MARCH_EQUINOX_2024,
      JUNE_SOLSTICE_2024,
      SEPTEMBER_EQUINOX_2024,
      DECEMBER_SOLSTICE_2024,
    ];

    for (const date of instants) {
      const { lat } = getSubsolarPoint(date);
      expect(lat).toBeGreaterThanOrEqual(-23.44);
      expect(lat).toBeLessThanOrEqual(23.44);
    }
  });

  it("returns a longitude in [-180, 180)", () => {
    // Sample across a whole day to exercise every wrap branch.
    const base = Date.UTC(2024, 5, 15, 0, 0, 0);

    for (let h = 0; h < 24; h++) {
      const { lng } = getSubsolarPoint(
        new Date(base + h * 3_600_000),
      );
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThan(180);
    }
  });

  it("returns finite lat and lng for any Date", () => {
    const instants = [
      new Date(0),
      new Date(-1_000_000_000_000),
      new Date(1_000_000_000_000),
      new Date(253_402_300_799_000), // year 9999
    ];

    for (const date of instants) {
      const { lat, lng } = getSubsolarPoint(date);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    }
  });

  it("defaults to the current time when no date is given", () => {
    // Compare against an explicit `new Date()` within a few
    // milliseconds. Both calls happen near-simultaneously.
    const implicit = getSubsolarPoint();
    const explicit = getSubsolarPoint(new Date());

    expect(Math.abs(implicit.lat - explicit.lat)).toBeLessThan(1e-3);
    expect(Math.abs(implicit.lng - explicit.lng)).toBeLessThan(1e-2);
  });
});

/* -------------------------------------------------------------------------- */
/* getSubsolarPoint — physical sanity                                         */
/* -------------------------------------------------------------------------- */

describe("getSubsolarPoint — physical sanity", () => {
  it("latitude is near zero at equinoxes", () => {
    // The subsolar latitude crosses zero at each equinox.
    // Meeus low-precision is accurate to ~0.01°, but the
    // equinox instant itself can be off by a few minutes
    // depending on the source; use ±1° as the tolerance.
    expect(
      Math.abs(getSubsolarPoint(MARCH_EQUINOX_2024).lat),
    ).toBeLessThan(1);
    expect(
      Math.abs(getSubsolarPoint(SEPTEMBER_EQUINOX_2024).lat),
    ).toBeLessThan(1);
  });

  it("latitude is near +23.44° at June solstice", () => {
    const { lat } = getSubsolarPoint(JUNE_SOLSTICE_2024);
    expect(lat).toBeGreaterThan(23.0);
    expect(lat).toBeLessThan(23.5);
  });

  it("latitude is near −23.44° at December solstice", () => {
    const { lat } = getSubsolarPoint(DECEMBER_SOLSTICE_2024);
    expect(lat).toBeLessThan(-23.0);
    expect(lat).toBeGreaterThan(-23.5);
  });

  it("longitude moves westward at roughly 15°/hour", () => {
    // One hour of UTC time corresponds to ~15° of longitude
    // drift. Near the antimeridian the wrap can jump by 360°,
    // so we take the shortest signed difference and compare.
    const start = Date.UTC(2024, 5, 15, 0, 0, 0);
    const a = getSubsolarPoint(new Date(start)).lng;
    const b = getSubsolarPoint(new Date(start + 3_600_000)).lng;

    let delta = b - a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // Westward movement is negative longitude change.
    expect(delta).toBeLessThan(-14);
    expect(delta).toBeGreaterThan(-16);
  });

  it("longitude wraps rather than exceeding ±180 over a full day", () => {
    const start = Date.UTC(2024, 5, 15, 0, 0, 0);

    for (let h = 0; h < 24; h++) {
      const { lng } = getSubsolarPoint(
        new Date(start + h * 3_600_000),
      );
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThan(180);
    }
  });

  it("latitude advances monotonically from March equinox to June solstice", () => {
    // From roughly March 20 to June 20 the subsolar latitude
    // increases monotonically from ~0° to ~+23.4°. This is a
    // strong constraint on the declination model: a sign
    // error or an off-by-one in the mean-anomaly rate would
    // break it long before the endpoint tests catch the drift.
    let previous = -Infinity;

    for (let day = 0; day < 90; day += 5) {
      const t = new Date(
        Date.UTC(2024, 2, 20) + day * 86_400_000,
      );
      const { lat } = getSubsolarPoint(t);
      expect(lat).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = lat;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* latLngToUnitVector                                                         */
/* -------------------------------------------------------------------------- */

describe("latLngToUnitVector", () => {
  it("returns a unit vector for every reference point", () => {
    const cases: readonly [number, number][] = [
      [0, 0],
      [90, 0],
      [-90, 0],
      [0, 90],
      [0, -90],
      [0, 180],
      [45, 45],
      [12.34, 156.78],
      [-56.78, -123.45],
    ];

    for (const [lat, lng] of cases) {
      expect(
        magnitude(latLngToUnitVector(lat, lng)),
      ).toBeCloseTo(1, 12);
    }
  });

  it("north pole is on the +Y axis", () => {
    const v = latLngToUnitVector(90, 0);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(1, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("south pole is on the −Y axis", () => {
    const v = latLngToUnitVector(-90, 0);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(-1, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("prime meridian (lat 0, lng 0) sits on the +Z axis", () => {
    const v = latLngToUnitVector(0, 0);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(1, 10);
  });

  it("90° east (lat 0, lng 90) sits on the +X axis", () => {
    const v = latLngToUnitVector(0, 90);
    expect(v.x).toBeCloseTo(1, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("90° west (lat 0, lng −90) sits on the −X axis", () => {
    const v = latLngToUnitVector(0, -90);
    expect(v.x).toBeCloseTo(-1, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("180° (lat 0, lng 180) sits on the −Z axis", () => {
    const v = latLngToUnitVector(0, 180);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-1, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* getSolarElevation                                                          */
/* -------------------------------------------------------------------------- */

describe("getSolarElevation", () => {
  it("is +90° at the subsolar point", () => {
    const subsolar = getSubsolarPoint(JUNE_SOLSTICE_2024);
    const elevation = getSolarElevation(
      subsolar.lat,
      subsolar.lng,
      JUNE_SOLSTICE_2024,
    );

    expect(elevation).toBeCloseTo(90, 6);
  });

  it("is −90° at the antipode of the subsolar point", () => {
    const subsolar = getSubsolarPoint(JUNE_SOLSTICE_2024);
    const antipodeLat = -subsolar.lat;
    const antipodeLng =
      subsolar.lng > 0 ? subsolar.lng - 180 : subsolar.lng + 180;

    const elevation = getSolarElevation(
      antipodeLat,
      antipodeLng,
      JUNE_SOLSTICE_2024,
    );

    expect(elevation).toBeCloseTo(-90, 6);
  });

  it("is 0° at the terminator (90° from the subsolar point)", () => {
    // A point 90° of great-circle arc away from the subsolar
    // point sits exactly on the day/night boundary.
    const subsolar = getSubsolarPoint(MARCH_EQUINOX_2024);
    // At equinox the subsolar latitude is ~0; move 90° east
    // along the equator.
    const elevation = getSolarElevation(
      0,
      subsolar.lng + 90,
      MARCH_EQUINOX_2024,
    );

    expect(Math.abs(elevation)).toBeLessThan(1);
  });

  it("stays within [-90, 90] for any input", () => {
    const instants = [
      J2000,
      MARCH_EQUINOX_2024,
      JUNE_SOLSTICE_2024,
      DECEMBER_SOLSTICE_2024,
    ];

    for (const date of instants) {
      for (let lat = -90; lat <= 90; lat += 30) {
        for (let lng = -180; lng < 180; lng += 45) {
          const elevation = getSolarElevation(lat, lng, date);
          expect(elevation).toBeGreaterThanOrEqual(-90.001);
          expect(elevation).toBeLessThanOrEqual(90.001);
          expect(Number.isFinite(elevation)).toBe(true);
        }
      }
    }
  });

  it("is continuous across the antimeridian", () => {
    // Two longitudes ±0.001° apart across the wrap should
    // have nearly identical elevations.
    const a = getSolarElevation(
      0,
      179.999,
      MARCH_EQUINOX_2024,
    );
    const b = getSolarElevation(
      0,
      -179.999,
      MARCH_EQUINOX_2024,
    );

    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it("is lower at the winter pole than the summer pole", () => {
    // Northern hemisphere: June solstice → north pole higher.
    const northJune = getSolarElevation(
      90,
      0,
      JUNE_SOLSTICE_2024,
    );
    const southJune = getSolarElevation(
      -90,
      0,
      JUNE_SOLSTICE_2024,
    );

    expect(northJune).toBeGreaterThan(southJune);
    expect(northJune).toBeGreaterThan(20);
    expect(southJune).toBeLessThan(-20);
  });

  it("polar day at the north pole during June solstice", () => {
    // At the June solstice the north pole sees the sun at
    // elevation equal to the declination (23.44°), and the
    // south pole is at -23.44°. This is the cleanest
    // single-value assertion of the north/south asymmetry.
    const north = getSolarElevation(
      90,
      0,
      JUNE_SOLSTICE_2024,
    );
    const south = getSolarElevation(
      -90,
      0,
      JUNE_SOLSTICE_2024,
    );

    expect(north).toBeCloseTo(23.4, 0);
    expect(south).toBeCloseTo(-23.4, 0);
  });

  it("is symmetric about the subsolar meridian at noon", () => {
    // Two longitudes symmetric about the subsolar meridian
    // at the equator should have equal elevation.
    const subsolar = getSubsolarPoint(MARCH_EQUINOX_2024);

    const east = getSolarElevation(
      0,
      subsolar.lng + 30,
      MARCH_EQUINOX_2024,
    );
    const west = getSolarElevation(
      0,
      subsolar.lng - 30,
      MARCH_EQUINOX_2024,
    );

    expect(Math.abs(east - west)).toBeLessThan(0.1);
  });

  it("defaults to the current time when no date is given", () => {
    const implicit = getSolarElevation(0, 0);
    const explicit = getSolarElevation(0, 0, new Date());

    expect(Math.abs(implicit - explicit)).toBeLessThan(0.1);
  });

  it("never produces NaN for pole coordinates at extreme dates", () => {
    /*
     * The dot product at the poles is the numerically
     * sensitive case: `acos(±1.0000000001)` is `NaN`. This
     * test guards the `Math.max(-1, Math.min(1, dot))` clamp.
     */
    const instants = [
      new Date(0),
      J2000,
      JUNE_SOLSTICE_2024,
      new Date(4_102_444_800_000), // year 2100
    ];

    for (const date of instants) {
      for (const lat of [-90, -89.9999, 90, 89.9999]) {
        for (const lng of [-180, -90, 0, 90, 180]) {
          const e = getSolarElevation(lat, lng, date);
          expect(Number.isNaN(e)).toBe(false);
          expect(Number.isFinite(e)).toBe(true);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getSunDirection                                                            */
/* -------------------------------------------------------------------------- */

describe("getSunDirection", () => {
  it("returns a unit vector", () => {
    const v = getSunDirection(JUNE_SOLSTICE_2024);
    expect(magnitude(v)).toBeCloseTo(1, 12);
  });

  it("matches latLngToUnitVector of the subsolar point", () => {
    const subsolar = getSubsolarPoint(JUNE_SOLSTICE_2024);
    const expected = latLngToUnitVector(
      subsolar.lat,
      subsolar.lng,
    );
    const actual = getSunDirection(JUNE_SOLSTICE_2024);

    expect(actual.x).toBeCloseTo(expected.x, 12);
    expect(actual.y).toBeCloseTo(expected.y, 12);
    expect(actual.z).toBeCloseTo(expected.z, 12);
  });

  it("points toward +Y at the June solstice (northward tilt)", () => {
    const v = getSunDirection(JUNE_SOLSTICE_2024);
    expect(v.y).toBeGreaterThan(0.3);
  });

  it("points toward −Y at the December solstice (southward tilt)", () => {
    const v = getSunDirection(DECEMBER_SOLSTICE_2024);
    expect(v.y).toBeLessThan(-0.3);
  });

  it("is roughly equatorial at equinox", () => {
    // At the equinox the subsolar latitude is ~0°, so the Y
    // component should be near zero.
    const v = getSunDirection(MARCH_EQUINOX_2024);
    expect(Math.abs(v.y)).toBeLessThan(0.05);
  });

  it("defaults to the current time when no date is given", () => {
    const implicit = getSunDirection();
    const explicit = getSunDirection(new Date());

    expect(Math.abs(implicit.x - explicit.x)).toBeLessThan(0.01);
    expect(Math.abs(implicit.y - explicit.y)).toBeLessThan(0.01);
    expect(Math.abs(implicit.z - explicit.z)).toBeLessThan(0.01);
  });
});

/* -------------------------------------------------------------------------- */
/* describeSolarElevation                                                     */
/* -------------------------------------------------------------------------- */

describe("describeSolarElevation", () => {
  it.each([
    [90, "day"],
    [15, "day"],
    [14.999, "golden-hour"],
    [0, "golden-hour"],
    [-0.001, "civil-twilight"],
    [-6, "civil-twilight"],
    [-6.001, "nautical-twilight"],
    [-12, "nautical-twilight"],
    [-12.001, "astronomical-twilight"],
    [-18, "astronomical-twilight"],
    [-18.001, "night"],
    [-90, "night"],
  ] as const)(
    "classifies %f as %s",
    (elevation, expected) => {
      expect(describeSolarElevation(elevation)).toBe(expected);
    },
  );

  it("returns a phase for every elevation in [-90, 90]", () => {
    const valid = new Set([
      "night",
      "astronomical-twilight",
      "nautical-twilight",
      "civil-twilight",
      "golden-hour",
      "day",
    ]);

    for (let e = -90; e <= 90; e += 0.5) {
      expect(valid.has(describeSolarElevation(e))).toBe(true);
    }
  });

  it("is monotonically non-decreasing in brightness", () => {
    // The phase ordering from darkest to brightest.
    const order = [
      "night",
      "astronomical-twilight",
      "nautical-twilight",
      "civil-twilight",
      "golden-hour",
      "day",
    ] as const;

    let previousRank = -1;

    for (let e = -90; e <= 90; e += 0.5) {
      const rank = order.indexOf(describeSolarElevation(e));
      expect(rank).toBeGreaterThanOrEqual(previousRank);
      previousRank = rank;
    }
  });
});