import { describe, expect, it } from "vitest";

import { computeHandAngles } from "@/components/clock/AnalogClock";
import type { LocalTime } from "@/lib/time";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Minimal `LocalTime` shape for the arithmetic tests. Only
 * `hour`, `minute`, and `second` are read by `computeHandAngles`;
 * the rest are placeholders.
 */
function timeAt(
  hour: number,
  minute: number,
  second: number,
): LocalTime {
  return {
    hour,
    minute,
    second,
    decimalHour: hour + minute / 60 + second / 3600,
    time12: "",
    time24: "",
    period: "AM",
    formattedDate: "",
    zoneName: "",
    utcOffset: "",
  };
}

/* -------------------------------------------------------------------------- */
/* Reference positions                                                        */
/* -------------------------------------------------------------------------- */

describe("computeHandAngles — reference positions", () => {
  it("all hands point at 12 at midnight", () => {
    const angles = computeHandAngles(timeAt(0, 0, 0));

    expect(angles.hour).toBe(0);
    expect(angles.minute).toBe(0);
    expect(angles.second).toBe(0);
  });

  it("all hands point at 12 at noon", () => {
    // `hour % 12` maps 12 → 0, so noon mirrors midnight.
    const angles = computeHandAngles(timeAt(12, 0, 0));

    expect(angles.hour).toBe(0);
    expect(angles.minute).toBe(0);
    expect(angles.second).toBe(0);
  });

  it("hour hand points at 3 at 03:00", () => {
    const angles = computeHandAngles(timeAt(3, 0, 0));

    expect(angles.hour).toBe(90);
  });

  it("hour hand points at 6 at 06:00", () => {
    const angles = computeHandAngles(timeAt(6, 0, 0));

    expect(angles.hour).toBe(180);
  });

  it("hour hand points at 9 at 09:00", () => {
    const angles = computeHandAngles(timeAt(9, 0, 0));

    expect(angles.hour).toBe(270);
  });

  it("minute hand points at 3 at :15", () => {
    const angles = computeHandAngles(timeAt(0, 15, 0));

    expect(angles.minute).toBe(90);
  });

  it("minute hand points at 6 at :30", () => {
    const angles = computeHandAngles(timeAt(0, 30, 0));

    expect(angles.minute).toBe(180);
  });

  it("minute hand points at 9 at :45", () => {
    const angles = computeHandAngles(timeAt(0, 45, 0));

    expect(angles.minute).toBe(270);
  });

  it("second hand points at 3 at :15 seconds", () => {
    const angles = computeHandAngles(timeAt(0, 0, 15));

    expect(angles.second).toBe(90);
  });

  it("second hand points at 6 at :30 seconds", () => {
    const angles = computeHandAngles(timeAt(0, 0, 30));

    expect(angles.second).toBe(180);
  });

  it("second hand points at 9 at :45 seconds", () => {
    const angles = computeHandAngles(timeAt(0, 0, 45));

    expect(angles.second).toBe(270);
  });
});

/* -------------------------------------------------------------------------- */
/* Continuous motion                                                          */
/* -------------------------------------------------------------------------- */

