import { describe, expect, it } from "vitest";

import {
  CITY_FACTS,
  __testableFormatters,
  getCityFactRows,
  type CityFacts,
  type CityFactRow,
} from "@/lib/city-facts";
import { WORLD_LOCATIONS } from "@/lib/locations";

const {
  formatElevation,
  formatArea,
  formatLanguages,
} = __testableFormatters;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function labelsOf(
  rows: readonly CityFactRow[],
): string[] {
  return rows.map((r) => r.label);
}

function findRow(
  rows: readonly CityFactRow[],
  label: string,
): CityFactRow | undefined {
  return rows.find((r) => r.label === label);
}

/* -------------------------------------------------------------------------- */
/* getCityFactRows — missing and empty                                        */
/* -------------------------------------------------------------------------- */

describe("getCityFactRows — missing and empty", () => {
  it("returns an empty array for an unknown location id", () => {
    expect(getCityFactRows("not-a-real-city")).toEqual([]);
  });

  it("returns an empty array for an empty id", () => {
    expect(getCityFactRows("")).toEqual([]);
  });

  it("returns an empty array for a completely unknown string", () => {
    expect(
      getCityFactRows("zzz-not-a-real-city-zzz"),
    ).toEqual([]);
  });

  it("returns a fresh array on every call", () => {
    /*
     * The rows are computed on demand. A future caching
     * refactor would let callers mutate the returned array
     * and corrupt subsequent reads.
     */
    const a = getCityFactRows("tokyo");
    const b = getCityFactRows("tokyo");

    expect(a).not.toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* getCityFactRows — known cities                                             */
/* -------------------------------------------------------------------------- */

describe("getCityFactRows — known cities", () => {
  it("returns rows for Tokyo with the expected labels", () => {
    const rows = getCityFactRows("tokyo");

    expect(labelsOf(rows)).toEqual([
      "Population",
      "Elevation",
      "Area",
      "Currency",
    ]);
  });

  it("returns rows for New York including the currency", () => {
    const rows = getCityFactRows("new-york");

    expect(findRow(rows, "Population")?.value).toBe("8,335,897");
    expect(findRow(rows, "Elevation")?.value).toBe("10 m");
    // New York's area is 783.8 km². Above the 10 km²
    // threshold, `formatArea` uses zero decimals — so 783.8
    // rounds to 784.
    expect(findRow(rows, "Area")?.value).toBe("784 km²");
    expect(findRow(rows, "Currency")?.value).toBe("USD");
  });

  it("omits the Language row when officialLanguages is empty", () => {
    /*
     * The US has no federally designated official language,
     * so `officialLanguages: []`. The row should not appear.
     */
    const rows = getCityFactRows("new-york");

    expect(labelsOf(rows)).not.toContain("Language");
  });

  it("includes the Language row for countries that have one", () => {
    const rows = getCityFactRows("tokyo");
    // Tokyo's entry has `officialLanguages: []` (Japan has
    // no federally designated language). Use London, which
    // has `["en"]`.

    const londonRows = getCityFactRows("london");
    expect(findRow(londonRows, "Language")?.value).toBe(
      "English",
    );

    // Tokyo has no Language row.
    expect(labelsOf(rows)).not.toContain("Language");
  });

  it("preserves the documented row order", () => {
    /*
     * Order is a deliberate contract — population first,
     * then elevation, area, language, currency. A card
     * layout reads top-to-bottom in that order.
     */
    const rows = getCityFactRows("london");
    const labels = labelsOf(rows);

    const order = [
      "Population",
      "Elevation",
      "Area",
      "Language",
      "Currency",
    ];
    const present = order.filter((l) => labels.includes(l));

    expect(labels).toEqual(present);
  });
});

/* -------------------------------------------------------------------------- */
/* getCityFactRows — formatting                                               */
/* -------------------------------------------------------------------------- */

describe("getCityFactRows — formatting", () => {
  it("formats population with thousand separators", () => {
    const rows = getCityFactRows("tokyo");
    const pop = findRow(rows, "Population");

    expect(pop?.value).toMatch(/^[\d,]+$/);
    expect(pop?.value).toContain(",");
  });

  it("formats elevation with a space before the unit", () => {
    const rows = getCityFactRows("london");
    const elevation = findRow(rows, "Elevation");

    expect(elevation?.value).toBe("11 m");
  });

  it("formats area with the km² suffix", () => {
    const rows = getCityFactRows("london");
    const area = findRow(rows, "Area");

    expect(area?.value).toMatch(/km²$/);
  });

  it("uses one decimal for small areas (< 10 km²)", () => {
    /*
     * No catalogued city is under 10 km², so we call
     * `formatArea` directly to exercise the small-value
     * branch.
     */
    expect(formatArea(8.4)).toBe("8.4 km²");
    expect(formatArea(0.5)).toBe("0.5 km²");
  });

  it("uses zero decimals for areas >= 10 km²", () => {
    expect(formatArea(177)).toBe("177 km²");
    expect(formatArea(1_299)).toBe("1,299 km²");
    expect(formatArea(12_367.7)).toBe("12,368 km²");
  });
});

/* -------------------------------------------------------------------------- */
/* formatElevation                                                            */
/* -------------------------------------------------------------------------- */

describe("formatElevation", () => {
  it("renders a positive elevation", () => {
    expect(formatElevation(11)).toBe("11 m");
  });

  it("renders zero without a sign", () => {
    expect(formatElevation(0)).toBe("0 m");
  });

  it("uses the Unicode minus sign for negative values", () => {
    /*
     * U+2212, not U+002D. The Unicode sign is wider and
     * sits at mathematical height. A future refactor that
     * swapped back to the ASCII hyphen would look almost
     * identical in the source but render differently.
     */
    expect(formatElevation(-12)).toBe("−12 m");
    expect(formatElevation(-12)).toContain("\u2212");
    expect(formatElevation(-12)).not.toContain("-");
  });

  it("rounds to the nearest integer", () => {
    expect(formatElevation(1.4)).toBe("1 m");
    expect(formatElevation(1.5)).toBe("2 m");
    /*
     * JS `Math.round` rounds half toward +Infinity, not away
     * from zero — so `-1.5` rounds to `-1`, not `-2`. This
     * is the correct and documented behavior of the
     * formatter; a change to round-half-away-from-zero would
     * need to be a deliberate decision with its own tests.
     */
    expect(formatElevation(-1.5)).toBe("−1 m");
    expect(formatElevation(-1.4)).toBe("−1 m");
  });

  it("rounds −1.5 toward zero (JS Math.round semantics)", () => {
    /*
     * `Math.round(-1.5)` is `-1` in JavaScript — the spec
     * rounds half toward `+Infinity`, not away from zero.
     * This test pins that behavior explicitly so a future
     * refactor that swapped in a round-half-away-from-zero
     * helper would fail here and be forced to consider the
     * consequences for positive half-integers too.
     */
    expect(Math.round(-1.5)).toBe(-1);
    expect(formatElevation(-1.5)).toBe("−1 m");
    expect(formatElevation(-2.5)).toBe("−2 m");
    expect(formatElevation(-0.5)).toBe("0 m");
  });

  it("renders Bangkok's fractional elevation as an integer", () => {
    /*
     * Bangkok is stored as 1.5 m. The formatter rounds to
     * 2 m — fractional elevations are not interesting at
     * the card's precision level.
     */
    expect(formatElevation(1.5)).toBe("2 m");
  });
});

/* -------------------------------------------------------------------------- */
/* formatArea                                                                 */
/* -------------------------------------------------------------------------- */

describe("formatArea", () => {
  it("uses one decimal below the threshold", () => {
    expect(formatArea(0.1)).toBe("0.1 km²");
    expect(formatArea(9.9)).toBe("9.9 km²");
  });

  it("uses zero decimals at and above the threshold", () => {
    expect(formatArea(10)).toBe("10 km²");
    expect(formatArea(100)).toBe("100 km²");
  });

  it("rounds to the nearest integer for large areas", () => {
    expect(formatArea(1_568.7)).toBe("1,569 km²");
    expect(formatArea(12_367.7)).toBe("12,368 km²");
  });

  it("groups thousands with commas", () => {
    expect(formatArea(1_000)).toBe("1,000 km²");
    expect(formatArea(10_000)).toBe("10,000 km²");
  });

  it("always ends with the km² suffix", () => {
    for (const value of [0, 1, 5, 10, 100, 1_000, 10_000]) {
      expect(formatArea(value)).toMatch(/km²$/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* formatLanguages                                                            */
/* -------------------------------------------------------------------------- */

describe("formatLanguages", () => {
  it("returns an empty string for an empty list", () => {
    expect(formatLanguages([])).toBe("");
  });

  it("returns the sole language name for a single code", () => {
    expect(formatLanguages(["en"])).toBe("English");
    expect(formatLanguages(["fr"])).toBe("French");
  });

  it("joins two languages with a comma", () => {
    expect(formatLanguages(["en", "fr"])).toBe(
      "English, French",
    );
  });

  it("collapses three or more languages into '+ N more'", () => {
    /*
     * Singapore has four official languages:
     * ["en", "ms", "zh", "ta"]. The first two are shown;
     * the remaining two are counted.
     */
    expect(formatLanguages(["en", "ms", "zh", "ta"])).toBe(
      "English, Malay + 2 more",
    );
  });

  it("preserves the order of codes", () => {
    expect(formatLanguages(["fr", "en"])).toBe(
      "French, English",
    );
  });

  it("falls back to the uppercased code for unknown codes", () => {
    /*
     * A code with no entry in `LANGUAGE_NAMES` renders as
     * its uppercase form rather than "undefined" or an
     * empty string. This lets a new entry ship before the
     * name map is updated.
     */
    expect(formatLanguages(["xx"])).toBe("XX");
    expect(formatLanguages(["xx", "en"])).toBe("XX, English");
  });

  it("falls back for unknown codes even inside a truncated list", () => {
    expect(formatLanguages(["xx", "yy", "en"])).toBe(
      "XX, YY + 1 more",
    );
  });

  it("handles duplicate codes without collapsing them", () => {
    /*
     * `officialLanguages` is data — if the source lists the
     * same code twice, the formatter reflects that. A
     * deduplication step is the data author's job, not the
     * formatter's.
     */
    expect(formatLanguages(["en", "en"])).toBe(
      "English, English",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* CITY_FACTS table                                                           */
/* -------------------------------------------------------------------------- */

describe("CITY_FACTS table", () => {
  it("is a non-empty object", () => {
    expect(Object.keys(CITY_FACTS).length).toBeGreaterThan(0);
  });

  it("every key is a valid WorldLocation id", () => {
    /*
     * A key that does not match a location renders no card.
     * The mismatch is silent — the row simply never
     * appears. This test catches a typo in the table at
     * build time.
     */
    const validIds = new Set(WORLD_LOCATIONS.map((l) => l.id));

    for (const key of Object.keys(CITY_FACTS)) {
      expect(
        validIds.has(key),
        `CITY_FACTS key "${key}" is not a WorldLocation id`,
      ).toBe(true);
    }
  });

  it("every entry has at least one field", () => {
    /*
     * An empty entry would render nothing but also has no
     * reason to exist — it should be removed rather than
     * left as `{}`.
     */
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      const hasAnyField =
        facts.population !== undefined ||
        facts.elevation !== undefined ||
        facts.area !== undefined ||
        (facts.officialLanguages !== undefined &&
          facts.officialLanguages.length > 0) ||
        facts.currency !== undefined;

      expect(
        hasAnyField,
        `CITY_FACTS["${key}"] has no populated fields`,
      ).toBe(true);
    }
  });

  it("population, when present, is a positive finite number", () => {
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      if (facts.population === undefined) continue;

      expect(
        Number.isFinite(facts.population),
        `${key} population is not finite`,
      ).toBe(true);
      expect(facts.population).toBeGreaterThan(0);
    }
  });

  it("elevation, when present, is a finite number", () => {
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      if (facts.elevation === undefined) continue;

      expect(
        Number.isFinite(facts.elevation),
        `${key} elevation is not finite`,
      ).toBe(true);
    }
  });

  it("area, when present, is a positive finite number", () => {
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      if (facts.area === undefined) continue;

      expect(
        Number.isFinite(facts.area),
        `${key} area is not finite`,
      ).toBe(true);
      expect(facts.area).toBeGreaterThan(0);
    }
  });

  it("currency, when present, is a three-letter uppercase code", () => {
    /*
     * ISO 4217 codes are three letters. The catalog uses
     * the canonical uppercase form. A typo (lowercase,
     * two letters, spaces) would render incorrectly.
     */
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      if (facts.currency === undefined) continue;

      expect(
        facts.currency,
        `${key} currency "${facts.currency}" is not a 3-letter ISO code`,
      ).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("officialLanguages, when present, is an array of strings", () => {
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      if (facts.officialLanguages === undefined) continue;

      expect(
        Array.isArray(facts.officialLanguages),
        `${key} officialLanguages is not an array`,
      ).toBe(true);

      for (const code of facts.officialLanguages) {
        expect(typeof code).toBe("string");
        expect(code.length).toBeGreaterThan(0);
      }
    }
  });

  it("officialLanguages, when present, uses lowercase codes", () => {
    /*
     * ISO 639-1 codes are lowercase. A mixed-case code
     * would fall through `LANGUAGE_NAMES` and render as
     * uppercase letters.
     */
    for (const [key, facts] of Object.entries(CITY_FACTS)) {
      if (facts.officialLanguages === undefined) continue;

      for (const code of facts.officialLanguages) {
        expect(
          code,
          `${key} language code "${code}" should be lowercase`,
        ).toMatch(/^[a-z]{2}$/);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Integration with WORLD_LOCATIONS                                           */
/* -------------------------------------------------------------------------- */

describe("CITY_FACTS × WORLD_LOCATIONS integration", () => {
  it("every entry with a fact table resolves to a location", () => {
    for (const key of Object.keys(CITY_FACTS)) {
      const rows = getCityFactRows(key);
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it("no entry is defined twice with conflicting ids", () => {
    /*
     * Trivially true for an object literal, but pins the
     * shape for a future "merge two tables" refactor.
     */
    const keys = Object.keys(CITY_FACTS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns the empty-array contract for every location with no entry", () => {
    /*
     * The catalog has ~180 locations; the facts table has
     * ~55. Every location NOT in the table must return an
     * empty array, not throw. This is the "no facts" path
     * the UI relies on.
     */
    for (const location of WORLD_LOCATIONS) {
      if (CITY_FACTS[location.id] !== undefined) continue;

      expect(
        getCityFactRows(location.id),
        `${location.id} should have no facts`,
      ).toEqual([]);
    }
  });

  it("every location with an entry produces rows in the documented order", () => {
    const order = [
      "Population",
      "Elevation",
      "Area",
      "Language",
      "Currency",
    ];

    for (const key of Object.keys(CITY_FACTS)) {
      const labels = labelsOf(getCityFactRows(key));
      const expected = order.filter((l) =>
        labels.includes(l),
      );
      expect(labels, key).toEqual(expected);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Type-level sanity                                                          */
/* -------------------------------------------------------------------------- */

describe("CityFacts type", () => {
  it("allows an empty object", () => {
    const empty: CityFacts = {};
    expect(empty).toEqual({});
  });

  it("allows a fully populated object", () => {
    const full: CityFacts = {
      population: 1_000_000,
      elevation: 10,
      area: 500,
      officialLanguages: ["en"],
      currency: "USD",
    };

    expect(full.population).toBe(1_000_000);
  });

  it("allows a partial object", () => {
    const partial: CityFacts = {
      population: 100,
    };

    expect(partial.elevation).toBeUndefined();
  });

  it("allows an empty officialLanguages array", () => {
    const facts: CityFacts = {
      officialLanguages: [],
    };

    expect(facts.officialLanguages).toEqual([]);
  });
});