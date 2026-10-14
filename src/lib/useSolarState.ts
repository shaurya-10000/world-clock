"use client";

/**
 * Solar state for the globe.
 *
 * Reads the current camera orientation from R3F, computes the
 * subsolar point, and classifies the atmosphere of the visible
 * hemisphere.
 *
 * The heavy lifting lives in `computeSolarState`, a pure
 * function that takes a camera position, a globe rotation
 * quaternion, and a time, and returns a `SolarState`. It is
 * called from `SolarSampler` inside the R3F scene, throttled
 * to roughly 4 Hz.
 *
 * ## Frame invariant
 *
 * The sample directions in `SAMPLE_DIRECTIONS` are authored
 * in the camera's local frame with **`+Z` pointing toward the
 * camera** (i.e. toward the visible disc's center). Every
 * sample has a non-negative `z` component, meaning every
 * sample is on the near side of the sphere.
 *
 * `getCameraBasis` must therefore produce a `forward` vector
 * that points from the globe center toward the camera, not
 * away from it. An earlier version used
 * `normalize(-cameraPosition)`, which sampled the *far*
 * hemisphere and inverted the day/night classification.
 * Do not flip this back.
 *
 * ## Design notes
 *
 *   - Sampling uses nine directions across the visible disc
 *     rather than one. A single sample at the center
 *     produces visible state flapping when the sun sits near
 *     the horizon — the state changes rapidly at the
 *     terminator crossing. Nine samples average out that
 *     flicker.
 *   - Each sample is classified directly by solar elevation,
 *     not by routing through a "notional local hour." The
 *     direct classification is continuous and correct at
 *     high latitudes.
 *   - The returned `dominantAtmosphere` is the highest-
 *     scoring category across all samples. Ties are broken
 *     by the iteration order of `ATMOSPHERE_PRIORITY`.
 *     `averageSolarElevation` is the mean elevation across
 *     all samples, in degrees.
 *   - `subsolarScreenPosition` is a normalized `[0, 1]` pair
 *     representing where the sun projects onto the camera's
 *     view plane. `null` when the subsolar point is behind
 *     the globe from the current camera angle.
 */

import type { Atmosphere } from "@/lib/atmosphere";
import { latLngToDirection } from "@/lib/globe-geometry";
import {
  rotateByInverse,
  type QuaternionTuple,
  type Vec3,
} from "@/lib/quaternion";
import { getSubsolarPoint } from "@/lib/solar";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SolarState {
  /**
   * The atmosphere that dominates the visible hemisphere.
   * Weighted by how much of the disc each sample covers and
   * how strongly it reads as its category.
   */
  readonly dominantAtmosphere: Atmosphere;

  /**
   * Mean solar elevation across all samples, in degrees.
   * `+90` means the subsolar point is dead center on screen.
   * `-90` means the antisolar point is dead center.
   */
  readonly averageSolarElevation: number;

  /**
   * Normalized screen position of the subsolar point, in
   * `[0, 1]` coordinates. `null` when the sun is on the far
   * side of the globe.
   */
  readonly subsolarScreenPosition: {
    readonly x: number;
    readonly y: number;
  } | null;

  /**
   * Fraction of the visible disc that is in daylight, `[0, 1]`.
   * `1` means the entire visible face is lit; `0` means the
   * entire visible face is dark.
   */
  readonly daylightFraction: number;
}

export interface SolarInput {
  /** Camera position in world space. */
  readonly cameraPosition: Vec3;

  /** The globe group's quaternion, in `[x, y, z, w]` order. */
  readonly globeQuaternion: QuaternionTuple;

  /** The moment to evaluate. Defaults to `new Date()`. */
  readonly date?: Date;
}

/* -------------------------------------------------------------------------- */
/* Classification thresholds                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Upper bound of the twilight band, in degrees of solar
 * elevation.
 *
 * Below this threshold, a sample is either dawn or dusk.
 * Above it, the sample is day. `+6°` is the standard civil
 * twilight upper limit — the sun is "up" enough that colors
 * have shifted away from the horizon glow.
 *
 * Not to be confused with `NIGHT_ELEVATION_THRESHOLD` below:
 * the two are independent and their absolute values happen
 * to match only because both conventions use `6°` as the
 * civil-twilight boundary.
 */
