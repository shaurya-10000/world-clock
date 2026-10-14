/**
 * Small numeric helpers.
 *
 * No dependencies, no side effects. Shared so that every
 * positional or interpolation routine — sky geometry, camera
 * travel, atmosphere blending — uses one definition of
 * `clamp`, `lerp`, `easeInOut`, and `normalizeDegrees`
 * rather than re-rolling its own.
 */

/**
 * Constrain `value` to the closed interval `[min, max]`.
 *
 * If `min > max` the interval is empty and the result is
 * `max` — matching the left-to-right evaluation of the
 * implementation. Callers should pass a well-ordered
 * interval; this function does not reorder its arguments.
 */
export function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between `from` and `to`.
 *
 * Not clamped: `progress` outside `[0, 1]` extrapolates. This
 * is intentional — camera travel uses overshoot for ease-out
 * effects — so callers that want a bounded result should
 * compose with `clamp` explicitly.
 *
 * @param from      Value at `progress = 0`.
 * @param to        Value at `progress = 1`.
 * @param progress  Interpolation factor.
 */
export function lerp(
  from: number,
  to: number,
  progress: number,
): number {
  return from + (to - from) * progress;
}

/**
 * Symmetric quadratic ease-in-out.
 *
 * Maps `[0, 1]` to `[0, 1]` with zero derivative at both
 * endpoints, producing a smooth start and stop. Used for sky
 * motion where constant-velocity interpolation reads as
 * mechanical. Behaves as the identity at `0`, `0.5`, and `1`.
 */
export function easeInOut(value: number): number {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

/**
 * Normalize an angle in degrees to `[0, 360)`.
 *
 * Accepts any finite number, including negative values
 * (`-90 → 270`) and values beyond a full turn (`720 → 0`).
 * `NaN` propagates through the arithmetic and returns `NaN`.
 */
export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}