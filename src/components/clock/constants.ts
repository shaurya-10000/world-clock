/**
 * WorldClockSection constants.
 *
 * Cloud and star field data, plus the shared layout and easing
 * values used by multiple clock sub-components.
 */

import {
  generateStarField,
  type StarConfig,
} from "@/lib/starfield";

export type { StarConfig };

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Responsive width for the clock face.
 *
 * Used by both `AnalogClock` and `DigitalClock` so their
 * containers match across the mobile-to-desktop breakpoint.
 *
 * The mobile value — `min(78vw, 430px)` — is tuned so that at
 * the narrowest common viewport (a 320px phone), the clock
 * occupies 78% of the width with breathing room on either
 * side, and never exceeds 430px even on a wide phone in
 * landscape. The `sm:w-[430px]` cap takes over at ≥640px, at
 * which point the clock sits at a fixed size regardless of
 * how much horizontal space the container provides.
 *
 * Both faces draw their internal layout (numerals, hands,
 * tick marks) against this container. Changing the constant
 * without re-checking the internal spacing would cause the
 * tick marks or the numeral positions to visually collide
 * with the frame.
 */
export const CLOCK_SIZE_CLASS =
  "w-[min(78vw,430px)] sm:w-[430px]";

/* -------------------------------------------------------------------------- */
/* Animation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Shared easing curve — a soft ease-out used by every
 * `WorldClockSection` animation. Matches the easing used by
 * the other sections of the app.
 *
 * The four values are `[p1x, p1y, p2x, p2y]` in the CSS
 * `cubic-bezier()` convention. Both control points sit on the
 * horizontal axis at `y = 1`, which is what produces the
 * aggressive ease-out — motion is fast at the start and
 * decelerates smoothly into the end value.
 */
export const EASE = [0.16, 1, 0.3, 1] as const;

/* -------------------------------------------------------------------------- */
/* Clouds                                                                     */
/* -------------------------------------------------------------------------- */

export interface CloudConfig {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** CSS percentage offset from the section's left edge. */
  readonly left: string;
  /** CSS percentage offset from the section's top edge. */
  readonly top: string;
  /** Full drift cycle duration, in seconds. */
  readonly duration: number;
  /**
   * Drift cycle delay, in seconds.
   *
   * Negative values are phase-shifts: a delay of `-14` starts
   * the cloud 14 seconds into its `duration`-second cycle, as
   * if it had already been drifting for 14 seconds before the
   * component mounted. CSS keyframe animations accept negative
   * delays specifically for this — they begin mid-cycle rather
   * than waiting.
   *
   * Every cloud in the field uses a different negative delay
   * (or `0` for the first) so the layers do not start in
   * phase. Without them, every cloud would drift in lockstep
   * for the first cycle, which reads as mechanical rather
   * than atmospheric.
   */
  readonly delay: number;
  readonly opacity: number;
}

/**
 * The four drifting cloud layers.
 *
 * Values are eyeballed for a soft, uneven distribution. The
 * negative delays mean no cloud starts its cycle at zero —
 * without them, every cloud would begin moving from the same
 * phase on the first frame, which reads as mechanical.
 */
export const CLOUDS: readonly CloudConfig[] = [
  {
    id: "cloud-one",
    width: 310,
    height: 78,
    left: "-6%",
    top: "19%",
    duration: 42,
    delay: 0,
    opacity: 0.3,
  },
  {
    id: "cloud-two",
    width: 380,
    height: 90,
    left: "32%",
    top: "10%",
    duration: 55,
    delay: -14,
    opacity: 0.23,
  },
  {
    id: "cloud-three",
    width: 280,
    height: 72,
    left: "72%",
    top: "23%",
    duration: 48,
    delay: -24,
    opacity: 0.27,
  },
  {
    id: "cloud-four",
    width: 230,
    height: 62,
    left: "52%",
    top: "40%",
    duration: 38,
    delay: -8,
    opacity: 0.17,
  },
];

/* -------------------------------------------------------------------------- */
/* Stars                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The Time Zones section's star field.
 *
 * A sparse field of 48 stars concentrated in the upper
 * portion of the section, generated deterministically by
 * `generateStarField`. The `"star"` id prefix keeps React
 * keys distinct from the globe's field, which uses the
 * `"globe-star"` prefix, in case both are ever mounted in
 * the same tree.
 *
 * The count (48) is chosen to be sparse enough that no two
 * stars visually overlap at any common viewport width, and
 * dense enough that the sky reads as populated rather than
 * empty. A future redesign that changes the section's height
 * would need to re-tune this count.
 */
export const STARS: readonly StarConfig[] = generateStarField(48, {
  idPrefix: "star",
});