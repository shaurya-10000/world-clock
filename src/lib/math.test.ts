import { describe, expect, it } from "vitest";

import {
  clamp,
  easeInOut,
  lerp,
  normalizeDegrees,
} from "@/lib/math";

/* -------------------------------------------------------------------------- */
/* clamp                                                                      */
/* -------------------------------------------------------------------------- */

describe("clamp", () => {
  it("returns the value when it is inside the interval", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, -10, 10)).toBe(-3);
  });

  it("snaps to `min` when the value is below the interval", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-0.0001, 0, 1)).toBe(0);
  });

  it("snaps to `max` when the value is above the interval", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(1.0001, 0, 1)).toBe(1);
  });

  it("returns the boundary when the value equals it", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("handles a degenerate interval where min === max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(-5, 3, 3)).toBe(3);
  });

  it("returns `max` when min > max (empty interval)", () => {
    // Documented behavior: the arguments are not reordered,
    // and the implementation naturally resolves to `max`.
    expect(clamp(5, 10, 0)).toBe(0);
    expect(clamp(-5, 10, 0)).toBe(0);
  });

  it("preserves NaN", () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });

  it("handles infinities", () => {
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
  });

  it("works with fractional bounds", () => {
    expect(clamp(0.7, 0.25, 0.75)).toBe(0.7);
    expect(clamp(0.1, 0.25, 0.75)).toBe(0.25);
    expect(clamp(0.9, 0.25, 0.75)).toBe(0.75);
  });

  it("works with negative bounds", () => {
    expect(clamp(-5, -10, -3)).toBe(-5);
    expect(clamp(-20, -10, -3)).toBe(-10);
    expect(clamp(0, -10, -3)).toBe(-3);
  });

  it("is idempotent — clamping twice equals clamping once", () => {
    const values = [-100, -1, 0, 5, 10, 100];
    for (const v of values) {
      const once = clamp(v, 0, 10);
      expect(clamp(once, 0, 10)).toBe(once);
    }
  });

  it("always returns a value within [min, max] for valid intervals", () => {
    const values = [
      -1e6, -100, -1, -0.5, 0, 0.5, 1, 5, 100, 1e6,
    ];
    for (const v of values) {
      const result = clamp(v, 0, 10);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* lerp                                                                       */
/* -------------------------------------------------------------------------- */

describe("lerp", () => {
  it("returns `from` at progress 0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(-5, 5, 0)).toBe(-5);
  });

  it("returns `to` at progress 1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(-5, 5, 1)).toBe(5);
  });

  it("returns the midpoint at progress 0.5", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(-10, 10, 0.5)).toBe(0);
    expect(lerp(100, 200, 0.5)).toBe(150);
  });

  it("interpolates linearly across the interval", () => {
    // Ten evenly spaced samples from 0 to 10.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(lerp(0, 10, t)).toBeCloseTo(i, 10);
    }
  });

  it("extrapolates beyond [0, 1] without clamping", () => {
    // Documented behavior: overshoot is intentional, used by
    // camera travel ease-out.
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });

  it("returns a constant when from === to", () => {
    expect(lerp(7, 7, 0)).toBe(7);
    expect(lerp(7, 7, 0.5)).toBe(7);
    expect(lerp(7, 7, 1)).toBe(7);
  });

  it("handles descending ranges", () => {
    expect(lerp(10, 0, 0.25)).toBe(7.5);
    expect(lerp(10, 0, 0.75)).toBe(2.5);
  });

  it("propagates NaN through any argument", () => {
    expect(lerp(NaN, 10, 0.5)).toBeNaN();
    expect(lerp(0, NaN, 0.5)).toBeNaN();
    expect(lerp(0, 10, NaN)).toBeNaN();
  });

  it("is symmetric — lerp(a, b, t) + lerp(a, b, 1 - t) === a + b", () => {
    // The two ends of a linear interpolation sum to the sum
    // of the endpoints, for any t.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(
        lerp(-3, 7, t) + lerp(-3, 7, 1 - t),
      ).toBeCloseTo(-3 + 7, 10);
    }
  });

  it("handles very small and very large ranges", () => {
    expect(lerp(0, 1e-15, 0.5)).toBeCloseTo(5e-16, 20);
    expect(lerp(0, 1e15, 0.5)).toBe(5e14);
  });

  it("defers to IEEE-754 arithmetic when given infinities", () => {
    /*
     * `lerp` does not sanitize infinite inputs. The
     * implementation computes `from + (to - from) * progress`,
     * so any `to - from` that produces `Infinity - Infinity`
     * yields `NaN`. The cases below pin that behavior:
     *
     *   - `0 + (Infinity - 0) * 0.5` → `Infinity`   (no
     *      Inf - Inf subtraction)
     *   - `-Infinity + (0 - -Infinity) * 0.5`
     *     → `-Infinity + Infinity` → `NaN`
     *   - `-Infinity + (Infinity - -Infinity) * 0.5`
     *     → `-Infinity + Infinity` → `NaN`
     *   - `Infinity + (Infinity - Infinity) * 0.5`
     *     → `Infinity + NaN` → `NaN`
     *
     * A caller that needs "well-behaved" output for infinite
     * endpoints must clamp or validate before calling.
     */
    expect(lerp(0, Infinity, 0.5)).toBe(Infinity);
    expect(lerp(-Infinity, 0, 0.5)).toBeNaN();
    expect(lerp(-Infinity, Infinity, 0.5)).toBeNaN();
    expect(lerp(Infinity, Infinity, 0.5)).toBeNaN();
  });
});

/* -------------------------------------------------------------------------- */
/* easeInOut                                                                  */
/* -------------------------------------------------------------------------- */