describe("computeHandAngles — continuous motion", () => {
  it("minute hand advances continuously with the second", () => {
    // At :00 seconds, minute is exactly on the mark. At :30
    // seconds, minute has advanced by half a minute's worth
    // of rotation (0.1° per second × 30 = 3°).
    const atZero = computeHandAngles(timeAt(0, 0, 0));
    const atThirty = computeHandAngles(timeAt(0, 0, 30));

    expect(atThirty.minute - atZero.minute).toBeCloseTo(3, 10);
  });

  it("minute hand advances 0.1 degrees per second", () => {
    // The drift term is `second * 0.1`. Over 15 seconds that
    // is 1.5°.
    const atZero = computeHandAngles(timeAt(0, 10, 0));
    const atFifteen = computeHandAngles(timeAt(0, 10, 15));

    expect(atFifteen.minute - atZero.minute).toBeCloseTo(1.5, 10);
  });

  it("hour hand advances continuously with the minute", () => {
    // At exactly 3:00 the hour hand is at 90°. At 3:30 it
    // should have advanced by half an hour's worth of
    // rotation (0.5° per minute × 30 = 15°).
    const atZero = computeHandAngles(timeAt(3, 0, 0));
    const atThirty = computeHandAngles(timeAt(3, 30, 0));

    expect(atThirty.hour - atZero.hour).toBeCloseTo(15, 10);
  });

  it("hour hand advances 0.5 degrees per minute", () => {
    // The drift term is `minute * 0.5`.
    const atZero = computeHandAngles(timeAt(3, 0, 0));
    const atFifteen = computeHandAngles(timeAt(3, 15, 0));

    expect(atFifteen.hour - atZero.hour).toBeCloseTo(7.5, 10);
  });

  it("hour hand advances continuously with the second", () => {
    // The hour hand also carries the second-level drift
    // (1/120° per second). Over 60 seconds that is 0.5°.
    const atZero = computeHandAngles(timeAt(3, 0, 0));
    const atSixty = computeHandAngles(timeAt(3, 0, 60));

    expect(atSixty.hour - atZero.hour).toBeCloseTo(0.5, 10);
  });

  it("hour hand advances 1/120 degree per second", () => {
    // Over 120 seconds that is 1°.
    const atZero = computeHandAngles(timeAt(3, 0, 0));
    const atOneTwenty = computeHandAngles(timeAt(3, 0, 120));

    expect(atOneTwenty.hour - atZero.hour).toBeCloseTo(1, 10);
  });

  it("second hand advances 6 degrees per second", () => {
    const atZero = computeHandAngles(timeAt(0, 0, 0));
    const atFive = computeHandAngles(timeAt(0, 0, 5));

    expect(atFive.second - atZero.second).toBeCloseTo(30, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* Full sweep                                                                 */
/* -------------------------------------------------------------------------- */

describe("computeHandAngles — full sweep", () => {
  it("second hand returns to 0 after a full minute", () => {
    const angles = computeHandAngles(timeAt(0, 0, 60));

    // 60 seconds × 6° = 360°, which as a raw number is 360.
    // `computeHandAngles` is deliberately unwrapped; the
    // component's `useContinuousAngle` hook is what keeps the
    // rotation continuous across the boundary, so the
    // arithmetic is expected to return 360 here.
    expect(angles.second).toBe(360);
  });

  it("minute hand returns to 0 after a full hour", () => {
    const angles = computeHandAngles(timeAt(0, 60, 0));

    expect(angles.minute).toBe(360);
  });

  it("hour hand returns to 0 after 12 hours", () => {
    const angles = computeHandAngles(timeAt(12, 0, 0));

    expect(angles.hour).toBe(0);
  });

  it("hour term vanishes at hour 12 — only drift remains", () => {
    /*
     * `12 % 12 === 0`, so the base hour term contributes 0°
     * regardless of the minute or second values. At
     * `12:60:120` the drift terms contribute
     * `60 * 0.5 + 120 / 120 = 30 + 1 = 31`. The result is
     * exactly what an analog clock shows at 12 o'clock plus
     * an hour's worth of drift — the hand is just past the
     * 12 mark.
     */
    const angles = computeHandAngles(timeAt(12, 60, 120));

    expect(angles.hour).toBeCloseTo(31, 10);
  });

  it("accumulates past 360 when the hour term is nonzero", () => {
    /*
     * At `11:60:120` the base term is `11 * 30 = 330` and
     * the drift terms add `30 + 1 = 31`, for a total of
     * `361`. This is the case that demonstrates the
     * unnormalized contract — the arithmetic does not wrap
     * back to 1, it keeps counting.
     */
    const angles = computeHandAngles(timeAt(11, 60, 120));

    expect(angles.hour).toBeCloseTo(361, 10);
  });

  it("does not normalize angles — outputs may exceed 360", () => {
    /*
     * The arithmetic is deliberately unnormalized. Framer
     * Motion interpolates between the raw numbers it is
     * given, so it does not wrap angles for us: feeding it
     * 354 → 0 would spin the hand backwards through almost a
     * full turn. The component therefore unwraps the angles
     * itself (`useContinuousAngle`), and this function stays
     * a plain, testable formula. Pinning the unnormalized
     * contract prevents a future "cleanup" that would wrap
     * the values here and reintroduce the backwards spin.
     */
    const angles = computeHandAngles(timeAt(11, 60, 120));

    expect(angles.hour).toBeGreaterThan(360);
  });

  it("minute hand can exceed 360 with second drift", () => {
    /*
     * At `:60` minutes the base term is `60 * 6 = 360`. The
     * second drift adds `second * 0.1`. At 30 seconds that
     * is 3, so the total is 363.
     */
    const angles = computeHandAngles(timeAt(0, 60, 30));

    expect(angles.minute).toBeCloseTo(363, 10);
    expect(angles.minute).toBeGreaterThan(360);
  });
});

/* -------------------------------------------------------------------------- */
/* 24-hour clock normalization                                                */
/* -------------------------------------------------------------------------- */

describe("computeHandAngles — 24-hour clock normalization", () => {
  it("maps 13:00 to the same hour angle as 01:00", () => {
    const atOne = computeHandAngles(timeAt(1, 0, 0));
    const atThirteen = computeHandAngles(timeAt(13, 0, 0));

    expect(atOne.hour).toBe(atThirteen.hour);
  });

  it("maps 23:00 to the same hour angle as 11:00", () => {
    const atEleven = computeHandAngles(timeAt(11, 0, 0));
    const atTwentyThree = computeHandAngles(timeAt(23, 0, 0));

    expect(atEleven.hour).toBe(atTwentyThree.hour);
  });

  it("maps 18:30 to the same angle as 06:30", () => {
    /*
     * The normalization applies to the hour term only, not
     * to the minute or second drift — both of which are
     * identical between the two times.
     */
    const atMorning = computeHandAngles(timeAt(6, 30, 15));
    const atEvening = computeHandAngles(timeAt(18, 30, 15));

    expect(atMorning.hour).toBe(atEvening.hour);
    expect(atMorning.minute).toBe(atEvening.minute);
    expect(atMorning.second).toBe(atEvening.second);
  });

  it("hour and minute angles agree between AM and PM", () => {
    for (const h of [0, 1, 3, 6, 9, 11]) {
      const am = computeHandAngles(timeAt(h, 30, 15));
      const pm = computeHandAngles(timeAt(h + 12, 30, 15));

      expect(am.hour).toBe(pm.hour);
      expect(am.minute).toBe(pm.minute);
      expect(am.second).toBe(pm.second);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Monotonicity                                                               */
/* -------------------------------------------------------------------------- */

describe("computeHandAngles — monotonicity", () => {
  it("hour angle is monotonic across a full 12-hour sweep", () => {
    let previous = -Infinity;

    for (let h = 0; h < 12; h += 0.5) {
      const angle = computeHandAngles(timeAt(h, 0, 0)).hour;
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
  });

  it("minute angle is monotonic across a full hour", () => {
    let previous = -Infinity;

    for (let m = 0; m < 60; m += 5) {
      const angle = computeHandAngles(timeAt(0, m, 0)).minute;
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
  });

  it("second angle is monotonic across a full minute", () => {
    let previous = -Infinity;

    for (let s = 0; s < 60; s += 5) {
      const angle = computeHandAngles(timeAt(0, 0, s)).second;
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("computeHandAngles — purity", () => {
  it("does not mutate the input", () => {
    const time = timeAt(3, 30, 45);
    const snapshot = { ...time };

    computeHandAngles(time);

    expect(time).toEqual(snapshot);
  });

  it("is deterministic — same input, same output", () => {
    const time = timeAt(3, 30, 45);

    expect(computeHandAngles(time)).toEqual(
      computeHandAngles(time),
    );
  });

  it("returns a fresh object on every call", () => {
    const time = timeAt(3, 30, 45);
    const a = computeHandAngles(time);
    const b = computeHandAngles(time);

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("returns finite numbers for every hand", () => {
    for (const [h, m, s] of [
      [0, 0, 0],
      [3, 30, 45],
      [12, 0, 0],
      [23, 59, 59],
    ] as const) {
      const angles = computeHandAngles(timeAt(h, m, s));
      expect(Number.isFinite(angles.hour)).toBe(true);
      expect(Number.isFinite(angles.minute)).toBe(true);
      expect(Number.isFinite(angles.second)).toBe(true);
    }
  });
});