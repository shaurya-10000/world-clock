import { describe, expect, it } from "vitest";

import {
  generateStarField,
  type StarConfig,
} from "@/lib/starfield";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function opts(
  overrides: Partial<Parameters<typeof generateStarField>[1]> = {},
) {
  return { idPrefix: "test", ...overrides };
}

/* -------------------------------------------------------------------------- */
/* Shape and count                                                            */
/* -------------------------------------------------------------------------- */

describe("generateStarField — shape", () => {
  it("returns exactly `count` stars", () => {
    expect(generateStarField(0, opts())).toHaveLength(0);
    expect(generateStarField(1, opts())).toHaveLength(1);
    expect(generateStarField(50, opts())).toHaveLength(50);
  });

  it("returns an array (not a generator or iterable)", () => {
    const stars = generateStarField(5, opts());
    expect(Array.isArray(stars)).toBe(true);
  });

  it("every star has all six required fields", () => {
    const stars = generateStarField(20, opts());
    const keys: readonly (keyof StarConfig)[] = [
      "id",
      "left",
      "top",
      "size",
      "delay",
      "duration",
    ];

    for (const star of stars) {
      for (const key of keys) {
        expect(star).toHaveProperty(key);
      }
    }
  });

  it("all numeric fields are finite", () => {
    const stars = generateStarField(50, opts());

    for (const star of stars) {
      expect(Number.isFinite(star.left)).toBe(true);
      expect(Number.isFinite(star.top)).toBe(true);
      expect(Number.isFinite(star.size)).toBe(true);
      expect(Number.isFinite(star.delay)).toBe(true);
      expect(Number.isFinite(star.duration)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("generateStarField — determinism", () => {
  it("produces byte-identical results for the same inputs", () => {
    const a = generateStarField(30, opts());
    const b = generateStarField(30, opts());

    expect(a).toEqual(b);
  });

  it("does not call Math.random", () => {
    /*
     * Temporarily replace Math.random with a spy that throws.
     * Any call to it inside the generator will fail this test.
     */
    const original = Math.random;
    Math.random = () => {
      throw new Error("generateStarField must not use Math.random");
    };

    try {
      expect(() => generateStarField(50, opts())).not.toThrow();
    } finally {
      Math.random = original;
    }
  });

  it("produces different ids for different idPrefixes", () => {
    const a = generateStarField(5, opts({ idPrefix: "a" }));
    const b = generateStarField(5, opts({ idPrefix: "b" }));

    /*
     * Positions are index-derived, so the two fields are
     * shape-identical apart from their ids. The ids must
     * differ, and the positions must match.
     */
    expect(a.map((s) => s.id)).not.toEqual(b.map((s) => s.id));
    expect(a[0]?.left).toBe(b[0]?.left);
    expect(a[0]?.top).toBe(b[0]?.top);
    expect(a[0]?.size).toBe(b[0]?.size);
  });

  it("is stable across many calls with the same options", () => {
    const first = generateStarField(20, opts());
    for (let i = 0; i < 5; i++) {
      expect(generateStarField(20, opts())).toEqual(first);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Ids                                                                        */
/* -------------------------------------------------------------------------- */

describe("generateStarField — ids", () => {
  it("prefixes every id with idPrefix and the index", () => {
    const stars = generateStarField(5, opts({ idPrefix: "sky" }));

    expect(stars[0]?.id).toBe("sky-0");
    expect(stars[1]?.id).toBe("sky-1");
    expect(stars[4]?.id).toBe("sky-4");
  });

  it("produces unique ids within a single field", () => {
    const stars = generateStarField(100, opts({ idPrefix: "globe" }));
    const ids = new Set(stars.map((s) => s.id));

    expect(ids.size).toBe(stars.length);
  });

  it("produces non-colliding ids across differently-prefixed fields", () => {
    const sky = generateStarField(50, opts({ idPrefix: "sky" }));
    const globe = generateStarField(50, opts({ idPrefix: "globe" }));

    const skyIds = new Set(sky.map((s) => s.id));
    const globeIds = new Set(globe.map((s) => s.id));

    for (const id of globeIds) {
      expect(skyIds.has(id)).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Position placement                                                         */
/* -------------------------------------------------------------------------- */

describe("generateStarField — placement", () => {
  it("respects leftInset and leftSpan", () => {
    const stars = generateStarField(200, opts({
      leftInset: 10,
      leftSpan: 50,
    }));

    for (const star of stars) {
      expect(star.left).toBeGreaterThanOrEqual(10);
      expect(star.left).toBeLessThan(10 + 50);
    }
  });

  it("respects topInset and topSpan", () => {
    const stars = generateStarField(200, opts({
      topInset: 20,
      topSpan: 40,
    }));

    for (const star of stars) {
      expect(star.top).toBeGreaterThanOrEqual(20);
      expect(star.top).toBeLessThan(20 + 40);
    }
  });

  it("uses the documented default insets and spans", () => {
    // Defaults: leftInset 4, topInset 3, leftSpan 92, topSpan 64.
    const stars = generateStarField(200, opts());

    for (const star of stars) {
      expect(star.left).toBeGreaterThanOrEqual(4);
      expect(star.left).toBeLessThan(96);
      expect(star.top).toBeGreaterThanOrEqual(3);
      expect(star.top).toBeLessThan(67);
    }
  });

  it("spreads stars across the full span (not clustered)", () => {
    // With 200 stars and leftSpan 92, the modulo wraps
    // several times, so we should see positions throughout
    // the range and not just at one end.
    const stars = generateStarField(200, opts());
    const lefts = stars.map((s) => s.left);
    const mid = 4 + 92 / 2;

    const belowMid = lefts.filter((l) => l < mid).length;
    const aboveMid = lefts.filter((l) => l >= mid).length;

    expect(belowMid).toBeGreaterThan(20);
    expect(aboveMid).toBeGreaterThan(20);
  });

  it("positions are integer-valued when insets and spans are integers", () => {
    /*
     * `(index * 37) % leftSpan` is integer arithmetic, so
     * with the default integer insets and spans, `left` and
     * `top` should land on exact integers. This matters for
     * the DOM: an integer CSS percentage avoids sub-pixel
     * positioning artifacts on low-DPI displays.
     */
    const stars = generateStarField(50, opts());

    for (const star of stars) {
      expect(Number.isInteger(star.left)).toBe(true);
      expect(Number.isInteger(star.top)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Size                                                                       */
/* -------------------------------------------------------------------------- */

describe("generateStarField — size", () => {
  it("produces sizes within [minSize, minSize + sizeVariance)", () => {
    const stars = generateStarField(200, opts({
      minSize: 1,
      sizeVariance: 3,
    }));

    for (const star of stars) {
      expect(star.size).toBeGreaterThanOrEqual(1);
      expect(star.size).toBeLessThan(1 + 3);
    }
  });

  it("produces a constant size when sizeVariance is 1", () => {
    // `(index * 7) % 1 === 0` for every index, so every star
    // has size `minSize`.
    const stars = generateStarField(50, opts({
      minSize: 2,
      sizeVariance: 1,
    }));

    for (const star of stars) {
      expect(star.size).toBe(2);
    }
  });

  it("uses the documented default minSize and sizeVariance", () => {
    const stars = generateStarField(50, opts());

    for (const star of stars) {
      expect(star.size).toBeGreaterThanOrEqual(1);
      expect(star.size).toBeLessThan(3);
    }
  });

  it("floors a sizeVariance below 1 to the safe divisor", () => {
    /*
     * Without the floor, `x % 0` would produce `NaN`. The
     * guard in the generator makes any sub-1 value behave as
     * `1` — a constant size, not a broken one.
     */
    const stars = generateStarField(20, opts({
      minSize: 2,
      sizeVariance: 0,
    }));

    for (const star of stars) {
      expect(star.size).toBe(2);
      expect(Number.isNaN(star.size)).toBe(false);
    }
  });

  it("floors a fractional sizeVariance", () => {
    const stars = generateStarField(20, opts({
      minSize: 1,
      sizeVariance: 2.9,
    }));

    for (const star of stars) {
      expect(star.size).toBeGreaterThanOrEqual(1);
      expect(star.size).toBeLessThan(1 + 2);
      expect(Number.isInteger(star.size)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Delay                                                                      */
/* -------------------------------------------------------------------------- */

describe("generateStarField — delay", () => {
  it("cycles delay through 12 distinct values", () => {
    const stars = generateStarField(24, opts({ delayStep: 1 }));

    // index % 12 → 0,1,…,11,0,1,…,11
    expect(stars[0]?.delay).toBe(0);
    expect(stars[11]?.delay).toBe(11);
    expect(stars[12]?.delay).toBe(0);
    expect(stars[23]?.delay).toBe(11);
  });

  it("scales delay by delayStep", () => {
    const stars = generateStarField(3, opts({ delayStep: 0.5 }));

    expect(stars[0]?.delay).toBe(0);
    expect(stars[1]?.delay).toBe(0.5);
    expect(stars[2]?.delay).toBe(1);
  });

  it("is never negative", () => {
    const stars = generateStarField(100, opts());

    for (const star of stars) {
      expect(star.delay).toBeGreaterThanOrEqual(0);
    }
  });

  it("is always a multiple of delayStep", () => {
    const step = 0.28;
    const stars = generateStarField(50, opts({ delayStep: step }));

    for (const star of stars) {
      const quotient = star.delay / step;
      expect(Math.round(quotient)).toBeCloseTo(quotient, 10);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Duration                                                                   */
/* -------------------------------------------------------------------------- */

describe("generateStarField — duration", () => {
  it("is at least baseDuration", () => {
    const stars = generateStarField(100, opts({
      baseDuration: 2,
      durationRange: 3,
    }));

    for (const star of stars) {
      expect(star.duration).toBeGreaterThanOrEqual(2);
    }
  });

  it("stays below baseDuration + durationRange", () => {
    const stars = generateStarField(200, opts({
      baseDuration: 2,
      durationRange: 3,
    }));

    for (const star of stars) {
      expect(star.duration).toBeLessThan(2 + 3);
    }
  });

  it("varies across the field (not constant)", () => {
    const stars = generateStarField(100, opts());
    const uniqueDurations = new Set(
      stars.map((s) => s.duration),
    );

    expect(uniqueDurations.size).toBeGreaterThan(1);
  });

  it("floors a tiny durationRange to the safe divisor", () => {
    /*
     * `Math.round(0.04 * 10) === 0`. Without the floor,
     * `x % 0` produces `NaN`. The guard makes every star
     * have exactly `baseDuration` instead.
     */
    const stars = generateStarField(20, opts({
      baseDuration: 3,
      durationRange: 0.04,
    }));

    for (const star of stars) {
      expect(star.duration).toBe(3);
      expect(Number.isNaN(star.duration)).toBe(false);
    }
  });

  it("floors a zero durationRange to the safe divisor", () => {
    const stars = generateStarField(20, opts({
      baseDuration: 2.5,
      durationRange: 0,
    }));

    for (const star of stars) {
      expect(star.duration).toBe(2.5);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("generateStarField — purity", () => {
  it("does not mutate the options object", () => {
    const options = opts({ leftInset: 10 });
    const before = { ...options };

    generateStarField(50, options);

    expect(options).toEqual(before);
  });

  it("returns a fresh array on every call", () => {
    const a = generateStarField(10, opts());
    const b = generateStarField(10, opts());

    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });

  it("tolerates extra keys in the options object", () => {
    const options = {
      ...opts(),
      unknownKey: "ignored",
    } as Parameters<typeof generateStarField>[1];

    expect(() => generateStarField(10, options)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Both production presets                                                    */
/* -------------------------------------------------------------------------- */

describe("generateStarField — production presets", () => {
  it("SkyAtmosphere-style field is well-formed", () => {
    const stars = generateStarField(60, {
      idPrefix: "sky",
    });

    expect(stars).toHaveLength(60);
    for (const star of stars) {
      expect(star.id.startsWith("sky-")).toBe(true);
      expect(star.left).toBeGreaterThanOrEqual(0);
      expect(star.left).toBeLessThan(100);
      expect(star.top).toBeGreaterThanOrEqual(0);
      expect(star.top).toBeLessThan(100);
    }
  });

  it("GlobeAtmosphere-style field is well-formed", () => {
    const stars = generateStarField(120, {
      idPrefix: "globe",
      leftInset: 2,
      topInset: 2,
      leftSpan: 96,
      topSpan: 96,
      minSize: 1,
      sizeVariance: 2,
      delayStep: 0.4,
      baseDuration: 3.2,
      durationRange: 2.4,
    });

    expect(stars).toHaveLength(120);
    for (const star of stars) {
      expect(star.id.startsWith("globe-")).toBe(true);
      expect(star.left).toBeGreaterThanOrEqual(2);
      expect(star.left).toBeLessThan(98);
      expect(star.top).toBeGreaterThanOrEqual(2);
      expect(star.top).toBeLessThan(98);
    }
  });
});