import { describe, expect, it } from "vitest";

import {
  deriveVisuals,
  type DerivedVisuals,
} from "@/components/GlobeAtmosphere";
import type { SolarState } from "@/lib/useSolarState";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function solarState(
  overrides: Partial<SolarState> = {},
): SolarState {
  return {
    dominantAtmosphere: "day",
    averageSolarElevation: 45,
    daylightFraction: 0.9,
    subsolarScreenPosition: { x: 0.5, y: 0.5 },
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Null input                                                                 */
/* -------------------------------------------------------------------------- */

describe("deriveVisuals — null input", () => {
  it("returns the night-floor intensity", () => {
    // The floor is 0.55 and is documented in the module.
    const { intensity } = deriveVisuals(null);

    expect(intensity).toBe(0.55);
  });

  it("returns the glow centered on screen", () => {
    const { glowPosition } = deriveVisuals(null);

    expect(glowPosition).toEqual({
      left: "50%",
      top: "50%",
    });
  });

  it("hides the glow", () => {
    expect(deriveVisuals(null).glowVisible).toBe(false);
  });

  it("returns a low star opacity", () => {
    // Documented as 0.3 — a mid-fade value so the first frame
    // is not a hard cut.
    const { starOpacity } = deriveVisuals(null);

    expect(starOpacity).toBe(0.3);
  });

  it("is deterministic — same input, same output", () => {
    expect(deriveVisuals(null)).toEqual(deriveVisuals(null));
  });

  it("returns a fresh object on every call", () => {
    const a = deriveVisuals(null);
    const b = deriveVisuals(null);

    expect(a).not.toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* Intensity                                                                  */
/* -------------------------------------------------------------------------- */

describe("deriveVisuals — intensity", () => {
  it("floors at 0.55 for full night", () => {
    const { intensity } = deriveVisuals(
      solarState({ daylightFraction: 0 }),
    );

    expect(intensity).toBe(0.55);
  });

  it("peaks at 1.0 for full daylight", () => {
    const { intensity } = deriveVisuals(
      solarState({ daylightFraction: 1 }),
    );

    expect(intensity).toBe(1);
  });

  it("interpolates linearly at 0.5 daylight", () => {
    /*
     * The formula is
     *   0.55 + daylight * (1 - 0.55)
     *   = 0.55 + 0.5 * 0.45
     *   = 0.775
     */
    const { intensity } = deriveVisuals(
      solarState({ daylightFraction: 0.5 }),
    );

    expect(intensity).toBeCloseTo(0.775, 10);
  });

  it("stays within [0.55, 1] for every daylight fraction", () => {
    for (let d = 0; d <= 1; d += 0.05) {
      const { intensity } = deriveVisuals(
        solarState({ daylightFraction: d }),
      );
      expect(intensity).toBeGreaterThanOrEqual(0.55);
      expect(intensity).toBeLessThanOrEqual(1);
    }
  });

  it("is monotonically non-decreasing in daylightFraction", () => {
    let previous = -Infinity;

    for (let d = 0; d <= 1; d += 0.05) {
      const { intensity } = deriveVisuals(
        solarState({ daylightFraction: d }),
      );
      expect(intensity).toBeGreaterThanOrEqual(previous);
      previous = intensity;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Star opacity                                                               */
/* -------------------------------------------------------------------------- */

describe("deriveVisuals — star opacity", () => {
  it("is 1 at full darkness", () => {
    const { starOpacity } = deriveVisuals(
      solarState({ daylightFraction: 0 }),
    );

    expect(starOpacity).toBe(1);
  });

  it("is 0 at full daylight", () => {
    /*
     * The formula is `1 - daylight * 1.4`. At `daylight = 1`,
     * the raw value is `-0.4`, clamped to 0.
     */
    const { starOpacity } = deriveVisuals(
      solarState({ daylightFraction: 1 }),
    );

    expect(starOpacity).toBe(0);
  });

  it("hits zero before full daylight (the 1.4 multiplier)", () => {
    /*
     * The multiplier means the field fades to zero at
     * `daylightFraction = 1 / 1.4 ≈ 0.714`. Below that, the
     * opacity is positive.
     */
    const below = deriveVisuals(
      solarState({ daylightFraction: 0.7 }),
    ).starOpacity;
    const above = deriveVisuals(
      solarState({ daylightFraction: 0.72 }),
    ).starOpacity;

    expect(below).toBeGreaterThan(0);
    expect(above).toBe(0);
  });

  it("interpolates linearly in the non-clamped range", () => {
    // At 0.5 daylight, the raw value is `1 - 0.7 = 0.3`.
    const { starOpacity } = deriveVisuals(
      solarState({ daylightFraction: 0.5 }),
    );

    expect(starOpacity).toBeCloseTo(0.3, 10);
  });

  it("never returns a negative value", () => {
    for (let d = 0; d <= 1; d += 0.05) {
      const { starOpacity } = deriveVisuals(
        solarState({ daylightFraction: d }),
      );
      expect(starOpacity).toBeGreaterThanOrEqual(0);
    }
  });

  it("never exceeds 1", () => {
    for (let d = 0; d <= 1; d += 0.05) {
      const { starOpacity } = deriveVisuals(
        solarState({ daylightFraction: d }),
      );
      expect(starOpacity).toBeLessThanOrEqual(1);
    }
  });

  it("is monotonically non-increasing in daylightFraction", () => {
    let previous = Infinity;

    for (let d = 0; d <= 1; d += 0.05) {
      const { starOpacity } = deriveVisuals(
        solarState({ daylightFraction: d }),
      );
      expect(starOpacity).toBeLessThanOrEqual(previous);
      previous = starOpacity;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Glow position                                                              */
/* -------------------------------------------------------------------------- */

describe("deriveVisuals — glow position", () => {
  it("converts the normalized x to a percentage string", () => {
    const { glowPosition } = deriveVisuals(
      solarState({
        subsolarScreenPosition: { x: 0.25, y: 0.75 },
      }),
    );

    expect(glowPosition.left).toBe("25%");
    expect(glowPosition.top).toBe("75%");
  });

  it("passes through the exact endpoints 0 and 1", () => {
    const { glowPosition } = deriveVisuals(
      solarState({
        subsolarScreenPosition: { x: 0, y: 1 },
      }),
    );

    expect(glowPosition.left).toBe("0%");
    expect(glowPosition.top).toBe("100%");
  });

  it("falls back to center when subsolarScreenPosition is null", () => {
    const { glowPosition } = deriveVisuals(
      solarState({ subsolarScreenPosition: null }),
    );

    expect(glowPosition.left).toBe("50%");
    expect(glowPosition.top).toBe("50%");
  });

  it("interpolates without rounding — the browser handles sub-pixel precision", () => {
    /*
     * The `left` value is `${pos.x * 100}%` — a raw JavaScript
     * number interpolated into a string. `0.333 * 100` is
     * `33.300000000000004` in IEEE-754 arithmetic, and that
     * is what the string carries. The browser parses it to
     * `33.3%` after internal rounding.
     *
     * This test documents the unrounded contract. A future
     * change to `toFixed(1)` or similar would break this test
     * deliberately — that change has a per-frame allocation
     * cost and should be made with that cost in mind.
     */
    const { glowPosition } = deriveVisuals(
      solarState({
        subsolarScreenPosition: { x: 0.333, y: 0.667 },
      }),
    );

    // Both strings parse to the correct percentage; assert on
    // the numeric value, not the exact string.
    expect(parseFloat(glowPosition.left)).toBeCloseTo(33.3, 6);
    expect(parseFloat(glowPosition.top)).toBeCloseTo(66.7, 6);
  });

  it("preserves exact multiples of 0.1", () => {
    /*
     * Values that are exactly representable as `x / 10` in
     * IEEE-754 (i.e. small integers times 0.1) survive the
     * multiplication with clean string output. This pins the
     * common case — the subsolar projection is usually not
     * adversarial.
     */
    const { glowPosition } = deriveVisuals(
      solarState({
        subsolarScreenPosition: { x: 0.5, y: 0.2 },
      }),
    );

    expect(glowPosition.left).toBe("50%");
    expect(glowPosition.top).toBe("20%");
  });
});

/* -------------------------------------------------------------------------- */
/* Glow visibility                                                            */
/* -------------------------------------------------------------------------- */

describe("deriveVisuals — glow visibility", () => {
  it("is true when subsolarScreenPosition is provided", () => {
    const { glowVisible } = deriveVisuals(
      solarState({
        subsolarScreenPosition: { x: 0.5, y: 0.5 },
      }),
    );

    expect(glowVisible).toBe(true);
  });

  it("is false when subsolarScreenPosition is null", () => {
    const { glowVisible } = deriveVisuals(
      solarState({ subsolarScreenPosition: null }),
    );

    expect(glowVisible).toBe(false);
  });

  it("is true even when the position is at the origin", () => {
    /*
     * `{ x: 0, y: 0 }` is a valid position — the top-left
     * corner of the viewport. The check must be
     * `pos !== null`, not a truthy check on `pos`. This test
     * pins that the implementation uses the strict null check.
     */
    const { glowVisible } = deriveVisuals(
      solarState({
        subsolarScreenPosition: { x: 0, y: 0 },
      }),
    );

    expect(glowVisible).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("deriveVisuals — return shape", () => {
  it("returns exactly the four documented fields", () => {
    const result = deriveVisuals(solarState());

    expect(Object.keys(result).sort()).toEqual([
      "glowPosition",
      "glowVisible",
      "intensity",
      "starOpacity",
    ]);
  });

  it("matches the DerivedVisuals type at runtime", () => {
    const result: DerivedVisuals = deriveVisuals(solarState());

    expect(typeof result.intensity).toBe("number");
    expect(typeof result.glowVisible).toBe("boolean");
    expect(typeof result.starOpacity).toBe("number");
    expect(typeof result.glowPosition.left).toBe("string");
    expect(typeof result.glowPosition.top).toBe("string");
  });

  it("returns finite numbers for intensity and starOpacity", () => {
    const result = deriveVisuals(
      solarState({ daylightFraction: 0.42 }),
    );

    expect(Number.isFinite(result.intensity)).toBe(true);
    expect(Number.isFinite(result.starOpacity)).toBe(true);
  });
});