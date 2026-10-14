/**
 * Globe coordinate math.
 *
 * Converts geographic coordinates into the world-space
 * convention used by three-globe and the globe components.
 *
 * The globe's world space is aligned with Earth's geographic
 * axes but oriented differently from the more common
 * "Y-up, Z-north" convention:
 *
 *   +Y axis → geographic north pole
 *   +X axis → the meridian of 90° east
 *   +Z axis → the meridian of 0° (prime meridian)
 *
 * This matches three-globe's internal layout. It is not the
 * natural frame for reading, but aligning with the library
 * means markers, the terminator shader, and the sun direction
 * all share one coordinate frame without per-consumer matrix
 * conversions.
 */

import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The radius of the rendered globe, in world units.
 *
 * three-globe internally works in a radius-100 space, scaled
 * down to a comfortable camera distance via `GLOBE_SCALE`.
 * Every position produced by this module is in post-scale
 * world units.
 */
export const GLOBE_RADIUS = 1.55;

/**
 * The scale factor applied to three-globe's internal
 * radius-100 coordinate system.
 *
 * Exposed because consumers that build geometry in
 * three-globe's native space — the terminator ring, the
 * country polygons — need the same factor to stay in the
 * post-scale frame.
 */
export const GLOBE_SCALE = GLOBE_RADIUS / 100;

/* -------------------------------------------------------------------------- */
/* Position                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Convert a geographic coordinate to a world-space position
 * on (or above) the globe surface.
 *
 * The spherical-to-cartesian conversion follows the
 * three-globe convention:
 *
 *   phi   = (90 − latitude)  in radians, the polar angle
 *   theta = (90 − longitude) in radians, the azimuthal angle
 *
 * The `90 − longitude` term (rather than `longitude`) is what
 * places the +Z axis at the prime meridian and the +X axis at
 * 90° east.
 *
 * @param latitude   Decimal degrees, `[-90, 90]`.
 * @param longitude  Decimal degrees, `[-180, 180]`.
 * @param altitude   Altitude above the surface as a fraction
 *                   of the globe radius. `0` places the point
 *                   exactly on the surface; `0.025` lifts it by
 *                   2.5% of the radius, which is the marker
 *                   default.
 */
export function latLngToPosition(
  latitude: number,
  longitude: number,
  altitude = 0,
): readonly [number, number, number] {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (90 - longitude) * (Math.PI / 180);
  const radius = 100 * (1 + altitude) * GLOBE_SCALE;

  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ] as const;
}

/**
 * World-space position for a catalogued location.
 *
 * A thin wrapper around `latLngToPosition` that fills in the
 * marker's default altitude. Kept as a distinct function so
 * call sites read as "position of this location" rather than
 * "position of these two numbers."
 */
export function locationToPosition(
  location: WorldLocation,
  altitude = 0.025,
): readonly [number, number, number] {
  return latLngToPosition(
    location.latitude,
    location.longitude,
    altitude,
  );
}

/* -------------------------------------------------------------------------- */
/* Direction                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Unit vector pointing from the globe center toward a
 * geographic coordinate.
 *
 * Used by `CameraTravel` to compute the target globe rotation,
 * and by `Terminator` and `EarthSphere` to compare marker or
 * surface directions against the sun direction.
 *
 * Returns a plain `{ x, y, z }` object rather than a
 * `THREE.Vector3`. That keeps this module free of a `three`
 * dependency, so tests and analysis code can import it
 * without pulling in the renderer.
 */
export function latLngToDirection(
  latitude: number,
  longitude: number,
): { x: number; y: number; z: number } {
  const [x, y, z] = latLngToPosition(latitude, longitude, 0);

  const length = Math.sqrt(x * x + y * y + z * z);

  /*
   * `length` is always `GLOBE_RADIUS` when `altitude` is `0`
   * — which is the only way this function calls
   * `latLngToPosition`. The division is defensive rather than
   * necessary: if a future refactor changed the altitude
   * argument, callers would still receive a unit vector.
   */
  return {
    x: x / length,
    y: y / length,
    z: z / length,
  };
}

/**
 * Unit vector for a catalogued location. Thin wrapper around
 * `latLngToDirection` for the same reason as
 * `locationToPosition`.
 */
export function locationToDirection(
  location: WorldLocation,
): { x: number; y: number; z: number } {
  return latLngToDirection(
    location.latitude,
    location.longitude,
  );
}