const DAY_ELEVATION_THRESHOLD = 6;

/**
 * Lower bound of the twilight band, in degrees of solar
 * elevation.
 *
 * Below this threshold (more negative), a sample is night.
 * Above it (closer to zero), the sample is twilight. `-6°`
 * is the standard civil-twilight limit — past this, even the
 * horizon glow is gone.
 */
const NIGHT_ELEVATION_THRESHOLD = -6;

/* -------------------------------------------------------------------------- */
/* Tie-break priority                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Iteration order used by `pickDominant`. On an exact tie in
 * weighted score, the earlier atmosphere wins. The order is
 * sorted so the more "active" classification comes first — if
 * a scene is torn evenly between dawn and night, we would
 * rather the UI reflect the transition than the darkness.
 *
 * **Must match `ATMOSPHERE_PRIORITY` in `globeAtmosphere.ts`.**
 * The two modules classify different questions (visible
 * hemisphere vs. sampled disc center) but produce the same
 * `Atmosphere` output, and the tie-break order must agree so
 * that a scene torn evenly between two adjacent states
 * reports the same winner from both classifiers.
 */
const ATMOSPHERE_PRIORITY: readonly Atmosphere[] = [
  "dawn",
  "day",
  "dusk",
  "night",
];

/* -------------------------------------------------------------------------- */
/* Sample directions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The local directions sampled across the visible disc.
 *
 * **Frame convention: `+Z` points toward the camera.**
 *
 * The grid is defined in the camera's frame — `+Z` is the
 * visible center of the disc, `X` and `Y` span the rest. It
 * is transformed into world space by the camera basis (built
 * by `getCameraBasis`), then into the globe's geography frame
 * by the inverse of the globe group's quaternion.
 *
 * Every `z` component is non-negative, meaning every sample
 * is on the near side of the sphere.
 */
const SAMPLE_DIRECTIONS: readonly {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly weight: number;
}[] = [
  /* Center. */
  { x: 0, y: 0, z: 1, weight: 2.0 },

  /* Cardinal points. */
  { x: 0.5, y: 0, z: 0.866, weight: 1.0 },
  { x: -0.5, y: 0, z: 0.866, weight: 1.0 },
  { x: 0, y: 0.5, z: 0.866, weight: 1.0 },
  { x: 0, y: -0.5, z: 0.866, weight: 1.0 },

  /* Diagonals. */
  { x: 0.35, y: 0.35, z: 0.87, weight: 0.75 },
  { x: -0.35, y: 0.35, z: 0.87, weight: 0.75 },
  { x: 0.35, y: -0.35, z: 0.87, weight: 0.75 },
  { x: -0.35, y: -0.35, z: 0.87, weight: 0.75 },
];

/* -------------------------------------------------------------------------- */
/* Vector helpers                                                             */
/* -------------------------------------------------------------------------- */

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/*
 * `applyQuaternion` was previously a local copy of the
 * Hamilton-product formula also carried by
 * `lib/quaternion.ts` (as `rotateByInverse`) and by
 * `globeAtmosphere.ts`. Three copies of the same 20-line
 * expression is a maintenance hazard: the correct form is
 * non-obvious, and a fix applied to one copy is easy to
 * forget in the others.
 *
 * The sample directions here need the same inverse rotation
 * the other two callers use, so this module now delegates to
 * `rotateByInverse` from `lib/quaternion.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Camera basis                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build an orthonormal basis for the camera's view.
 *
 * **`forward` points from the globe center toward the
 * camera** — i.e. it is the world direction of the visible
 * disc's center. This is the frame `SAMPLE_DIRECTIONS` is
 * authored in; every sample has non-negative `z`, which
 * places it on the near side of the sphere as seen from the
 * camera.
 *
 * Do not flip `forward` to point away from the camera. That
 * inverts the entire day/night classification.
 */