describe("easeInOut", () => {
  it("maps 0 to 0 and 1 to 1", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
  });

  it("maps 0.5 to 0.5", () => {
    expect(easeInOut(0.5)).toBe(0.5);
  });

  it("is monotonically increasing across [0, 1]", () => {
    let previous = -Infinity;

    for (let i = 0; i <= 100; i++) {
      const current = easeInOut(i / 100);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("stays within [0, 1] for inputs in [0, 1]", () => {
    for (let i = 0; i <= 100; i++) {
      const y = easeInOut(i / 100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("is symmetric about 0.5: ease(t) + ease(1 - t) === 1", () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      expect(easeInOut(t) + easeInOut(1 - t)).toBeCloseTo(1, 10);
    }
  });

  it("eases in on the lower half (slower than linear)", () => {
    // For a symmetric ease-in-out, values below 0.5 should be
    // less than the linear identity.
    for (let i = 1; i < 5; i++) {
      const t = i / 10;
      expect(easeInOut(t)).toBeLessThan(t);
    }
  });

  it("eases out on the upper half (faster than linear)", () => {
    for (let i = 6; i < 10; i++) {
      const t = i / 10;
      expect(easeInOut(t)).toBeGreaterThan(t);
    }
  });

  it("has a derivative of zero at both endpoints", () => {
    // Approximate the derivative numerically at 0 and 1.
    const h = 1e-4;

    const slopeAtStart =
      (easeInOut(0 + h) - easeInOut(0)) / h;
    const slopeAtEnd =
      (easeInOut(1) - easeInOut(1 - h)) / h;

    expect(slopeAtStart).toBeLessThan(1e-3);
    expect(slopeAtEnd).toBeLessThan(1e-3);
  });

  it("has a slope of 2 at the midpoint", () => {
    // The derivative of `2x²` is `4x`, so at `x = 0.5` the
    // slope is `2`. The upper branch is the mirror image.
    const h = 1e-4;
    const slopeAtMid =
      (easeInOut(0.5 + h) - easeInOut(0.5 - h)) / (2 * h);

    expect(slopeAtMid).toBeCloseTo(2, 3);
  });

  it("extrapolates beyond [0, 1] without clamping", () => {
    // The function is a pure quadratic; it has well-defined
    // (if rarely useful) values outside the unit interval.
    expect(easeInOut(-0.5)).toBe(0.5);
    expect(easeInOut(1.5)).toBe(0.5);
  });

  it("propagates NaN", () => {
    expect(easeInOut(NaN)).toBeNaN();
  });

  it("is continuous at 0.5", () => {
    // The two branches must agree at the join point.
    const just_below = easeInOut(0.5 - 1e-9);
    const just_above = easeInOut(0.5 + 1e-9);
    expect(just_below).toBeCloseTo(just_above, 8);
  });
});

/* -------------------------------------------------------------------------- */
/* normalizeDegrees                                                           */
/* -------------------------------------------------------------------------- */

describe("normalizeDegrees", () => {
  it("leaves values already in [0, 360) unchanged", () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(90)).toBe(90);
    expect(normalizeDegrees(180)).toBe(180);
    expect(normalizeDegrees(359.999)).toBeCloseTo(359.999, 10);
  });

  it("wraps 360 back to 0", () => {
    expect(normalizeDegrees(360)).toBe(0);
  });

  it("wraps values above 360", () => {
    expect(normalizeDegrees(450)).toBe(90);
    expect(normalizeDegrees(720)).toBe(0);
    expect(normalizeDegrees(725)).toBe(5);
    expect(normalizeDegrees(1_000_000)).toBe(280);
  });

  it("wraps negative values into [0, 360)", () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(-180)).toBe(180);
    expect(normalizeDegrees(-270)).toBe(90);
    expect(normalizeDegrees(-360)).toBe(0);
  });

  it("wraps values below -360", () => {
    expect(normalizeDegrees(-450)).toBe(270);
    expect(normalizeDegrees(-720)).toBe(0);
    expect(normalizeDegrees(-1_000_000)).toBe(80);
  });

  it("is idempotent", () => {
    const inputs = [-720, -180, 0, 45, 360, 725, 1_000_000];

    for (const input of inputs) {
      const once = normalizeDegrees(input);
      const twice = normalizeDegrees(once);
      expect(twice).toBe(once);
    }
  });

  it("preserves the modular residue for any pair of inputs", () => {
    // `normalizeDegrees(a) === normalizeDegrees(a + 360k)` for
    // any integer k. This is the fundamental invariant of
    // angle wrapping.
    const base = 47.5;

    for (let k = -5; k <= 5; k++) {
      expect(normalizeDegrees(base + 360 * k)).toBeCloseTo(
        base,
        10,
      );
    }
  });

  it("handles non-integer angles", () => {
    expect(normalizeDegrees(0.5)).toBe(0.5);
    expect(normalizeDegrees(359.5)).toBe(359.5);
    expect(normalizeDegrees(360.5)).toBeCloseTo(0.5, 10);
    expect(normalizeDegrees(-0.5)).toBeCloseTo(359.5, 10);
  });

  it("propagates NaN", () => {
    expect(normalizeDegrees(NaN)).toBeNaN();
  });

  it("handles infinities as NaN", () => {
    // `Infinity % 360 === NaN`, so the wrap-to-NaN is the
    // correct and documented result.
    expect(normalizeDegrees(Infinity)).toBeNaN();
    expect(normalizeDegrees(-Infinity)).toBeNaN();
  });

  it("always returns a value in [0, 360) for any finite input", () => {
    const inputs = [
      -1e6, -720, -360, -90, -0.1, 0, 0.1, 90, 180, 359.9,
      360, 720, 1e6,
    ];

    for (const input of inputs) {
      const result = normalizeDegrees(input);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(360);
    }
  });
});