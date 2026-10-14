/**
 * Globe atmosphere sampler.
 *
 * Answers one question: "If the camera is looking at the
 * globe from this position, with the globe rotated to this
 * orientation, what atmosphere should the background be?"
 *
 * ## Why this isn't solar elevation
 *
 * `computeSolarState` (in `useSolarState.ts`) classifies each
 * sample by solar elevation — the physically correct answer
 * to "how much sunlight reaches this point on the sphere."
 * That's the right tool for the terminator ring and for
 * anything that needs to know where day literally ends.
 *
 * The background is a different question. When the globe
 * fills the screen, the user isn't reading the terminator;
 * they're reading the *mood* of the view. At 7 PM in Moscow,
 * the camera might be pointed at the mid-Atlantic where the
 * sun is technically still up — but every visible city is in
 * evening or night. A solar-elevation classifier reports
 * "day" for the whole screen; the user sees a dark globe
 * against a light background and calls it broken.
 *
 * This module classifies by **local hour at the nearest
 * catalogued city** for each sample. That matches the visual
 * language every other surface in the app already uses — the
 * city rows, the dropdown rows, the analog clock's sun/moon
 * — all of which pick their atmosphere from
 * `getAtmosphere(hour)`.
 *
 * ## Local hour source
 *
 * Local hour is computed by `getDecimalHour` from
 * `lib/time`, which uses the catalogued IANA time zone
 * identifier and the same cached `Intl.DateTimeFormat`
 * instances as every other surface. That means the
 * atmosphere over Beijing reflects China's single-timezone
 * policy (UTC+8), the atmosphere over Delhi reflects India's
 * half-hour offset (UTC+5:30), and DST is respected
 * wherever it applies.
 *
 * ## Aggregation
 *
 * Nine sample directions, weighted by their distance from
 * the disc center. Each sample becomes a vote for one of
 * four atmospheres. The winner becomes the background. Ties
 * are broken by a fixed priority order so the result is
 * deterministic.
 *
 * ## Purity
 *
 * The module is a set of pure functions operating on plain
 * numbers. No `three`, no `react`, no `Ref`. It can be unit
 * tested without mounting a scene, and imported from
 * analysis code.
 */

import {
  getAtmosphere,
  type Atmosphere,
} from "@/lib/atmosphere";
import { latLngToDirection } from "@/lib/globe-geometry";
import {
  WORLD_LOCATIONS,
  type WorldLocation,
} from "@/lib/locations";
import {
  rotateByInverse,
  type QuaternionTuple,
  type Vec3,
} from "@/lib/quaternion";
import { getDecimalHour } from "@/lib/time";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type { QuaternionTuple, Vec3 };

/* -------------------------------------------------------------------------- */
/* Sample directions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Nine directions across the visible disc, in the camera's
 * local frame.
 *
 * `+Z` is always the visible center of the disc. `X` and `Y`
 * span the rest of the frame. The directions are unit-length.
 *
 * Weights bias the vote toward the disc center. The grid is
 * deliberately sparse: nine samples is dense enough to catch
 * a hemisphere-spanning shift (e.g. Europe dusk vs. Africa
 * night) without the cost of a real grid.
 */
const SAMPLE_DIRECTIONS: readonly {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly weight: number;
}[] = [
  /* Center of the disc. */
  { x: 0, y: 0, z: 1, weight: 3.0 },

  /* Cardinal points at 50% of the disc radius. */
  { x: 0.5, y: 0, z: 0.866, weight: 1.2 },
  { x: -0.5, y: 0, z: 0.866, weight: 1.2 },
  { x: 0, y: 0.5, z: 0.866, weight: 1.2 },
  { x: 0, y: -0.5, z: 0.866, weight: 1.2 },

  /* Diagonals at 35% of the disc radius. */
  { x: 0.35, y: 0.35, z: 0.87, weight: 1.0 },
  { x: -0.35, y: 0.35, z: 0.87, weight: 1.0 },
  { x: 0.35, y: -0.35, z: 0.87, weight: 1.0 },
  { x: -0.35, y: -0.35, z: 0.87, weight: 1.0 },
];

/**
 * The total weight of every sample in `SAMPLE_DIRECTIONS`.
 *
 * Exposed so a caller (or a test) can express a raw score as
 * a fraction of the total vote. The value is
 * `3.0 + 1.2 × 4 + 1.0 × 4 = 11.8`. It is computed here
 * rather than at call sites so a change to the sample grid
 * cannot leave the sum out of sync.
 */
