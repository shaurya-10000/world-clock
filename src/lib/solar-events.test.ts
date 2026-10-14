import { describe, expect, it } from "vitest";

import {
  findSolarNoon,
  findSunrise,
  findSunset,
  getNextEquinox,
  getNextSolstice,
} from "@/lib/solar-events";
import {
  getSolarElevation as solarElevationAt,
  getSubsolarPoint,
} from "@/lib/solar";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * Known astronomical events, sourced from published almanac
 * data (USNO / timeanddate.com), rounded to the nearest
 * minute.
 *
 * Tolerance note: the Meeus low-precision formulas are
 * accurate to ~±1 minute against their own definition of the
 * event (ecliptic longitude crossing). Published tables
 * sometimes report a slightly different instant — e.g. the
 * moment of maximum declination rather than the longitude
 * crossing — and those two definitions differ by up to
 * several minutes. A ±10-minute tolerance leaves room for
 * that definitional gap without loosening the test beyond
 * usefulness; the event is still pinned to within ~0.002% of
 * its annual cycle.
 */

/** 2024 June solstice: 2024-06-20 20:51 UTC. */
const JUNE_SOLSTICE_2024 = new Date(
  Date.UTC(2024, 5, 20, 20, 51, 0),
);

/** 2024 December solstice: 2024-12-21 09:21 UTC. */
const DECEMBER_SOLSTICE_2024 = new Date(
  Date.UTC(2024, 11, 21, 9, 21, 0),
);

/** 2024 March equinox: 2024-03-20 03:06 UTC. */
const MARCH_EQUINOX_2024 = new Date(
  Date.UTC(2024, 2, 20, 3, 6, 0),
);

/** 2024 September equinox: 2024-09-22 12:44 UTC. */
const SEPTEMBER_EQUINOX_2024 = new Date(
  Date.UTC(2024, 8, 22, 12, 44, 0),
);

/** A winter reference instant (between Dec solstice and Mar equinox). */
const JANUARY_15_2024 = new Date(
  Date.UTC(2024, 0, 15, 12, 0, 0),
);

/**
 * UTC midnight at the start of January 15, 2024.
 *
 * Used by tests that need sunrise, noon, and sunset to all
 * land on the same calendar day. Passing noon as `from`
 * would push the "next sunrise" to the following day at mid
 * latitudes (the same-day sunrise has already passed).
 */
const JANUARY_15_2024_START = new Date(
  Date.UTC(2024, 0, 15, 0, 0, 0),
);