function getCameraBasis(cameraPosition: Vec3): {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
} {
  const forward = normalize({
    x: cameraPosition.x,
    y: cameraPosition.y,
    z: cameraPosition.z,
  });

  /*
   * The camera's up is always world +Y, since we do not roll
   * the camera and OrbitControls keeps it level. If that
   * ever changes, derive up from the camera's quaternion
   * instead.
   */
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };

  /*
   * `cross(worldUp, forward)` produces a right-handed basis
   * where `right` points screen-right when the camera is on
   * the equator looking at the origin.
   *
   * Do not swap the operands: `cross(forward, worldUp)`
   * produces the same axis with the opposite sign, which
   * mirrors the view.
   */
  const right = normalize(cross(worldUp, forward));

  /*
   * The cross product degenerates when the camera sits on
   * the Y axis (looking straight down at a pole). Fall back
   * to world +X, which is what a camera on the equator
   * would see as screen-right.
   */
  const safeRight: Vec3 =
    right.x === 0 && right.y === 0 && right.z === 0
      ? { x: 1, y: 0, z: 0 }
      : right;

  const up = normalize(cross(forward, safeRight));

  return { forward, right: safeRight, up };
}

/* -------------------------------------------------------------------------- */
/* Sampling                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The nine sample directions, expressed in world space and
 * then transformed into globe-local space.
 */
function buildWorldSamples(
  cameraPosition: Vec3,
  globeQuaternion: QuaternionTuple,
): { direction: Vec3; weight: number }[] {
  const { forward, right, up } = getCameraBasis(cameraPosition);

  return SAMPLE_DIRECTIONS.map((sample) => {
    const world: Vec3 = {
      x:
        forward.x * sample.z +
        right.x * sample.x +
        up.x * sample.y,
      y:
        forward.y * sample.z +
        right.y * sample.x +
        up.y * sample.y,
      z:
        forward.z * sample.z +
        right.z * sample.x +
        up.z * sample.y,
    };

    /*
     * `rotateByInverse` applies the inverse of the globe
     * quaternion — the transformation that takes a world
     * direction into the geography frame, where
     * `latLngToDirection` and the sample directions live.
     */
    const local = rotateByInverse(
      normalize(world),
      globeQuaternion,
    );

    return { direction: local, weight: sample.weight };
  });
}

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Classify a single sample by its solar elevation and its
 * east-west position relative to the sun.
 *
 * Direct elevation classification, not "notional local hour."
 * Hour-based reasoning breaks at high latitudes.
 *
 *   elevation ≥ +6°           → day
 *   -6° ≤ elevation < +6°     → dawn or dusk
 *   elevation < -6°           → night
 *
 * Dawn vs. dusk is decided by the sample's position east or
 * west of the subsolar point. The cross product of the sun
 * direction and world +Y defines an east-west axis; a sample
 * on the east side is experiencing dawn, on the west side
 * dusk.
 */
function classifyElevation(
  elevation: number,
  sampleDirection: Vec3,
  sunDirection: Vec3,
): Atmosphere {
  if (elevation >= DAY_ELEVATION_THRESHOLD) {
    return "day";
  }

  if (elevation < NIGHT_ELEVATION_THRESHOLD) {
    return "night";
  }

  const eastWest = cross(sunDirection, { x: 0, y: 1, z: 0 });

  const isEast = dot(sampleDirection, eastWest) > 0;

  return isEast ? "dawn" : "dusk";
}

/* -------------------------------------------------------------------------- */
/* Main computation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Compute the solar state for a moment and a camera pose.
 *
 * Pure function. No React, no THREE, no side effects.
 */
