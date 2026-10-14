/**
 * Deterministic star field generator.
 *
 * Produces the star arrays used by both `SkyAtmosphere` (in the
 * Time Zones section) and `GlobeAtmosphere` (behind the globe).
 * Before this module existed, the two files each declared a
 * near-identical `STARS` array with slightly different
 * parameters and generation logic — two sources of truth for
 * "what does a star field look like."
 *
 * Coordinates are derived from the index, not from
 * `Math.random()`. This makes the field deterministic: two
 * renders produce identical positions, the field looks the
 * same before and after hydration, and a specific star can be
 * referenced by its index.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface StarConfig {
  /** Stable, unique key for React lists. */
  readonly id: string;

  /** Horizontal position, in percent, `[0, 100)`. */
  readonly left: number;

  /** Vertical position, in percent, `[0, 100)`. */
  readonly top: number;

  /** Dot size, in pixels. Typically 1 or 2. */
  readonly size: number;

  /** Animation delay, in seconds. */
  readonly delay: number;

  /** Animation duration, in seconds. */
  readonly duration: number;
}

export interface StarFieldOptions {
  /**
   * Prefix for the generated `id` values. Should be unique per
   * consumer so React keys do not collide when two fields are
   * rendered in the same tree.
   */
  readonly idPrefix: string;

  /** Horizontal offset applied to all stars, in percent. */
  readonly leftInset?: number;

  /** Vertical offset applied to all stars, in percent. */
  readonly topInset?: number;

  /** Horizontal span, in percent, into which stars are placed. */
  readonly leftSpan?: number;

  /** Vertical span, in percent, into which stars are placed. */
  readonly topSpan?: number;

  /** Minimum star size in pixels. */
  readonly minSize?: number;

  /**
   * Number of distinct size values to cycle through. A value
   * of `1` produces a constant size (`minSize`); a value of
   * `2` produces sizes `minSize` and `minSize + 1`; a value
   * of `3` produces `minSize`, `minSize + 1`, `minSize + 2`.
   *
   * Values below `1` are floored to `1` internally so the
   * modulo divisor can never be zero. `x % 0` is `NaN`, and a
   * `NaN` size would render as `width: NaNpx` — silently
   * broken rather than visibly broken.
   *
   * Named `sizeVariance` for historical reasons; it is
   * *count of distinct sizes*, not a difference. See the
   * note on `minSize` and `sizeVariance` below for the
   * exact mapping.
   */
  readonly sizeVariance?: number;

  /** Multiplier applied to the animation delay. */
  readonly delayStep?: number;

  /** Base animation duration in seconds. */
  readonly baseDuration?: number;

  /**
   * Duration variance range, in seconds. Internally rounded to
   * the nearest `0.1` (via `Math.round(durationRange * 10)`)
   * and then floored at a divisor of `1`, so the modulo
   * divisor is always at least `1` — smaller values would
   * produce `NaN` via `x % 0`.
   *
   * The result is quantized to tenths of a second: the
   * generator cycles through `durationDivisor` distinct
   * fractional offsets, each contributing `n / 10` seconds
   * on top of `baseDuration`. A `durationRange` of `1.6`
   * therefore yields ten distinct durations spanning
   * `[baseDuration, baseDuration + 0.9]`, not a continuous
   * spread across `1.6` seconds.
   */
  readonly durationRange?: number;
}

/* -------------------------------------------------------------------------- */
/* Generator                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generate a deterministic star field.
 *
 * @param count  Number of stars to generate.
 * @param opts   Generation parameters. Every field has a
 *               default matching one of the two previous
 *               hand-rolled arrays, so passing just
 *               `{ idPrefix }` produces the smaller
 *               `SkyAtmosphere` field.
 */
export function generateStarField(
  count: number,
  opts: StarFieldOptions,
): readonly StarConfig[] {
  const {
    idPrefix,
    leftInset = 4,
    topInset = 3,
    leftSpan = 92,
    topSpan = 64,
    minSize = 1,
    sizeVariance = 2,
    delayStep = 0.28,
    baseDuration = 2.8,
    durationRange = 1.6,
  } = opts;

  /*
   * Floor the size divisor at 1. A caller passing
   * `sizeVariance: 0` would compute `x % 0 === NaN` for every
   * star, producing `width: NaNpx` in the DOM. The same guard
   * pattern the duration divisor uses below.
   */
  const sizeDivisor = Math.max(1, Math.floor(sizeVariance));

  /*
   * Floor the duration divisor at 1. `Math.round(0.04 * 10)`
   * is `0`, and `x % 0` is `NaN`; without this guard a caller
   * passing a tiny `durationRange` would produce a field of
   * `NaN` durations.
   */
  const durationDivisor = Math.max(
    1,
    Math.round(durationRange * 10),
  );

  return Array.from({ length: count }, (_, index) => ({
    id: `${idPrefix}-${index}`,
    left: leftInset + ((index * 37) % leftSpan),
    top: topInset + ((index * 23) % topSpan),
    size: minSize + ((index * 7) % sizeDivisor),
    delay: (index % 12) * delayStep,
    duration:
      baseDuration + ((index * 11) % durationDivisor) / 10,
  }));
}