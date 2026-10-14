import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DAWN_START_HOUR,
  DAY_START_HOUR,
  DUSK_START_HOUR,
  NIGHT_START_HOUR,
  getAtmosphere,
  getAtmosphereVisual,
  isTwilight,
  showsStars,
  skyGradientToCss,
  type Atmosphere,
} from "@/lib/atmosphere";

/* -------------------------------------------------------------------------- */
/* Boundary constants                                                         */
/* -------------------------------------------------------------------------- */

describe("hour boundaries", () => {
  it("are ordered dawn < day < dusk < night", () => {
    /*
     * If this ordering is ever violated — say by editing one
     * constant without checking the others — the classifier
     * below will silently return the wrong atmosphere for the
     * affected band. The assertion catches the data-entry
     * mistake.
     */
    expect(DAWN_START_HOUR).toBeLessThan(DAY_START_HOUR);
    expect(DAY_START_HOUR).toBeLessThan(DUSK_START_HOUR);
    expect(DUSK_START_HOUR).toBeLessThan(NIGHT_START_HOUR);
  });

  it("start at 5, 7, 17, and 20", () => {
    expect(DAWN_START_HOUR).toBe(5);
    expect(DAY_START_HOUR).toBe(7);
    expect(DUSK_START_HOUR).toBe(17);
    expect(NIGHT_START_HOUR).toBe(20);
  });

  it("all boundaries are integers in [0, 24)", () => {
    for (const hour of [
      DAWN_START_HOUR,
      DAY_START_HOUR,
      DUSK_START_HOUR,
      NIGHT_START_HOUR,
    ]) {
      expect(Number.isInteger(hour)).toBe(true);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getAtmosphere                                                              */
/* -------------------------------------------------------------------------- */

describe("getAtmosphere", () => {
  describe("each band returns the correct atmosphere", () => {
    it.each([
      [5, "dawn"],
      [5.5, "dawn"],
      [6.99, "dawn"],
      [7, "day"],
      [12, "day"],
      [16.99, "day"],
      [17, "dusk"],
      [19.99, "dusk"],
      [20, "night"],
      [23.5, "night"],
      [0, "night"],
      [4.99, "night"],
    ] as const)(
      "classifies %f as %s",
      (hour, expected) => {
        expect(getAtmosphere(hour)).toBe(expected);
      },
    );
  });

  describe("boundary inclusivity", () => {
    /*
     * Each boundary hour belongs to the *later* band. This is
     * the convention most people expect when they see a range
     * written `[start, end)`.
     */
    it("assigns the start of dawn to dawn", () => {
      expect(getAtmosphere(DAWN_START_HOUR)).toBe("dawn");
    });

    it("assigns the start of day to day, not dawn", () => {
      expect(getAtmosphere(DAY_START_HOUR)).toBe("day");
    });

    it("assigns the start of dusk to dusk, not day", () => {
      expect(getAtmosphere(DUSK_START_HOUR)).toBe("dusk");
    });

    it("assigns the start of night to night, not dusk", () => {
      expect(getAtmosphere(NIGHT_START_HOUR)).toBe("night");
    });

    it("assigns one millisecond before each boundary to the previous band", () => {
      /*
       * The half-open interval `[start, end)` means that a
       * value one epsilon below `start` belongs to the
       * previous band. This is the strictness check on the
       * `>=` comparisons.
       */
      const epsilon = 1e-9;

      expect(getAtmosphere(DAY_START_HOUR - epsilon)).toBe(
        "dawn",
      );
      expect(getAtmosphere(DUSK_START_HOUR - epsilon)).toBe(
        "day",
      );
      expect(getAtmosphere(NIGHT_START_HOUR - epsilon)).toBe(
        "dusk",
      );
      expect(getAtmosphere(DAWN_START_HOUR - epsilon)).toBe(
        "night",
      );
    });
  });

  describe("wrapping — hours outside [0, 24)", () => {
    it("wraps 24 to 0 (night)", () => {
      expect(getAtmosphere(24)).toBe("night");
    });

    it("wraps 25.5 to 1.5 (night)", () => {
      expect(getAtmosphere(25.5)).toBe("night");
    });

    it("wraps 29 to 5 (dawn)", () => {
      expect(getAtmosphere(29)).toBe("dawn");
    });

    it("wraps -1 to 23 (night)", () => {
      expect(getAtmosphere(-1)).toBe("night");
    });

    it("wraps -4 to 20 (night)", () => {
      expect(getAtmosphere(-4)).toBe("night");
    });

    it("wraps -7 to 17 (dusk)", () => {
      expect(getAtmosphere(-7)).toBe("dusk");
    });

    it("wraps -12 to 12 (day)", () => {
      expect(getAtmosphere(-12)).toBe("day");
    });

    it("wraps -19 to 5 (dawn)", () => {
      expect(getAtmosphere(-19)).toBe("dawn");
    });

    it("wraps -24 to 0 (night)", () => {
      expect(getAtmosphere(-24)).toBe("night");
    });

    it("is invariant under ±24h shifts", () => {
      /*
       * Wrapping is a modular reduction. Any two inputs
       * congruent mod 24 must classify identically.
       */
      const hours = [0, 3.5, 6.99, 12, 17, 19.99, 23.5];

      for (const h of hours) {
        const base = getAtmosphere(h);
        expect(getAtmosphere(h + 24)).toBe(base);
        expect(getAtmosphere(h - 24)).toBe(base);
        expect(getAtmosphere(h + 240)).toBe(base);
        expect(getAtmosphere(h - 240)).toBe(base);
      }
    });
  });

  describe("non-finite input", () => {
    it("returns night for NaN", () => {
      /*
       * NaN fails every comparison, so the classifier falls
       * through to the default. That is the intended fallback
       * — an unparseable hour should not throw.
       */
      expect(getAtmosphere(NaN)).toBe("night");
    });

    it("returns night for Infinity", () => {
      /*
       * `Infinity % 24` is NaN, which wraps to NaN, which
       * falls through to night.
       */
      expect(getAtmosphere(Infinity)).toBe("night");
    });

    it("returns night for -Infinity", () => {
      expect(getAtmosphere(-Infinity)).toBe("night");
    });
  });

  describe("continuity", () => {
    it("never returns an unexpected atmosphere value", () => {
      /*
       * Fuzz test: sweep every quarter-hour across a full day
       * (and a wrapped day on each side) and assert that only
       * the four valid values ever appear. This catches typos
       * in the classifier's string returns.
       */
      const valid: readonly Atmosphere[] = [
        "dawn",
        "day",
        "dusk",
        "night",
      ];

      for (let hour = -24; hour <= 48; hour += 0.25) {
        expect(valid).toContain(getAtmosphere(hour));
      }
    });

    it("transitions night → dawn → day → dusk → night in a full sweep", () => {
      /*
       * Walk one full day forward and assert the sequence of
       * distinct atmospheres. This is the ordering contract
       * within a single day: once a band is left, it does
       * not recur until the day wraps.
       *
       * A separate monotonicity test over a day-wide sweep
       * is not meaningful here — the classifier is cyclic,
       * and the sweep necessarily returns to night at hour
       * 20 after having passed through dusk.
       */
      const seen: Atmosphere[] = [];
      let previous: Atmosphere | null = null;

      for (let hour = 0; hour < 24; hour += 0.1) {
        const current = getAtmosphere(hour);

        if (current !== previous) {
          seen.push(current);
          previous = current;
        }
      }

      expect(seen).toEqual([
        "night",
        "dawn",
        "day",
        "dusk",
        "night",
      ]);
    });

    it("never skips a band between two adjacent classifications", () => {
      /*
       * Adjacent samples in a fine-grained sweep must be the
       * same band or a neighbouring band in the day's
       * sequence. This catches a misordered `if` chain that
       * would jump from, say, dawn directly to dusk.
       */
      const adjacency: Record<Atmosphere, readonly Atmosphere[]> = {
        night: ["night", "dawn"],
        dawn: ["night", "dawn", "day"],
        day: ["dawn", "day", "dusk"],
        dusk: ["day", "dusk", "night"],
      };

      let previous = getAtmosphere(0);

      for (let hour = 0.05; hour < 24; hour += 0.05) {
        const current = getAtmosphere(hour);
        expect(adjacency[previous]).toContain(current);
        previous = current;
      }
    });
  });
});

/* -------------------------------------------------------------------------- */
/* getAtmosphereVisual                                                        */
/* -------------------------------------------------------------------------- */

describe("getAtmosphereVisual", () => {
  const atmospheres: readonly Atmosphere[] = [
    "dawn",
    "day",
    "dusk",
    "night",
  ];

  it.each(atmospheres)(
    "returns a complete visual for %s",
    (atmosphere) => {
      const visual = getAtmosphereVisual(atmosphere);

      expect(visual.id).toBe(atmosphere);
      expect(visual.label).toBeTypeOf("string");
      expect(visual.label.length).toBeGreaterThan(0);
      expect(visual.icon).toMatch(/^(sun|cloud-sun|moon)$/);
      expect(visual.iconClass.length).toBeGreaterThan(0);
      expect(visual.accent.length).toBeGreaterThan(0);
      expect(visual.sky.from).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.sky.via).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.sky.to).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.ambient.background).toContain("bg-[");
      expect(visual.ambient.glow).toContain("bg-[");
    },
  );

  it("returns a stable reference across calls", () => {
    /*
     * The visuals table is module-level. Two calls with the
     * same input should return the same object, which lets
     * downstream `useMemo` hooks key on identity rather than
     * value.
     */
    expect(getAtmosphereVisual("day")).toBe(
      getAtmosphereVisual("day"),
    );
  });

  it("returns a stable reference across ALL atmospheres", () => {
    for (const a of atmospheres) {
      expect(getAtmosphereVisual(a)).toBe(
        getAtmosphereVisual(a),
      );
    }
  });

  it("returns different objects for different atmospheres", () => {
    expect(getAtmosphereVisual("dawn")).not.toBe(
      getAtmosphereVisual("day"),
    );
    expect(getAtmosphereVisual("day")).not.toBe(
      getAtmosphereVisual("dusk"),
    );
    expect(getAtmosphereVisual("dusk")).not.toBe(
      getAtmosphereVisual("night"),
    );
  });

  it("gives each atmosphere a distinct id matching its key", () => {
    for (const atmosphere of atmospheres) {
      expect(getAtmosphereVisual(atmosphere).id).toBe(
        atmosphere,
      );
    }
  });

  it("gives each atmosphere a distinct label", () => {
    const labels = atmospheres.map(
      (a) => getAtmosphereVisual(a).label,
    );

    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives each atmosphere a distinct accent class", () => {
    const accents = atmospheres.map(
      (a) => getAtmosphereVisual(a).accent,
    );

    expect(new Set(accents).size).toBe(accents.length);
  });

  it("uses a distinct sky gradient for each atmosphere", () => {
    const signatures = atmospheres.map((a) => {
      const { sky } = getAtmosphereVisual(a);
      return `${sky.from}|${sky.via}|${sky.to}`;
    });

    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("uses a distinct ambient background for each atmosphere", () => {
    const backgrounds = atmospheres.map(
      (a) => getAtmosphereVisual(a).ambient.background,
    );

    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });
});

/* -------------------------------------------------------------------------- */
/* skyGradientToCss                                                           */
/* -------------------------------------------------------------------------- */

describe("skyGradientToCss", () => {
  it("renders a linear-gradient with the three stops in order", () => {
    const css = skyGradientToCss({
      from: "#000000",
      via: "#888888",
      to: "#ffffff",
    });

    expect(css).toBe(
      "linear-gradient(180deg,#000000 0%,#888888 45%,#ffffff 100%)",
    );
  });

  it("emits exactly three color stops", () => {
    /*
     * A regression that accidentally dropped the `via` stop
     * would produce a two-stop gradient that still renders,
     * but with a different visual. Asserting the count catches
     * it.
     */
    const css = skyGradientToCss({
      from: "#aaa",
      via: "#bbb",
      to: "#ccc",
    });

    const matches = css.match(/#[0-9a-f]{3,6}/gi) ?? [];

    expect(matches).toHaveLength(3);
  });

  it("is deterministic — same input, same output", () => {
    const sky = {
      from: "#111",
      via: "#222",
      to: "#333",
    } as const;

    expect(skyGradientToCss(sky)).toBe(skyGradientToCss(sky));
  });

  it("produces a working gradient for every built-in atmosphere", () => {
    const atmospheres: readonly Atmosphere[] = [
      "dawn",
      "day",
      "dusk",
      "night",
    ];

    for (const atmosphere of atmospheres) {
      const visual = getAtmosphereVisual(atmosphere);
      const css = skyGradientToCss(visual.sky);

      expect(css).toMatch(/^linear-gradient\(180deg,/);
      expect(css).toContain(visual.sky.from);
      expect(css).toContain(visual.sky.via);
      expect(css).toContain(visual.sky.to);
    }
  });

  it("preserves the order from → via → to", () => {
    /*
     * If `via` and `to` were swapped, the gradient would
     * still render — but reversed. Assert the index order
     * of the three colors in the output string.
     */
    const css = skyGradientToCss({
      from: "#aaaaaa",
      via: "#bbbbbb",
      to: "#cccccc",
    });

    const iFrom = css.indexOf("#aaaaaa");
    const iVia = css.indexOf("#bbbbbb");
    const iTo = css.indexOf("#cccccc");

    expect(iFrom).toBeLessThan(iVia);
    expect(iVia).toBeLessThan(iTo);
  });
});

/* -------------------------------------------------------------------------- */
/* isTwilight                                                                 */
/* -------------------------------------------------------------------------- */

describe("isTwilight", () => {
  it("returns true for dawn", () => {
    expect(isTwilight("dawn")).toBe(true);
  });

  it("returns true for dusk", () => {
    expect(isTwilight("dusk")).toBe(true);
  });

  it("returns false for day", () => {
    expect(isTwilight("day")).toBe(false);
  });

  it("returns false for night", () => {
    expect(isTwilight("night")).toBe(false);
  });

  it("is exhaustive — every atmosphere returns a boolean", () => {
    const atmospheres: readonly Atmosphere[] = [
      "dawn",
      "day",
      "dusk",
      "night",
    ];

    for (const atmosphere of atmospheres) {
      expect(typeof isTwilight(atmosphere)).toBe("boolean");
    }
  });

  it("classifies exactly two of the four atmospheres as twilight", () => {
    const atmospheres: readonly Atmosphere[] = [
      "dawn",
      "day",
      "dusk",
      "night",
    ];

    const twilights = atmospheres.filter(isTwilight);

    expect(twilights).toHaveLength(2);
    expect(twilights).toEqual(
      expect.arrayContaining(["dawn", "dusk"]),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* showsStars                                                                 */
/* -------------------------------------------------------------------------- */

describe("showsStars", () => {
  it("returns true for dawn", () => {
    expect(showsStars("dawn")).toBe(true);
  });

  it("returns true for dusk", () => {
    expect(showsStars("dusk")).toBe(true);
  });

  it("returns true for night", () => {
    expect(showsStars("night")).toBe(true);
  });

  it("returns false for day", () => {
    expect(showsStars("day")).toBe(false);
  });

  it("complements isTwilight plus night, but not day", () => {
    /*
     * `showsStars` and `isTwilight` are not complements of one
     * another — night shows stars but is not twilight. This
     * test documents that relationship explicitly so a future
     * refactor that tries to derive one from the other will
     * fail loudly.
     */
    expect(showsStars("night")).toBe(true);
    expect(isTwilight("night")).toBe(false);
  });

  it("classifies exactly three of the four atmospheres as star-showing", () => {
    const atmospheres: readonly Atmosphere[] = [
      "dawn",
      "day",
      "dusk",
      "night",
    ];

    const withStars = atmospheres.filter(showsStars);

    expect(withStars).toHaveLength(3);
    expect(withStars).not.toContain("day");
  });

  it("is exactly the complement of day", () => {
    const atmospheres: readonly Atmosphere[] = [
      "dawn",
      "day",
      "dusk",
      "night",
    ];

    for (const a of atmospheres) {
      expect(showsStars(a)).toBe(a !== "day");
    }
  });
});