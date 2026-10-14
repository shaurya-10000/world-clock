import { describe, expect, it } from "vitest";

import {
  getMoonPosition,
  getSunPosition,
} from "@/components/clock/SkyAtmosphere";

/* -------------------------------------------------------------------------- */
/* Sun arc — reference positions                                              */
/* -------------------------------------------------------------------------- */

describe("getSunPosition — reference positions", () => {
  it("places the sun at the left edge just after sunrise", () => {
    /*
     * The sun rises at 05:30. One hour later, `progress` is
     * `1/13 ≈ 0.0769`, and `easeInOut(0.0769) ≈ 0.0118`. So
     * `left ≈ 7 + 0.0118 × 86 ≈ 8.02`. The floor value `7`
     * applies only at `progress === 0` — the exact sunrise
     * instant.
     */
    const { left } = getSunPosition(5.5);

    expect(left).toBeCloseTo(7, 5);
  });

  it("places the sun at the right edge at sunset", () => {
    const { left } = getSunPosition(18.5);

    expect(left).toBeCloseTo(93, 5);
  });

  it("places the sun at the horizontal midpoint at solar noon", () => {
    /*
     * `progress = (12 - 5.5) / 13 = 0.5`. `easeInOut(0.5) = 0.5`.
     * `lerp(7, 93, 0.5) = 50`.
     */
    const { left } = getSunPosition(12);

    expect(left).toBeCloseTo(50, 5);
  });

  it("peaks vertically around solar noon", () => {
    /*
     * `Math.sin(0.5 × π) = 1`, so `top = lerp(70, 14, 1) = 14`.
     */
    const { top } = getSunPosition(12);

    expect(top).toBeCloseTo(14, 5);
  });

  it("returns the vertical floor before sunrise", () => {
    /*
     * `progress` is clamped to 0, so `Math.sin(0) = 0` and
     * `top = lerp(70, 14, 0) = 70`.
     */
    const { top } = getSunPosition(0);

    expect(top).toBeCloseTo(70, 5);
  });

  it("returns the vertical floor after sunset", () => {
    const { top } = getSunPosition(23);

    expect(top).toBeCloseTo(70, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* Sun arc — clamping                                                         */
/* -------------------------------------------------------------------------- */

describe("getSunPosition — clamping", () => {
  it("clamps out-of-range hours to the horizontal bounds", () => {
    expect(getSunPosition(-4).left).toBeCloseTo(7, 5);
    expect(getSunPosition(30).left).toBeCloseTo(93, 5);
  });

  it("clamps to the left edge at exactly sunrise", () => {
    expect(getSunPosition(5.5).left).toBeCloseTo(7, 5);
  });

  it("clamps to the right edge at exactly sunset", () => {
    expect(getSunPosition(18.5).left).toBeCloseTo(93, 5);
  });

  it("never exceeds the horizontal bounds", () => {
    for (let h = -12; h <= 36; h += 0.25) {
      const { left } = getSunPosition(h);
      expect(left).toBeGreaterThanOrEqual(7);
      expect(left).toBeLessThanOrEqual(93);
    }
  });

  it("never exceeds the vertical bounds", () => {
    for (let h = -12; h <= 36; h += 0.25) {
      const { top } = getSunPosition(h);
      expect(top).toBeGreaterThanOrEqual(14);
      expect(top).toBeLessThanOrEqual(70);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Sun arc — continuity                                                       */
/* -------------------------------------------------------------------------- */

describe("getSunPosition — continuity", () => {
  it("increases left monotonically through the daylight window", () => {
    const samples = [6, 8, 10, 12, 14, 16, 18].map(
      (h) => getSunPosition(h).left,
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it("decreases top monotonically through the morning", () => {
    /*
     * From sunrise to noon, the sun climbs (top decreases).
     */
    const samples = [6, 8, 10, 12].map(
      (h) => getSunPosition(h).top,
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it("increases top monotonically through the afternoon", () => {
    /*
     * From noon to sunset, the sun descends (top increases).
     */
    const samples = [12, 14, 16, 18].map(
      (h) => getSunPosition(h).top,
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it("never returns NaN for a range of fractional hours", () => {
    for (let h = 0; h <= 24; h += 0.25) {
      const { left, top } = getSunPosition(h);
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(top)).toBe(true);
    }
  });

  it("is deterministic — same input, same output", () => {
    for (const h of [5.5, 8, 12, 15, 18.5]) {
      expect(getSunPosition(h)).toEqual(getSunPosition(h));
    }
  });

  it("returns a fresh object on every call", () => {
    const a = getSunPosition(12);
    const b = getSunPosition(12);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* -------------------------------------------------------------------------- */
/* Moon arc — reference positions                                             */
/* -------------------------------------------------------------------------- */

describe("getMoonPosition — reference positions", () => {
  it("places the moon at the right edge at moonrise (17:30)", () => {
    /*
     * Moonrise is 17:30. `nightHour = 17.5`, `progress = 0`,
     * `eased = 0`. `left = lerp(93, 7, 0) = 93`.
     */
    const { left } = getMoonPosition(17.5);

    expect(left).toBeCloseTo(93, 5);
  });

  it("reaches the left edge at the end of the wrapped arc (29.5)", () => {
    /*
     * Moonset (05:30) is the tail of the moon's arc that
     * began at 17:30 the prior evening, which is `29.5` in
     * the wrapped timeline. `progress = (29.5 - 17.5) / 12 = 1`,
     * so `left = lerp(93, 7, 1) = 7`.
     */
    const { left } = getMoonPosition(29.5);

    expect(left).toBeCloseTo(7, 5);
  });

  it("has just left the right edge at the raw moonset boundary", () => {
    /*
     * At exactly 05:30, `decimalHour < 5.5` is false, so the
     * wrap branch does not fire and `nightHour = 5.5` sits
     * before the arc's start. `progress` clamps to 0, so the
     * left edge is 93 — the arc's beginning.
     */
    const { left } = getMoonPosition(5.5);

    expect(left).toBeCloseTo(93, 5);
  });

  it("wraps hours before 05:30 into the previous evening's arc", () => {
    /*
     * `getMoonPosition(1)` uses `nightHour = 25`, and
     * `getMoonPosition(25)` uses the same value directly.
     * Both must produce identical positions.
     */
    const early = getMoonPosition(1);
    const late = getMoonPosition(25);
    expect(early.left).toBeCloseTo(late.left, 5);
    expect(early.top).toBeCloseTo(late.top, 5);
  });

  it("peaks vertically in the middle of the night", () => {
    /*
     * Moonrise 17:30, moonset 29:30. The midpoint in the
     * wrapped timeline is 23.5. `progress = 0.5`, so
     * `Math.sin(0.5 × π) = 1`, and `top = lerp(70, 13, 1) = 13`.
     */
    const { top } = getMoonPosition(23.5);

    expect(top).toBeCloseTo(13, 5);
  });

  it("returns the vertical floor in the middle of the day", () => {
    /*
     * At hour 11, `nightHour = 11` (no wrap), and `progress`
     * clamps to 0 because 11 < 17.5. `top = lerp(70, 13, 0) = 70`.
     */
    const { top } = getMoonPosition(11);

    expect(top).toBeCloseTo(70, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* Moon arc — clamping and continuity                                         */
/* -------------------------------------------------------------------------- */

describe("getMoonPosition — clamping and continuity", () => {
  it("clamps out-of-range hours to the horizontal bounds", () => {
    // Daytime hours before moonrise clamp to the right edge.
    expect(getMoonPosition(12).left).toBeCloseTo(93, 5);
    // Post-moonset hours (after 29.5 in the wrapped arc)
    // clamp to the left edge.
    expect(getMoonPosition(6).left).toBeCloseTo(93, 5);
    // Late evening hours well past moonset clamp to the left.
    expect(getMoonPosition(29.75).left).toBeCloseTo(7, 5);
  });

  it("never exceeds the horizontal bounds across a full day", () => {
    for (let h = 0; h <= 24; h += 0.25) {
      const { left } = getMoonPosition(h);
      expect(left).toBeGreaterThanOrEqual(7);
      expect(left).toBeLessThanOrEqual(93);
    }
  });

  it("never exceeds the vertical bounds across a full day", () => {
    for (let h = 0; h <= 24; h += 0.25) {
      const { top } = getMoonPosition(h);
      expect(top).toBeGreaterThanOrEqual(13);
      expect(top).toBeLessThanOrEqual(70);
    }
  });

  it("decreases left monotonically through the night", () => {
    /*
     * From moonrise (17.5) to moonset (29.5), the moon
     * travels right-to-left. Sample across the wrapped
     * window.
     */
    const samples = [17.5, 20, 23, 26, 29].map(
      (h) => getMoonPosition(h).left,
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it("never returns NaN across a full 24-hour cycle", () => {
    for (let h = 0; h <= 24; h += 0.25) {
      const { left, top } = getMoonPosition(h);
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(top)).toBe(true);
    }
  });

  it("is deterministic — same input, same output", () => {
    for (const h of [0, 5.5, 12, 17.5, 23.5]) {
      expect(getMoonPosition(h)).toEqual(getMoonPosition(h));
    }
  });

  it("returns a fresh object on every call", () => {
    const a = getMoonPosition(23);
    const b = getMoonPosition(23);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

/* -------------------------------------------------------------------------- */
/* Sun and moon relationship                                                  */
/* -------------------------------------------------------------------------- */

describe("getSunPosition / getMoonPosition — relationship", () => {
  it("both start at their respective rise points with progress 0", () => {
    // Sun rise: left edge at 05:30.
    // Moon rise: right edge at 17:30.
    expect(getSunPosition(5.5).left).toBeCloseTo(7, 5);
    expect(getMoonPosition(17.5).left).toBeCloseTo(93, 5);
  });

  it("sun and moon travel in opposite horizontal directions", () => {
    /*
     * The sun moves left-to-right; the moon moves
     * right-to-left. Sample a quarter of the way into each
     * arc and confirm the directions differ.
     */
    const sunEarly = getSunPosition(7).left;
    const sunLater = getSunPosition(9).left;
    expect(sunLater).toBeGreaterThan(sunEarly);

    const moonEarly = getMoonPosition(18.5).left;
    const moonLater = getMoonPosition(20.5).left;
    expect(moonLater).toBeLessThan(moonEarly);
  });
});