/** A summer reference instant (between Jun solstice and Sep equinox). */
const JULY_15_2024 = new Date(
  Date.UTC(2024, 6, 15, 12, 0, 0),
);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function minutesApart(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

/* -------------------------------------------------------------------------- */
/* getNextSolstice                                                            */
/* -------------------------------------------------------------------------- */

describe("getNextSolstice", () => {
  it("returns the June solstice when `from` is mid-winter", () => {
    const result = getNextSolstice(JANUARY_15_2024);

    expect(minutesApart(result, JUNE_SOLSTICE_2024)).toBeLessThan(10);
  });

  it("returns the December solstice when `from` is mid-summer", () => {
    const result = getNextSolstice(JULY_15_2024);

    expect(minutesApart(result, DECEMBER_SOLSTICE_2024)).toBeLessThan(10);
  });

  it("returns a solstice strictly at or after `from`", () => {
    const result = getNextSolstice(JANUARY_15_2024);

    expect(result.getTime()).toBeGreaterThanOrEqual(
      JANUARY_15_2024.getTime(),
    );
  });

  it("returns the same instant when `from` is exactly the solstice", () => {
    const result = getNextSolstice(JUNE_SOLSTICE_2024);

    expect(result.getTime()).toBeGreaterThanOrEqual(
      JUNE_SOLSTICE_2024.getTime() - 60_000,
    );
  });

  it("defaults to the current time when no date is given", () => {
    const before = new Date();
    const result = getNextSolstice();
    const after = new Date();

    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.getTime()).toBeLessThanOrEqual(
      after.getTime() + 190 * 86_400_000,
    );
  });

  it("is deterministic — same input, same output", () => {
    const a = getNextSolstice(JANUARY_15_2024);
    const b = getNextSolstice(JANUARY_15_2024);

    expect(a.getTime()).toBe(b.getTime());
  });

  it("handles a year boundary correctly", () => {
    const lateDecember = new Date(Date.UTC(2024, 11, 31, 0, 0, 0));
    const result = getNextSolstice(lateDecember);

    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */
/* getNextEquinox                                                             */
/* -------------------------------------------------------------------------- */

describe("getNextEquinox", () => {
  it("returns the March equinox when `from` is mid-winter", () => {
    const result = getNextEquinox(JANUARY_15_2024);

    expect(minutesApart(result, MARCH_EQUINOX_2024)).toBeLessThan(10);
  });

  it("returns the September equinox when `from` is mid-summer", () => {
    const result = getNextEquinox(JULY_15_2024);

    expect(minutesApart(result, SEPTEMBER_EQUINOX_2024)).toBeLessThan(10);
  });

  it("returns an equinox strictly at or after `from`", () => {
    const result = getNextEquinox(JANUARY_15_2024);

    expect(result.getTime()).toBeGreaterThanOrEqual(
      JANUARY_15_2024.getTime(),
    );
  });

  it("defaults to the current time when no date is given", () => {
    const before = new Date();
    const result = getNextEquinox();
    const after = new Date();

    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.getTime()).toBeLessThanOrEqual(
      after.getTime() + 190 * 86_400_000,
    );
  });

  it("is deterministic — same input, same output", () => {
    const a = getNextEquinox(JANUARY_15_2024);
    const b = getNextEquinox(JANUARY_15_2024);

    expect(a.getTime()).toBe(b.getTime());
  });

  it("handles a year boundary correctly", () => {
    const lateSeptember = new Date(Date.UTC(2024, 8, 30, 0, 0, 0));
    const result = getNextEquinox(lateSeptember);

    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(2);
  });

  it("equinox declination is near zero", () => {
    const equinox = getNextEquinox(JANUARY_15_2024);
    const { lat } = getSubsolarPoint(equinox);

    expect(Math.abs(lat)).toBeLessThan(0.05);
  });

  it("solstice declination is near the obliquity", () => {
    const solstice = getNextSolstice(JANUARY_15_2024);
    const { lat } = getSubsolarPoint(solstice);

    expect(lat).toBeCloseTo(23.44, 1);
  });
});

/* -------------------------------------------------------------------------- */
/* findSunrise                                                                */
/* -------------------------------------------------------------------------- */

describe("findSunrise", () => {
  it("finds a sunrise in Tokyo on the summer solstice", () => {
    const result = findSunrise(
      35.6762,
      139.6503,
      JUNE_SOLSTICE_2024,
    );

    expect(result).not.toBeNull();

    const hours = result!.getTime() - JUNE_SOLSTICE_2024.getTime();
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThan(24 * 3600_000);
  });

  it("returns a time at or after `from`", () => {
    const result = findSunrise(
      51.5074,
      -0.1278,
      JANUARY_15_2024,
    );

    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThanOrEqual(
      JANUARY_15_2024.getTime(),
    );
  });

  it("returns null during polar night at the north pole", () => {
    const result = findSunrise(90, 0, JANUARY_15_2024);

    expect(result).toBeNull();
  });

  it("returns null during polar night at the south pole in June", () => {
    const result = findSunrise(-90, 0, JUNE_SOLSTICE_2024);

    expect(result).toBeNull();
  });

  it("finds a sunrise at the north pole during polar day transition", () => {
    const beforeEquinox = new Date(
      Date.UTC(2024, 2, 1, 0, 0, 0),
    );
    const result = findSunrise(90, 0, beforeEquinox);

    if (result !== null) {
      expect(result.getTime()).toBeGreaterThanOrEqual(
        beforeEquinox.getTime(),
      );
    }
  });

  it("does not throw for extreme latitudes", () => {
    const latitudes = [-90, -89, -66, -1, 0, 1, 66, 89, 90];

    for (const lat of latitudes) {
      expect(() =>
        findSunrise(lat, 0, JANUARY_15_2024),
      ).not.toThrow();
    }
  });

  it("is deterministic — same input, same output", () => {
    const a = findSunrise(35.6762, 139.6503, JUNE_SOLSTICE_2024);
    const b = findSunrise(35.6762, 139.6503, JUNE_SOLSTICE_2024);

    expect(a?.getTime()).toBe(b?.getTime());
  });

  it("longitude affects the instant by about 4 minutes per degree", () => {
    const east = findSunrise(0, 15, JANUARY_15_2024_START);
    const west = findSunrise(0, 0, JANUARY_15_2024_START);

    expect(east).not.toBeNull();
    expect(west).not.toBeNull();

    expect(east!.getTime()).toBeLessThan(west!.getTime());

    const gapMinutes =
      (west!.getTime() - east!.getTime()) / 60_000;
    expect(gapMinutes).toBeGreaterThan(50);
    expect(gapMinutes).toBeLessThan(70);
  });

  it("defaults to the current time when no date is given", () => {
    const before = new Date();
    const result = findSunrise(51.5074, -0.1278);
    const after = new Date();

    if (result !== null) {
      expect(result.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(result.getTime()).toBeLessThanOrEqual(
        after.getTime() + 4 * 24 * 3600_000,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* findSunset                                                                 */
/* -------------------------------------------------------------------------- */

describe("findSunset", () => {
  it("finds a sunset in Tokyo on the summer solstice", () => {
    const result = findSunset(
      35.6762,
      139.6503,
      JUNE_SOLSTICE_2024,
    );

    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThan(
      JUNE_SOLSTICE_2024.getTime(),
    );
  });

  it("returns a time at or after `from`", () => {
    const result = findSunset(
      51.5074,
      -0.1278,
      JANUARY_15_2024,
    );

    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThanOrEqual(
      JANUARY_15_2024.getTime(),
    );
  });

  it("returns null during polar day at the north pole in June", () => {
    const result = findSunset(90, 0, JUNE_SOLSTICE_2024);

    expect(result).toBeNull();
  });

  it("returns null during polar day at the south pole in December", () => {
    const result = findSunset(-90, 0, DECEMBER_SOLSTICE_2024);

    expect(result).toBeNull();
  });

  it("sunset follows sunrise on the same day at mid latitudes", () => {
    const sunrise = findSunrise(
      51.5074,
      -0.1278,
      JANUARY_15_2024_START,
    );
    const sunset = findSunset(
      51.5074,
      -0.1278,
      JANUARY_15_2024_START,
    );

    expect(sunrise).not.toBeNull();
    expect(sunset).not.toBeNull();
    expect(sunset!.getTime()).toBeGreaterThan(sunrise!.getTime());
  });

  it("is deterministic — same input, same output", () => {
    const a = findSunset(35.6762, 139.6503, JUNE_SOLSTICE_2024);
    const b = findSunset(35.6762, 139.6503, JUNE_SOLSTICE_2024);

    expect(a?.getTime()).toBe(b?.getTime());
  });

  it("does not throw for extreme latitudes", () => {
    const latitudes = [-90, -89, -66, -1, 0, 1, 66, 89, 90];

    for (const lat of latitudes) {
      expect(() =>
        findSunset(lat, 0, JUNE_SOLSTICE_2024),
      ).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* findSolarNoon                                                              */
/* -------------------------------------------------------------------------- */

describe("findSolarNoon", () => {
  it("returns a time at or after `from`", () => {
    const result = findSolarNoon(
      51.5074,
      -0.1278,
      JANUARY_15_2024,
    );

    expect(result.getTime()).toBeGreaterThanOrEqual(
      JANUARY_15_2024.getTime(),
    );
  });

  it("is at approximately the longitude-derived UTC hour", () => {
    const result = findSolarNoon(0, 0, JANUARY_15_2024);
    const hourUTC =
      result.getUTCHours() +
      result.getUTCMinutes() / 60 +
      result.getUTCSeconds() / 3600;

    expect(Math.abs(hourUTC - 12)).toBeLessThan(0.35);
  });

  it("moves earlier in UTC as longitude increases eastward", () => {
    const east = findSolarNoon(0, 15, JANUARY_15_2024);
    const eastHourUTC =
      east.getUTCHours() + east.getUTCMinutes() / 60;

    expect(Math.abs(eastHourUTC - 11)).toBeLessThan(0.4);
  });

  it("moves later in UTC as longitude decreases westward", () => {
    const west = findSolarNoon(0, -15, JANUARY_15_2024);
    const westHourUTC =
      west.getUTCHours() + west.getUTCMinutes() / 60;

    expect(Math.abs(westHourUTC - 13)).toBeLessThan(0.4);
  });

  it("elevation is maximal at the returned instant", () => {
    const noon = findSolarNoon(51.5074, -0.1278, JANUARY_15_2024);

    const elevationAtNoon = solarElevationAt(
      51.5074,
      -0.1278,
      noon,
    );
    const elevationBefore = solarElevationAt(
      51.5074,
      -0.1278,
      new Date(noon.getTime() - 15 * 60_000),
    );
    const elevationAfter = solarElevationAt(
      51.5074,
      -0.1278,
      new Date(noon.getTime() + 15 * 60_000),
    );

    expect(elevationAtNoon).toBeGreaterThan(elevationBefore);
    expect(elevationAtNoon).toBeGreaterThan(elevationAfter);
  });

  it("works during polar night (the sun still has a highest point)", () => {
    const result = findSolarNoon(90, 0, JANUARY_15_2024);

    expect(result.getTime()).toBeGreaterThanOrEqual(
      JANUARY_15_2024.getTime(),
    );
  });

  it("works during polar day", () => {
    const result = findSolarNoon(90, 0, JUNE_SOLSTICE_2024);

    expect(result.getTime()).toBeGreaterThanOrEqual(
      JUNE_SOLSTICE_2024.getTime(),
    );
  });

  it("is deterministic — same input, same output", () => {
    const a = findSolarNoon(51.5074, -0.1278, JANUARY_15_2024);
    const b = findSolarNoon(51.5074, -0.1278, JANUARY_15_2024);

    expect(a.getTime()).toBe(b.getTime());
  });

  it("defaults to the current time when no date is given", () => {
    const before = new Date();
    const result = findSolarNoon(51.5074, -0.1278);
    const after = new Date();

    expect(result.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(result.getTime()).toBeLessThanOrEqual(
      after.getTime() + 4 * 24 * 3600_000,
    );
  });

  it("does not throw for extreme latitudes", () => {
    const latitudes = [-90, -89, -66, -1, 0, 1, 66, 89, 90];

    for (const lat of latitudes) {
      expect(() =>
        findSolarNoon(lat, 0, JANUARY_15_2024),
      ).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-event consistency                                                    */
/* -------------------------------------------------------------------------- */

describe("cross-event consistency", () => {
  it("June solstice occurs before the September equinox in 2024", () => {
    const solstice = getNextSolstice(JANUARY_15_2024);
    const equinox = getNextEquinox(solstice);

    expect(solstice.getTime()).toBeLessThan(equinox.getTime());
  });

  it("solar noon is between sunrise and sunset on a mid-latitude day", () => {
    /*
     * Each function returns the *first* event at-or-after
     * `from`. To make the cross-event ordering meaningful,
     * verify that all three events land on the same UTC
     * calendar day as `from` before asserting order.
     *
     * London on Jan 15: sunrise ~08:03 UTC, noon ~12:07
     * UTC, sunset ~16:22 UTC — all clearly on the same
     * UTC day.
     */
    const from = JANUARY_15_2024_START;

    const sunrise = findSunrise(51.5074, -0.1278, from);
    const noon = findSolarNoon(51.5074, -0.1278, from);
    const sunset = findSunset(51.5074, -0.1278, from);

    expect(sunrise).not.toBeNull();
    expect(sunset).not.toBeNull();

    /*
     * Guard: if any event slid to a different UTC day, the
     * ordering assertion below is meaningless. Fail with a
     * diagnostic that names the event.
     */
    expect(sunrise!.getUTCDate()).toBe(from.getUTCDate());
    expect(noon.getUTCDate()).toBe(from.getUTCDate());
    expect(sunset!.getUTCDate()).toBe(from.getUTCDate());

    expect(noon.getTime()).toBeGreaterThan(sunrise!.getTime());
    expect(noon.getTime()).toBeLessThan(sunset!.getTime());
  });

  it("day length at the equator is roughly 12 hours year-round", () => {
    /*
     * Same anchoring requirement as the previous test —
     * only assert day length when both events are on the
     * same UTC calendar day.
     */
    const from = JANUARY_15_2024_START;

    const sunrise = findSunrise(0, 0, from);
    const sunset = findSunset(0, 0, from);

    expect(sunrise).not.toBeNull();
    expect(sunset).not.toBeNull();

    expect(sunrise!.getUTCDate()).toBe(from.getUTCDate());
    expect(sunset!.getUTCDate()).toBe(from.getUTCDate());

    const dayLengthHours =
      (sunset!.getTime() - sunrise!.getTime()) / 3600_000;

    /*
     * The -0.833° altitude for sunrise/sunset adds a few
     * minutes to the geometric 12-hour day. Accept
     * 11.9–12.3 hours.
     */
    expect(dayLengthHours).toBeGreaterThan(11.9);
    expect(dayLengthHours).toBeLessThan(12.3);
  });

  it("day length is longer in summer than in winter at 51°N", () => {
    const summerSunrise = findSunrise(
      51.5074,
      -0.1278,
      JULY_15_2024,
    );
    const summerSunset = findSunset(
      51.5074,
      -0.1278,
      JULY_15_2024,
    );
    const winterSunrise = findSunrise(
      51.5074,
      -0.1278,
      JANUARY_15_2024,
    );
    const winterSunset = findSunset(
      51.5074,
      -0.1278,
      JANUARY_15_2024,
    );

    expect(summerSunrise).not.toBeNull();
    expect(summerSunset).not.toBeNull();
    expect(winterSunrise).not.toBeNull();
    expect(winterSunset).not.toBeNull();

    const summerHours =
      (summerSunset!.getTime() - summerSunrise!.getTime()) /
      3600_000;
    const winterHours =
      (winterSunset!.getTime() - winterSunrise!.getTime()) /
      3600_000;

    expect(summerHours).toBeGreaterThan(winterHours + 6);
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("purity", () => {
  it("does not mutate the `from` Date", () => {
    const from = new Date(JANUARY_15_2024);
    const snapshot = from.getTime();

    getNextSolstice(from);
    getNextEquinox(from);
    findSunrise(51.5074, -0.1278, from);
    findSunset(51.5074, -0.1278, from);
    findSolarNoon(51.5074, -0.1278, from);

    expect(from.getTime()).toBe(snapshot);
  });

  it("returns fresh Date objects on every call", () => {
    const a = getNextSolstice(JANUARY_15_2024);
    const b = getNextSolstice(JANUARY_15_2024);

    expect(a).not.toBe(b);
    expect(a.getTime()).toBe(b.getTime());
  });
});