/**
 * Pure solar sampling logic.
 *
 * Extracted from `SolarSampler.tsx` so the throttling, camera-
 * movement detection, and state-equality check can be tested
 * without a live R3F context.
 *
 * Every function here takes plain values — camera position,
 * globe quaternion, current time — and returns plain values.
 * No R3F, no React, no refs. The component that wraps this
 * file is responsible for wiring the pieces together.
 */

import {
  computeSolarState,
  type SolarState,
} from "@/lib/useSolarState";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Minimum wall-clock interval between full `SolarState`
 * recomputations, in milliseconds.
 *
 * The subsolar point moves about 0.25°/min, and a drag rotates
 * the camera a few degrees per second. 4 Hz is dense enough to
 * feel live and sparse enough not to compete with rendering.
 */
export const SAMPLE_INTERVAL_MS = 250;

/**
 * Minimum camera displacement, in world units, that forces an
 * out-of-band resample.
 *
 * Without this, dragging the camera between ticks would show
 * a quarter-second-stale atmosphere. With it, state updates as
 * soon as the camera has moved roughly 2° since the last
 * sample.
 */
export const ANGULAR_MOVEMENT_THRESHOLD = 0.035;

/**
 * Maximum tolerated delta in `averageSolarElevation` before
 * two states are considered distinct. Chosen because a 2°
 * change in average elevation does not shift any background
 * palette.
 */
const ELEVATION_EQUALITY_THRESHOLD = 2;

/**
 * Maximum tolerated delta in `daylightFraction` before two
 * states are considered distinct. 2% of the visible disc is
 * imperceptible.
 */
const DAYLIGHT_EQUALITY_THRESHOLD = 0.02;

/**
 * Maximum tolerated distance between two subsolar screen
 * positions before two states are considered distinct. 3% of
 * the viewport.
 */
const SUBSOLAR_EQUALITY_THRESHOLD = 0.03;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type QuaternionTuple = readonly [
  number,
  number,
  number,
  number,
];

export interface SamplingState {
  /**
   * Timestamp of the last emitted sample, in milliseconds.
   * `0` on first run.
   */
  readonly lastSampleTimeMs: number;

  /**
   * Camera position at the last emitted sample, or `null` on
   * first run.
   */
  readonly lastCameraPosition: Vec3 | null;

  /**
   * The state last emitted, or `null` on first run.
   */
  readonly lastEmittedState: SolarState | null;
}

export const INITIAL_SAMPLING_STATE: SamplingState = {
  lastSampleTimeMs: 0,
  lastCameraPosition: null,
  lastEmittedState: null,
};

export interface SamplingInput {
  /** Current time, in milliseconds. */
  readonly nowMs: number;

  /** Current camera position. */
  readonly cameraPosition: Vec3;

  /** Current globe group quaternion. */
  readonly globeQuaternion: QuaternionTuple;

  /** State from the previous call. */
  readonly previous: SamplingState;
}

export interface SamplingResult {
  /**
   * The new state, or `null` when the sample was throttled out
   * and nothing should be emitted.
   */
  readonly state: SolarState | null;

  /**
   * The state to pass as `previous` on the next call.
   */
  readonly next: SamplingState;
}

/* -------------------------------------------------------------------------- */
/* Sampling                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Decide whether to emit a new solar state, and if so, compute
 * it.
 *
 * Emits when **either** the throttle interval has elapsed
 * **or** the camera has moved past `ANGULAR_MOVEMENT_THRESHOLD`
 * since the last sample. The dual condition means a stationary
 * camera still resamples at 4 Hz (to track the moving sun),
 * while an active drag resamples as soon as it has visibly
 * moved, without waiting for the next tick.
 *
 * When the sample is throttled, returns `{ state: null, next:
 * previous }` — the caller should skip its emit.
 *
 * When the sample fires but the resulting state is
 * indistinguishable from the last one, returns `{ state: null,
 * next }` with an advanced `next` — the throttle timers still
 * move forward, but no emit happens.
 *
 * @returns `state` is the fresh `SolarState` to emit, or
 *          `null`. `next` is always the state to feed back in
 *          on the next call.
 */
export function sampleSolarState(
  input: SamplingInput,
): SamplingResult {
  const { nowMs, cameraPosition, globeQuaternion, previous } =
    input;

  const intervalElapsed =
    nowMs - previous.lastSampleTimeMs >= SAMPLE_INTERVAL_MS;

  /*
   * Manual sqrt rather than `Math.hypot`. `Math.hypot` has to
   * handle three arguments and check for overflow/underflow
   * on each; the direct form is measurably faster in V8 and
   * this function runs at 60 Hz while the globe is mounted.
   */
  const cameraMoved =
    previous.lastCameraPosition === null
      ? true
      : (() => {
          const dx =
            cameraPosition.x - previous.lastCameraPosition.x;
          const dy =
            cameraPosition.y - previous.lastCameraPosition.y;
          const dz =
            cameraPosition.z - previous.lastCameraPosition.z;
          return (
            Math.sqrt(dx * dx + dy * dy + dz * dz) >=
            ANGULAR_MOVEMENT_THRESHOLD
          );
        })();

  if (!intervalElapsed && !cameraMoved) {
    return { state: null, next: previous };
  }

  const solar = computeSolarState({
    cameraPosition,
    globeQuaternion,
  });

  const next: SamplingState = {
    lastSampleTimeMs: nowMs,
    lastCameraPosition: cameraPosition,
    lastEmittedState: solar,
  };

  if (statesApproximatelyEqual(solar, previous.lastEmittedState)) {
    /*
     * Visually indistinguishable from the previous state.
     * Advance `next` so throttle timers keep moving, but tell
     * the caller not to emit.
     */
    return { state: null, next };
  }

  return { state: solar, next };
}

/* -------------------------------------------------------------------------- */
/* Equality                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Compare two solar states for "close enough to skip the
 * emit".
 *
 * Emitting at 4 Hz with a full re-render of the background
 * each time would be wasteful if nothing meaningful changed.
 * Every threshold below is chosen to be visually
 * imperceptible; see the constant declarations for the
 * rationale for each.
 *
 * A `null` `b` (first run) is never equal, forcing the first
 * sample to always emit.
 */
export function statesApproximatelyEqual(
  a: SolarState,
  b: SolarState | null,
): boolean {
  if (b === null) return false;

  if (a.dominantAtmosphere !== b.dominantAtmosphere) {
    return false;
  }

  if (
    Math.abs(a.averageSolarElevation - b.averageSolarElevation) >
    ELEVATION_EQUALITY_THRESHOLD
  ) {
    return false;
  }

  if (
    Math.abs(a.daylightFraction - b.daylightFraction) >
    DAYLIGHT_EQUALITY_THRESHOLD
  ) {
    return false;
  }

  const posA = a.subsolarScreenPosition;
  const posB = b.subsolarScreenPosition;

  if (posA === null && posB === null) return true;
  if (posA === null || posB === null) return false;

  /*
   * Manual sqrt for the same reason as in `sampleSolarState`:
   * the input is always two components, both in `[0, 1]`, so
   * the overflow guards `Math.hypot` performs are pure
   * overhead.
   */
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;

  return (
    Math.sqrt(dx * dx + dy * dy) <=
    SUBSOLAR_EQUALITY_THRESHOLD
  );
}