export const TOTAL_SAMPLE_WEIGHT = SAMPLE_DIRECTIONS.reduce(
  (sum, sample) => sum + sample.weight,
  0,
);

/**
 * Priority order for tie-breaking. If two atmospheres get
 * the same weighted score, the earlier entry wins.
 *
 * The order is sorted so the *transitional* classifications
 * come first — `dawn` outranks `day`, `day` outranks `dusk`,
 * and `dusk` outranks `night`. When a scene is torn between
 * two adjacent states, the earlier one in the day's cycle
 * wins.
 *
 * **Must match `ATMOSPHERE_PRIORITY` in `useSolarState.ts`.**
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
/* Vector helpers                                                             */
/* -------------------------------------------------------------------------- */

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return { x: v.x / len, y: v.y / len, z: v.z / len };
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
 * `lib/useSolarState.ts`. Four copies of the same 20-line
 * expression is a maintenance hazard: the correct form is
 * non-obvious, and a fix applied to one copy is easy to
 * forget in the others.
 *
 * The sample directions here need the same inverse rotation
 * the other two callers use, so this module now delegates to
 * `rotateByInverse` from `lib/quaternion.ts` rather than
 * carrying its own copy.
 */

/* -------------------------------------------------------------------------- */
/* Camera basis                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build the camera's local frame.
 *
 * `forward` points from the globe center toward the camera —
 * i.e. it is the world direction of the visible disc's
 * center. Do not flip this: every consumer treats it as
 * "toward the viewer", which is what makes `+forward`
 * visible and `-forward` hidden.
 *
 * `right` and `up` span the view plane and are derived so
 * the frame is right-handed.
 */
function getCameraBasis(cameraPosition: Vec3): {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
} {
  const forward = normalize(cameraPosition);

  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };

  const right = normalize(cross(worldUp, forward));

  /*
   * `cross(worldUp, forward)` degenerates when the camera
   * sits directly on the Y axis. Fall back to world +X,
   * which is what a camera on the equator would see as
   * screen-right.
   */
  const safeRight: Vec3 =
    right.x === 0 && right.y === 0 && right.z === 0
      ? { x: 1, y: 0, z: 0 }
      : right;

  const up = normalize(cross(forward, safeRight));

  return { forward, right: safeRight, up };
}

/* -------------------------------------------------------------------------- */
/* Nearest city lookup                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A precomputed city entry: its direction on the unit sphere
 * and a reference to its original location object.
 */
interface CityEntry {
  readonly location: WorldLocation;
  readonly direction: Vec3;
}

/**
 * The catalog, prepared once at module load.
 *
 * Each city's direction is computed from its lat/lng via
 * `latLngToDirection`. Allocating this once means the
 * per-frame lookup is a linear scan over ~180 direction
 * vectors, which is cheap enough to run for nine samples per
 * frame at 4 Hz without measurable cost.
 *
 * This index is built from `WORLD_LOCATIONS`, which is a
 * static array. If the catalog ever becomes dynamic (e.g.
 * user-added locations), this module must be reworked to
 * rebuild the index on change.
 */
const CITY_INDEX: readonly CityEntry[] = WORLD_LOCATIONS.map(
  (location) => ({
    location,
    direction: latLngToDirection(
      location.latitude,
      location.longitude,
    ),
  }),
);

/**
 * Find the catalogued city nearest to a given unit direction.
 *
 * Returns `null` if the catalog is empty, which is
 * impossible in practice but keeps the function total.
 *
 * ## Tie-breaking
 *
 * The comparison is strict `>`, not `>=`. If two cities are
 * exactly equidistant from the sample direction, the one
 * that appears *first* in `CITY_INDEX` wins. This is a
 * stable tie-break (the catalog order is fixed at module
 * load).
 */