export function computeSolarState(input: SolarInput): SolarState {
  const date = input.date ?? new Date();

  const subsolar = getSubsolarPoint(date);

  const sunDirection = latLngToDirection(
    subsolar.lat,
    subsolar.lng,
  );

  const samples = buildWorldSamples(
    input.cameraPosition,
    input.globeQuaternion,
  );

  const scores: Record<Atmosphere, number> = {
    dawn: 0,
    day: 0,
    dusk: 0,
    night: 0,
  };

  let weightedElevationSum = 0;
  let weightSum = 0;
  let daylightWeight = 0;

  for (const sample of samples) {
    const sunDot = dot(sample.direction, sunDirection);

    /*
     * The angle between the sample direction and the sun
     * direction. For a point on a sphere, the elevation of
     * the sun above the local horizon is
     * `90° - angleBetween`.
     */
    const angleBetween =
      Math.acos(Math.max(-1, Math.min(1, sunDot))) *
      (180 / Math.PI);

    const elevation = 90 - angleBetween;

    weightedElevationSum += sample.weight * elevation;
    weightSum += sample.weight;

    if (elevation > 0) {
      daylightWeight += sample.weight;
    }

    const atmosphere = classifyElevation(
      elevation,
      sample.direction,
      sunDirection,
    );

    scores[atmosphere] += sample.weight;
  }

  const averageSolarElevation =
    weightSum > 0 ? weightedElevationSum / weightSum : 0;

  const dominantAtmosphere = pickDominant(scores);

  const subsolarScreenPosition = projectToScreen(
    subsolar,
    input.cameraPosition,
    input.globeQuaternion,
  );

  return {
    dominantAtmosphere,
    averageSolarElevation,
    subsolarScreenPosition,
    daylightFraction:
      weightSum > 0 ? daylightWeight / weightSum : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pick the highest-scoring atmosphere.
 *
 * Ties are broken by `ATMOSPHERE_PRIORITY`, iterated in
 * order — so if `dawn` and `night` both score 3.0, `dawn`
 * wins.
 */
function pickDominant(
  scores: Record<Atmosphere, number>,
): Atmosphere {
  let best: Atmosphere = ATMOSPHERE_PRIORITY[0] ?? "night";
  let bestScore = -Infinity;

  for (const key of ATMOSPHERE_PRIORITY) {
    if (scores[key] > bestScore) {
      bestScore = scores[key];
      best = key;
    }
  }

  return best;
}

/**
 * Project the subsolar point to screen coordinates.
 *
 * Returns `null` when the subsolar direction faces away from
 * the camera (the sun is behind the globe).
 */
function projectToScreen(
  subsolar: { lat: number; lng: number },
  cameraPosition: Vec3,
  globeQuaternion: QuaternionTuple,
): { x: number; y: number } | null {
  const subsolarLocal = latLngToDirection(
    subsolar.lat,
    subsolar.lng,
  );

  /*
   * `rotateByInverse` applies the inverse of the globe
   * quaternion — which is the transformation from the
   * geography frame (where the subsolar direction lives)
   * into world space. Despite the name, this is exactly
   * what we want here: the subsolar direction is in the
   * geography frame, and we need it in world space to
   * project it against the camera basis.
   *
   * (The name `rotateByInverse` refers to the fact that
   * the function's internal arithmetic is `q⁻¹ · v · q`,
   * which is the inverse of `q · v · q*`. Applied to a
   * vector already in `q`'s local frame, it produces a
   * world-space result.)
   */
  const subsolarWorld = rotateByInverse(
    subsolarLocal,
    globeQuaternion,
  );

  const { forward, right, up } = getCameraBasis(cameraPosition);

  const facing = dot(subsolarWorld, forward);

  if (facing <= 0) {
    return null;
  }

  const x = dot(subsolarWorld, right);
  const y = dot(subsolarWorld, up);

  return {
    x: 0.5 + x * 0.5,
    y: 0.5 - y * 0.5,
  };
}

/* -------------------------------------------------------------------------- */
/* React hook                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The default solar state used before the sampler has
 * produced a first value.
 *
 * Frozen so a consumer that mutates the returned object
 * (via a cast or a JS caller) cannot corrupt every
 * subsequent null-state read. The fields match the
 * "everything is dark and unknown" starting position.
 */
const DEFAULT_SOLAR_STATE: SolarState = Object.freeze({
  dominantAtmosphere: "night" as const,
  averageSolarElevation: 0,
  subsolarScreenPosition: null,
  daylightFraction: 0,
});

/**
 * A React hook that consumes solar state pushed by
 * `SolarSampler`.
 *
 * The hook itself does nothing — it exists so that consumers
 * can be written as if they owned the state. The state is
 * actually owned by whichever component mounts both the
 * Canvas and the background layer (`Globe.tsx`).
 */
export function useSolarState(
  state: SolarState | null,
): SolarState {
  return state ?? DEFAULT_SOLAR_STATE;
}