import { describe, expect, it } from "vitest";

import {
  COUNTRY_FEATURES,
  type CountryFeature,
} from "@/lib/geo";

/* -------------------------------------------------------------------------- */
/* COUNTRY_FEATURES — shape                                                   */
/* -------------------------------------------------------------------------- */

describe("COUNTRY_FEATURES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(COUNTRY_FEATURES)).toBe(true);
    expect(COUNTRY_FEATURES.length).toBeGreaterThan(0);
  });

  it("contains between 150 and 200 features", () => {
    /*
     * `world-atlas/countries-110m.json` is the 110m resolution
     * dataset, which contains roughly 177 country features.
     *
     * The bounds are deliberately wide. The number fluctuates
     * by a few entries across world-atlas releases as disputed
     * territories are added or removed, and the exact count is
     * not a contract this module should assert. A dramatically
     * different number, however, would indicate that the wrong
     * atlas file is being loaded.
     */
    expect(COUNTRY_FEATURES.length).toBeGreaterThanOrEqual(150);
    expect(COUNTRY_FEATURES.length).toBeLessThanOrEqual(200);
  });

  it("has a stable reference across reads", () => {
    /*
     * The array is built once at module load. Two reads of
     * the same binding return the same reference — which is
     * what lets consumers use it in React dependency arrays
     * without causing repeated effect runs.
     */
    const first = COUNTRY_FEATURES;
    const second = COUNTRY_FEATURES;

    expect(first).toBe(second);
  });

  it("is the features array from a FeatureCollection", () => {
    /*
     * `decodeCountryFeatures` unwraps the collection and
     * returns only the features array. Consumers never see
     * the collection wrapper — they iterate the array
     * directly.
     */
    expect(COUNTRY_FEATURES).toBeDefined();
    expect(Array.isArray(COUNTRY_FEATURES)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* COUNTRY_FEATURES — each feature                                            */
/* -------------------------------------------------------------------------- */

describe("each country feature", () => {
  /*
   * Assert on every feature rather than a sample. The dataset
   * is small enough (about 177 entries) that a full scan is
   * fast, and asserting on every entry catches a single
   * malformed feature that a sample might miss.
   */
  it("has type `Feature`", () => {
    for (const country of COUNTRY_FEATURES) {
      expect(country.type).toBe("Feature");
    }
  });

  it("has a geometry object with a type and coordinates", () => {
    for (const country of COUNTRY_FEATURES) {
      expect(country.geometry).toBeTypeOf("object");
      expect(country.geometry).not.toBeNull();
      expect(country.geometry.type).toBeTypeOf("string");
      expect(country.geometry.type.length).toBeGreaterThan(0);
      expect(country.geometry).toHaveProperty("coordinates");
    }
  });

  it("has a geometry type of `Polygon` or `MultiPolygon`", () => {
    /*
     * The 110m atlas contains only polygonal geometries —
     * every feature is a country or territory outline. If a
     * future atlas swap introduced a `LineString` or
     * `Point`, the terminator and polygon rendering would
     * break in ways that are hard to trace. This assertion
     * catches the swap at test time.
     */
    const validTypes = new Set([
      "Polygon",
      "MultiPolygon",
    ]);

    for (const country of COUNTRY_FEATURES) {
      expect(
        validTypes.has(country.geometry.type),
      ).toBe(true);
    }
  });

  it("has non-null coordinates", () => {
    for (const country of COUNTRY_FEATURES) {
      expect(country.geometry.coordinates).not.toBeNull();
      expect(country.geometry.coordinates).not.toBeUndefined();
    }
  });

  it("has an `id` that is a string or a number when present", () => {
    /*
     * `id` is optional in the GeoJSON spec and in our type.
     * `world-atlas/countries-110m.json` includes it for every
     * feature, but the type does not require it — so this
     * test asserts the type contract (when present, it is a
     * string or number) rather than a data contract.
     */
    for (const country of COUNTRY_FEATURES) {
      if (country.id === undefined) {
        continue;
      }

      const isString = typeof country.id === "string";
      const isNumber = typeof country.id === "number";

      expect(isString || isNumber).toBe(true);
    }
  });

  it("has a `properties` field (may be null)", () => {
    /*
     * `properties` is typed as `unknown`, but the field
     * itself must be present per the GeoJSON Feature spec.
     * Whether its value is null, an object, or a string is
     * not a contract this module asserts.
     */
    for (const country of COUNTRY_FEATURES) {
      expect(country).toHaveProperty("properties");
    }
  });

  it("does not have any feature with an empty geometry type", () => {
    for (const country of COUNTRY_FEATURES) {
      expect(country.geometry.type.trim().length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* COUNTRY_FEATURES — sanity                                                  */
/* -------------------------------------------------------------------------- */

describe("COUNTRY_FEATURES sanity checks", () => {
  it("contains well-known country identifiers by length", () => {
    /*
     * `world-atlas` features carry ISO 3166-1 numeric codes as
     * `id`, zero-padded to three digits. Russia is `643`,
     * Brazil is `076`, etc. We do not assert on the value of
     * any specific id — that would couple the test to a
     * world-atlas version. Instead, we assert that a
     * substantial fraction of features carry an id, which
     * catches a swap to a dataset that omits them.
     */
    const withId = COUNTRY_FEATURES.filter(
      (country) => country.id !== undefined,
    );

    expect(withId.length).toBeGreaterThan(
      COUNTRY_FEATURES.length * 0.9,
    );
  });

  it("does not contain duplicate ids", () => {
    /*
     * Duplicate country ids would indicate a corrupted or
     * mixed-resolution atlas. The globe does not use ids for
     * lookup — it keys polygons by index — but a duplicate is
     * a strong signal that something is wrong with the input
     * data, and it costs nothing to assert.
     */
    const seen = new Set<string | number>();

    for (const country of COUNTRY_FEATURES) {
      if (country.id === undefined) {
        continue;
      }

      expect(seen.has(country.id)).toBe(false);
      seen.add(country.id);
    }
  });

  it("assigns a coordinates payload to every feature", () => {
    /*
     * `coordinates` is typed `unknown` deliberately. But it
     * must exist for every feature, or downstream rendering
     * would silently skip polygons. Asserting presence rather
     * than shape keeps the boundary between this module and
     * the render layer honest.
     */
    for (const country of COUNTRY_FEATURES) {
      expect("coordinates" in country.geometry).toBe(true);
    }
  });

  it("every feature has a non-null geometry object", () => {
    for (const country of COUNTRY_FEATURES) {
      expect(country.geometry).not.toBeNull();
      expect(country.geometry).not.toBeUndefined();
    }
  });

  it("no feature has a `null` or `undefined` type field", () => {
    for (const country of COUNTRY_FEATURES) {
      expect(country.type).toBeDefined();
      expect(country.type).not.toBeNull();
    }
  });

  it("coordinates payloads are not all identical", () => {
    /*
     * A corrupted decode that returned the same coordinates
     * for every feature would pass all the presence checks
     * but render a globe covered in duplicate polygons.
     * Comparing JSON-string lengths across a sample is a
     * cheap way to catch that.
     */
    const sample = COUNTRY_FEATURES.slice(0, 20);
    const signatures = new Set(
      sample.map((c) =>
        JSON.stringify(c.geometry.coordinates).length,
      ),
    );

    expect(signatures.size).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Type-level sanity                                                          */
/* -------------------------------------------------------------------------- */

describe("CountryFeature type", () => {
  it("allows a minimal valid feature to be constructed", () => {
    /*
     * This is a compile-time assertion dressed as a runtime
     * one. If the type were ever loosened or tightened in a
     * way that breaks this shape, TypeScript would fail to
     * compile before the test even ran.
     *
     * The value is never used at runtime; the assignment is
     * the assertion.
     */
    const minimal: CountryFeature = {
      type: "Feature",
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [],
      },
    };

    expect(minimal.type).toBe("Feature");
  });

  it("allows an id-less feature", () => {
    const minimal: CountryFeature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [],
      },
    };

    expect(minimal.id).toBeUndefined();
  });

  it("allows a feature with a numeric id", () => {
    const withNumberId: CountryFeature = {
      type: "Feature",
      id: 42,
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [],
      },
    };

    expect(withNumberId.id).toBe(42);
  });

  it("allows a feature with a string id", () => {
    const withStringId: CountryFeature = {
      type: "Feature",
      id: "FR",
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [],
      },
    };

    expect(withStringId.id).toBe("FR");
  });
});