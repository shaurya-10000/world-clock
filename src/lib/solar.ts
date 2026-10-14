/**
 * Solar geometry — subsolar point and solar elevation.
 *
 * Algorithm: Meeus, "Astronomical Algorithms" (2nd ed.),
 * chapter 25 — low-precision solar coordinates. Accurate to
 * roughly 0.01° for the years 1950–2050, which is far beyond
 * what a UI needs.
 *
 * Conventions:
 *   - All angles in radians internally.
 *   - Public lat/lng in degrees.
 *   - Longitude is positive east, negative west (-180..180).
 *   - Latitude is positive north, negative south (-90..90).
 *   - The subsolar point is the location on Earth where the
 *     sun is currently directly overhead (solar zenith = 0°).
 *
 * Frame: geographic coordinates are converted to world-space
 * vectors by `latLngToDirection` in `globe-geometry`. That
 * function is the single source of truth for the frame
 * convention (+Y north, +X = 90°E, +Z = prime meridian); this
 * module must not reimplement it, or the sun direction will
 * silently drift out of sync with marker/terminator geometry
 * if the frame ever changes.
 */

import { latLngToDirection } from "@/lib/globe-geometry";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Julian Date at the Unix epoch. */
const UNIX_EPOCH_JD = 2440587.5;

/** Julian Date of J2000.0. */
const J2000_JD = 2451545.0;

/** Milliseconds in one day. */
const MS_PER_DAY = 86_400_000;

/** Mean solar longitude at J2000.0, degrees. */
const MEAN_LONGITUDE_AT_J2000 = 280.46;

/** Mean solar longitude rate, degrees per day. */
const MEAN_LONGITUDE_RATE = 0.9856474;

/** Mean anomaly at J2000.0, degrees. */
const MEAN_ANOMALY_AT_J2000 = 357.528;

/** Mean anomaly rate, degrees per day. */
const MEAN_ANOMALY_RATE = 0.9856003;

/** Obliquity of the ecliptic at J2000.0, degrees. */
const OBLIQUITY_AT_J2000 = 23.439;

/** Obliquity rate, degrees per day. */
const OBLIQUITY_RATE = 0.0000004;

/** Greenwich Mean Sidereal Time at J2000.0, hours. */
const GMST_AT_J2000 = 18.697374558;

/** Sidereal rate, hours per day. */
const GMST_RATE = 24.06570982441908;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SubsolarPoint {
  /** Latitude in degrees, [-90, 90]. */
  readonly lat: number;
  /** Longitude in degrees, [-180, 180]. */
  readonly lng: number;
}

/**
 * A normalized 3-vector in world space.
 *
 * Declared here rather than imported from `globe-geometry`,
 * which returns an inline `{ x, y, z }` type. Structurally
 * identical, so the value returned by `latLngToDirection`
 * assigns without a cast.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Standard astronomical twilight bands plus daytime. */
export type SolarPhase =
  | "night"
  | "astronomical-twilight"
  | "nautical-twilight"
  | "civil-twilight"
  | "golden-hour"
  | "day";

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

/** Convert a JS Date to a Julian Date. */
function toJulianDate(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/** Wrap an angle in degrees into [-180, 180). */
function wrapLongitude(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/* -------------------------------------------------------------------------- */
/* Subsolar point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Compute the subsolar point — the lat/lng where the sun is
 * currently directly overhead.
 *
 * The returned longitude moves westward at roughly 15°/hour
 * (one full revolution per sidereal day). The latitude
 * oscillates within ±23.44° across the year, tracing the solar
 * declination curve.
 *
 * @param date The instant to evaluate. Defaults to `new Date()`.
 */
export function getSubsolarPoint(
  date: Date = new Date(),
): SubsolarPoint {
  const jd = toJulianDate(date);
  const n = jd - J2000_JD;

  const meanLongitude =
    MEAN_LONGITUDE_AT_J2000 + MEAN_LONGITUDE_RATE * n;

  const meanAnomaly =
    (MEAN_ANOMALY_AT_J2000 + MEAN_ANOMALY_RATE * n) * DEG;

  const eclipticLongitude =
    (meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)) *
    DEG;

  const obliquity =
    (OBLIQUITY_AT_J2000 - OBLIQUITY_RATE * n) * DEG;

  const declination =
    Math.asin(
      Math.sin(obliquity) * Math.sin(eclipticLongitude),
    ) * RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );

  const gmst =
    (((GMST_AT_J2000 + GMST_RATE * n) % 24) + 24) % 24;

  const subsolarLongitude = wrapLongitude(
    rightAscension * RAD - gmst * 15,
  );

  return {
    lat: declination,
    lng: subsolarLongitude,
  };
}

/* -------------------------------------------------------------------------- */
/* Lat/lng → world vector                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Geographic lat/lng to a unit vector in the globe's world
 * space.
 *
 * Thin wrapper around `latLngToDirection` from
 * `globe-geometry` — kept here so existing call sites in this
 * module and any external consumers that imported
 * `latLngToUnitVector` from `solar` keep working. New code
 * should import `latLngToDirection` directly.
 */
export function latLngToUnitVector(
  lat: number,
  lng: number,
): Vec3 {
  return latLngToDirection(lat, lng);
}

/* -------------------------------------------------------------------------- */
/* Solar elevation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compute the solar elevation at a location and instant.
 *
 * Returns the angle between the local horizon plane and the
 * direction of the sun, in degrees:
 *
 *   +90°  sun directly overhead
 *     0°  sun at the horizon
 *   -18°  astronomical twilight ends
 *   -90°  sun directly beneath
 *
 * Pure geometric calculation with no atmospheric refraction
 * correction — more than sufficient for a UI that classifies
 * atmosphere into Dawn/Day/Dusk/Night.
 */
export function getSolarElevation(
  lat: number,
  lng: number,
  date: Date = new Date(),
): number {
  const subsolar = getSubsolarPoint(date);

  const a = latLngToDirection(lat, lng);
  const b = latLngToDirection(subsolar.lat, subsolar.lng);

  const dot = a.x * b.x + a.y * b.y + a.z * b.z;

  /*
   * Clamp before acos. Floating-point drift at the poles can
   * push |dot| a hair past 1 and produce NaN.
   */
  const clamped = Math.max(-1, Math.min(1, dot));

  return 90 - Math.acos(clamped) * RAD;
}

/* -------------------------------------------------------------------------- */
/* Direction vector                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Unit vector (in globe world space) pointing from the center
 * of the Earth toward the sun.
 *
 * Used by the terminator shader as its uniform, and by the
 * atmosphere layer to project the sun onto screen space.
 */
export function getSunDirection(
  date: Date = new Date(),
): Vec3 {
  const subsolar = getSubsolarPoint(date);

  return latLngToDirection(subsolar.lat, subsolar.lng);
}

/* -------------------------------------------------------------------------- */
/* Descriptive helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Classify a solar elevation into a standard astronomical
 * twilight band. Useful for accessibility labels and for
 * debugging the atmosphere feature.
 */
export function describeSolarElevation(
  elevation: number,
): SolarPhase {
  if (elevation >= 15) return "day";
  if (elevation >= 0) return "golden-hour";
  if (elevation >= -6) return "civil-twilight";
  if (elevation >= -12) return "nautical-twilight";
  if (elevation >= -18) return "astronomical-twilight";
  return "night";
}