function nearestCity(direction: Vec3): CityEntry | null {
  let best: CityEntry | null = null;
  let bestDot = -Infinity;

  for (const entry of CITY_INDEX) {
    const dot =
      direction.x * entry.direction.x +
      direction.y * entry.direction.y +
      direction.z * entry.direction.z;

    if (dot > bestDot) {
      bestDot = dot;
      best = entry;
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* Local hour                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Local decimal hour at a catalogued city, for a given UTC
 * instant.
 *
 * Delegates to `getDecimalHour` in `lib/time`, which
 * resolves the city's IANA time zone identifier against the
 * shared `Intl.DateTimeFormat` cache. The `date` argument is
 * threaded through from the sampler so every sample in a
 * single invocation shares one instant.
 */
function localHourAt(
  location: WorldLocation,
  date: Date,
): number {
  return getDecimalHour(date, location.timezone);
}

/* -------------------------------------------------------------------------- */
/* Sampling core                                                              */
/* -------------------------------------------------------------------------- */

export interface SampleGlobeAtmosphereInput {
  /** The camera's world position. */
  readonly cameraPosition: Vec3;

  /** The globe group's world quaternion, `[x, y, z, w]`. */
  readonly globeQuaternion: QuaternionTuple;

  /**
   * The instant to evaluate. Every sample in this call is
   * classified at this exact moment, so the votes are
   * consistent.
   */
  readonly date: Date;
}

/**
 * A single vote cast during a sample.
 *
 * Exposed through `sampleGlobeAtmosphereVerbose` for
 * debugging and testing.
 */
export interface SampleVote {
  readonly atmosphere: Atmosphere;
  readonly weight: number;
  readonly cityId: string;
  readonly localHour: number;
}

/**
 * Run the sample loop and return every vote cast.
 *
 * This is the single implementation of the sampling
 * algorithm; `sampleGlobeAtmosphere` and
 * `sampleGlobeAtmosphereVerbose` are both thin wrappers over
 * it. Keeping the loop in one place guarantees they cannot
 * drift apart.
 */
function sampleVotes(
  input: SampleGlobeAtmosphereInput,
): readonly SampleVote[] {
  const { cameraPosition, globeQuaternion, date } = input;

  const { forward, right, up } = getCameraBasis(cameraPosition);

  /*
   * The globe quaternion takes a world-space direction into
   * the globe's geography frame. We need the inverse —
   * `rotateByInverse` applies `q⁻¹` to a vector, which is
   * exactly the transformation this sampler needs.
   */
  const votes: SampleVote[] = [];

  for (const sample of SAMPLE_DIRECTIONS) {
    /*
     * Skip samples pointing away from the visible hemisphere.
     * `sample.z <= 0` means the sample is on the far side of
     * the sphere from the camera.
     */
    if (sample.z <= 0) continue;

    /*
     * Build the sample direction in world space by combining
     * the camera basis vectors. `forward` is the disc center,
     * `right` and `up` shift to other points on the disc.
     */
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
     * Move from world space into the globe's geography frame.
     * The sample direction is now a point on the sphere's
     * surface expressed in the same frame as every city's
     * `latLngToDirection`.
     */
    const geography = rotateByInverse(
      normalize(world),
      globeQuaternion,
    );

    const nearest = nearestCity(geography);
    if (!nearest) continue;

    const localHour = localHourAt(nearest.location, date);

    votes.push({
      atmosphere: getAtmosphere(localHour),
      weight: sample.weight,
      cityId: nearest.location.id,
      localHour,
    });
  }

  return votes;
}

/* -------------------------------------------------------------------------- */
/* Main sampler                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Sample the visible disc and return the dominant atmosphere.
 *
 * The returned value is what the background should fade to.
 * It's stable across small camera rotations (the sampling
 * grid has to shift enough to flip a bucket), and it never
 * returns all-night for a hemisphere with cities on it,
 * which is the failure mode a solar-elevation classifier
 * exhibits.
 */
export function sampleGlobeAtmosphere(
  input: SampleGlobeAtmosphereInput,
): Atmosphere {
  const votes = sampleVotes(input);

  const scores: Record<Atmosphere, number> = {
    dawn: 0,
    day: 0,
    dusk: 0,
    night: 0,
  };

  for (const vote of votes) {
    scores[vote.atmosphere] += vote.weight;
  }

  return pickDominant(scores);
}

/**
 * Pick the highest-scoring atmosphere.
 *
 * Ties are broken by `ATMOSPHERE_PRIORITY`, iterated in
 * order — so a tie between `dawn` and `night` resolves to
 * `dawn`.
 */
function pickDominant(
  scores: Record<Atmosphere, number>,
): Atmosphere {
  let best: Atmosphere = "night";
  let bestScore = -Infinity;

  for (const key of ATMOSPHERE_PRIORITY) {
    if (scores[key] > bestScore) {
      bestScore = scores[key];
      best = key;
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* Debug helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Run a sample and return every vote cast, not just the
 * winner.
 *
 * Useful in tests and when debugging why the background
 * picked a particular atmosphere.
 */
export function sampleGlobeAtmosphereVerbose(
  input: SampleGlobeAtmosphereInput,
): readonly SampleVote[] {
  return sampleVotes(input);
}