/**
 * Quaternion math.
 *
 * Small, dependency-free helpers for rotating vectors by
 * quaternions. Kept free of any `three` import so they can be
 * used from non-rendering code (tests, analysis) and so the
 * matrix-free path stays available in R3F animation loops
 * where allocating a `THREE.Quaternion` per frame is wasteful.
 *
 * Quaternions are represented as plain tuples in `[x, y, z, w]`
 * order, matching the property order of `THREE.Quaternion` and
 * the shape consumed by `EarthSphere`, `Terminator`, and the
 * solar-sampling modules.
 *
 * ## Failure observability
 *
 * `rotateByInverse` assumes its quaternion argument is unit-
 * length. A non-unit quaternion does not crash — the arithmetic
 * still produces a vector — but the result is a scaled rotation
 * rather than a pure one, and the visual consequence is a
 * globe that is subtly distorted or a terminator that drifts.
 * The failure is silent without the check.
 *
 * The check emits exactly one warning per distinct magnitude.
 * The magnitude is the stable key: a quaternion that is being
 * re-created fresh every frame has a new object identity but
 * the same magnitude, so an identity-based memo would not
 * deduplicate. Rounding to six decimal places keeps the key
 * stable against floating-point jitter.
 *
 * This module is called from `Terminator`, `globeAtmosphere`,
 * and `useSolarState`. All three run on a per-frame cadence in
 * production, so a naive "warn every time" would emit hundreds
 * of warnings per second per caller and drown out every other
 * diagnostic. The memo is not an optimization — it is what
 * makes the warning usable.
 */

import { logWarn } from "@/lib/logger";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type QuaternionTuple = readonly [
  number,
  number,
  number,
  number,
];

/**
 * Tolerance for the dev-mode unit-length assertion in
 * `rotateByInverse`.
 *
 * Loose enough that a unit quaternion produced by any
 * reasonable normalization — or by composing a handful of
 * unit quaternions together — passes without a warning.
 * Tight enough that a genuinely non-unit input — the
 * mistake the check exists to catch — does not.
 */
const UNIT_LENGTH_EPSILON = 1e-3;

/**
 * Precision used when rounding the length-squared value to a
 * memo key.
 *
 * Six decimal places means two quaternions whose lengths
 * differ by less than `1e-6` share a memo entry and warn
 * only once. That is below the level at which any visual
 * consequence could be attributed to the difference, and it
 * is stable against the floating-point jitter that a
 * per-frame re-normalization introduces.
 */
const MEMO_PRECISION = 1e-6;

/**
 * Set of length-squared values already warned about.
 *
 * Bounded by the number of distinct magnitudes the app
 * produces for a bad quaternion — in practice one or two
 * when a bug is introduced, since the bug is a missed
 * normalize on a specific code path.
 */
const reportedNonUnitQuaternions = new Set<number>();

/**
 * Warn once per distinct non-unit magnitude.
 *
 * The first quaternion with a given length-squared emits a
 * single warning. Subsequent quaternions of the same
 * magnitude are silent. Different magnitudes warn
 * separately, so a second bug produces a second warning
 * rather than being hidden by the first.
 *
 * Never throws. A logger failure is not a reason to break
 * rendering.
 */
function reportNonUnitQuaternion(lengthSq: number): void {
  /*
   * Round the length-squared to the memo precision before
   * using it as a key. The raw float differs by tens of
   * ULP between two quaternions of the same nominal
   * magnitude, so an unrounded key would miss.
   */
  const key =
    Math.round(lengthSq / MEMO_PRECISION) * MEMO_PRECISION;

  if (reportedNonUnitQuaternions.has(key)) {
    return;
  }
  reportedNonUnitQuaternions.add(key);

  logWarn(
    `[quaternion] rotateByInverse received a non-unit ` +
      `quaternion (|q|² = ${lengthSq.toFixed(6)}); the result ` +
      `will not be a pure rotation. This warning fires once ` +
      `per distinct magnitude.`,
  );
}

/**
 * Reset the non-unit-quaternion warning memo.
 *
 * Test-only. A test that exercises the non-unit guard must
 * reset this in an `afterEach`, or a subsequent test in the
 * same file will see zero warnings because the magnitude has
 * already been memoized. The dunder prefix matches the
 * codebase's convention for test-only exports
 * (`__clearIconCache`, `__resetActiveEventId`,
 * `__validateAliases`).
 *
 * Production code has no reason to call this.
 */
export function __resetQuaternionFailureLog(): void {
  reportedNonUnitQuaternions.clear();
}

/**
 * Rotate a vector by the inverse of a unit quaternion.
 *
 * The inverse of a unit quaternion is its conjugate, so this
 * is mathematically equivalent to `q.clone().invert()`
 * followed by `v.applyQuaternion(...)`. The manual expansion
 * avoids allocating a `THREE.Quaternion` and a
 * `THREE.Vector3` per call, which matters when this runs once
 * per frame per consumer.
 *
 * The formula is the standard Hamilton product `q* · v · q`,
 * expanded and simplified for the conjugate case.
 *
 * ## Non-unit guard
 *
 * The formula assumes `|q| = 1`. A non-unit quaternion scales
 * the vector instead of just rotating it, producing a rotated
 * result whose magnitude differs from `|v|` — a silent,
 * hard-to-trace corruption. The dev-mode check warns once per
 * distinct magnitude rather than throwing, so a stray input
 * does not break the frame loop.
 *
 * The check is gated on `process.env.NODE_ENV !==
 * "production"`. The additional check inside
 * `reportNonUnitQuaternion` for "have we already warned
 * about this magnitude" is what makes the guard cheap enough
 * to run on the hot path: after the first warning, every
 * subsequent call with the same magnitude costs one `Set.has`
 * lookup.
 *
 * @param v  The vector to rotate.
 * @param q  The quaternion to rotate by, as `[x, y, z, w]`.
 *           Must be a unit quaternion; the function does not
 *           normalize.
 */
export function rotateByInverse(
  v: Vec3,
  q: QuaternionTuple,
): Vec3 {
  /*
   * Dev-only guard. The `NODE_ENV` check is a build-time
   * constant in production bundles, so the entire block is
   * dead-code-eliminated in a production build.
   */
  if (process.env.NODE_ENV !== "production") {
    const lengthSq =
      q[0] * q[0] +
      q[1] * q[1] +
      q[2] * q[2] +
      q[3] * q[3];

    if (Math.abs(lengthSq - 1) > UNIT_LENGTH_EPSILON) {
      reportNonUnitQuaternion(lengthSq);
    }
  }

  const [qx, qy, qz, qw] = q;

  /* Conjugate of a unit quaternion: negate the vector part. */
  const cx = -qx;
  const cy = -qy;
  const cz = -qz;
  const cw = qw;

  /* Hamilton product: c * v */
  const ix = cw * v.x + cy * v.z - cz * v.y;
  const iy = cw * v.y + cz * v.x - cx * v.z;
  const iz = cw * v.z + cx * v.y - cy * v.x;
  const iw = -cx * v.x - cy * v.y - cz * v.z;

  /* Hamilton product: (c * v) * c⁻¹, expanded for conjugate. */
  return {
    x: ix * cw + iw * -cx + iy * -cz - iz * -cy,
    y: iy * cw + iw * -cy + iz * -cx - ix * -cz,
    z: iz * cw + iw * -cz + ix * -cy - iy * -cx,
  };
}