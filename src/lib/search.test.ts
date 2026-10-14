import { describe, expect, it } from "vitest";

import { WORLD_LOCATIONS } from "@/lib/locations";
import {
  searchLocations,
  searchLocationsSimple,
} from "@/lib/search";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function citiesOf(
  results: readonly { location: { city: string } }[],
): string[] {
  return results.map((r) => r.location.city);
}

function idsOf(
  results: readonly { location: { id: string } }[],
): string[] {
  return results.map((r) => r.location.id);
}

/* -------------------------------------------------------------------------- */
/* Empty and whitespace queries                                               */
/* -------------------------------------------------------------------------- */

describe("searchLocations — empty input", () => {
  it("returns the whole catalog for an empty string", () => {
    const results = searchLocations("");
    expect(results).toHaveLength(WORLD_LOCATIONS.length);
  });

  it("returns the whole catalog for whitespace-only input", () => {
    const results = searchLocations("   \t\n  ");
    expect(results).toHaveLength(WORLD_LOCATIONS.length);
  });

  it("returns the catalog in original order", () => {
    const results = searchLocations("");
    expect(idsOf(results)).toEqual(
      WORLD_LOCATIONS.map((l) => l.id),
    );
  });

  it("assigns a score of 0 to every entry", () => {
    const results = searchLocations("");
    for (const result of results) {
      expect(result.score).toBe(0);
    }
  });

  it("returns a new array on each call", () => {
    expect(searchLocations("")).not.toBe(searchLocations(""));
  });

  it("returns fresh SearchResult objects on each call", () => {
    const a = searchLocations("");
    const b = searchLocations("");

    expect(a[0]).not.toBe(b[0]);
    // But the underlying WorldLocation is the same reference.
    expect(a[0]?.location).toBe(b[0]?.location);
  });
});

/* -------------------------------------------------------------------------- */
/* Exact matches                                                              */
/* -------------------------------------------------------------------------- */

describe("searchLocations — exact matches", () => {
  it("finds an exact city name", () => {
    const results = searchLocations("Tokyo");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.location.city).toBe("Tokyo");
    expect(results[0]?.score).toBe(1000);
  });

  it("finds an exact country name", () => {
    const results = searchLocations("Japan");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.location.country).toBe("Japan");
    expect(results[0]?.score).toBe(900);
  });

  it("finds an exact time zone", () => {
    const results = searchLocations("Asia/Tokyo");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.location.timezone).toBe("Asia/Tokyo");
    expect(results[0]?.score).toBe(850);
  });

  it("is case-insensitive", () => {
    const lower = searchLocations("paris");
    const upper = searchLocations("PARIS");
    const mixed = searchLocations("PaRiS");

    expect(idsOf(lower)).toEqual(idsOf(upper));
    expect(idsOf(lower)).toEqual(idsOf(mixed));
  });

  it("trims surrounding whitespace", () => {
    const trimmed = searchLocations("paris");
    const padded = searchLocations("  paris  ");

    expect(idsOf(padded)).toEqual(idsOf(trimmed));
  });

  it("ranks exact matches above prefix matches", () => {
    const exact = searchLocations("Paris")[0];
    const prefix = searchLocations("Par")[0];

    expect(exact?.score).toBeGreaterThan(prefix?.score ?? 0);
  });

  it("ranks exact city over exact country when both match", () => {
    const results = searchLocations("Singapore");

    expect(results[0]?.location.city).toBe("Singapore");
    expect(results[0]?.score).toBe(1000);
  });

  it("lowercasing is locale-invariant — the Turkish-i case", () => {
    /*
     * On a Turkish locale, `"I".toLocaleLowerCase()` is
     * `"ı"` (dotless i). Using `toLocaleLowerCase` would
     * break this search. `toLowerCase` is invariant, so
     * this query must match.
     */
    const results = searchLocations("ISTANBUL");
    const match = results.find(
      (r) => r.location.id === "istanbul",
    );

    expect(match).toBeDefined();
    expect(match?.score).toBe(1000);
  });
});

/* -------------------------------------------------------------------------- */
/* Prefix matches                                                             */
/* -------------------------------------------------------------------------- */

describe("searchLocations — prefix matches", () => {
  it("finds cities by prefix", () => {
    const results = searchLocations("To");
    const cities = citiesOf(results);

    expect(cities).toContain("Tokyo");
    expect(cities).toContain("Toronto");
  });

  it("prefers shorter city names within the prefix tier", () => {
    const results = searchLocations("To");
    const prefixMatches = results.filter((r) =>
      r.location.city.toLowerCase().startsWith("to"),
    );

    for (let i = 1; i < prefixMatches.length; i++) {
      const previous = prefixMatches[i - 1];
      const current = prefixMatches[i];
      if (!previous || !current) continue;
      expect(previous.score).toBeGreaterThanOrEqual(current.score);
    }
  });

  it("ranks a city prefix match above a country prefix match", () => {
    // "Fra" prefixes both a city ("Frankfurt", tier 700) and
    // a country ("France", tier 600). The city-prefix tier
    // outranks the country-prefix tier by 100 points.
    const results = searchLocations("Fra");
    const frankfurt = results.find(
      (r) => r.location.city === "Frankfurt",
    );
    const france = results.find(
      (r) => r.location.country === "France",
    );

    expect(frankfurt).toBeDefined();
    expect(france).toBeDefined();
    expect(frankfurt?.score).toBeGreaterThan(
      france?.score ?? Number.POSITIVE_INFINITY,
    );
  });

  it("prefix match never falls below the substring tier base", () => {
    /*
     * The length penalty is capped at 99, and the prefix
     * base is 700, so the minimum score for a prefix match
     * is 601 — comfortably above the substring base of 400.
     * This bounds the tier-crossing hazard described in the
     * module header.
     */
    const results = searchLocations("A");
    for (const r of results) {
      if (r.location.city.toLowerCase().startsWith("a")) {
        expect(r.score).toBeGreaterThanOrEqual(601);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Substring matches                                                          */
/* -------------------------------------------------------------------------- */

describe("searchLocations — substring matches", () => {
  it("finds cities by substring", () => {
    const results = searchLocations("York");
    const cities = citiesOf(results);

    expect(cities).toContain("New York");
  });

  it("scores a city substring in the substring tier", () => {
    // "York" is not a prefix of "New York" but appears as a
    // substring inside it, so it lands in the substring-city
    // tier (base 400, minus a length penalty).
    const results = searchLocations("York");
    const nyc = results.find(
      (r) => r.location.city === "New York",
    );

    expect(nyc).toBeDefined();
    expect(nyc?.score).toBeGreaterThanOrEqual(300);
    expect(nyc?.score).toBeLessThan(400);
  });

  it("finds country substrings", () => {
    const results = searchLocations("Republic");
    const countries = results.map((r) => r.location.country);

    expect(countries).toContain(
      "Democratic Republic of the Congo",
    );
  });

  it("does not match an empty query after trim", () => {
    /*
     * `"".startsWith("")` is true, and `"".includes("")` is
     * true — but the empty-query branch returns early, so
     * this case never runs the scoring loop. Guard against
     * a refactor that would remove the early return.
     */
    const results = searchLocations("   ");
    for (const r of results) {
      expect(r.score).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Field precedence                                                           */
/* -------------------------------------------------------------------------- */

describe("searchLocations — field precedence", () => {
  it("ranks city matches above country matches above time zone matches", () => {
    const japanResults = searchLocations("Japan");
    const asiaResults = searchLocations("Asia");

    expect(japanResults[0]?.location.country).toBe("Japan");
    expect(japanResults[0]?.score).toBe(900);

    expect(asiaResults.length).toBeGreaterThan(0);
    for (const result of asiaResults) {
      expect(
        result.location.timezone.toLowerCase(),
      ).toContain("asia");
    }
  });

  it("surfaces country matches when no city matches exist", () => {
    const results = searchLocations("Ireland");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.location.country).toBe("Ireland");
  });

  it("surfaces a city prefix match when the query only prefixes a city", () => {
    const results = searchLocations("Kuala");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.location.city).toBe("Kuala Lumpur");
    expect(results[0]?.score).toBeGreaterThanOrEqual(600);
    expect(results[0]?.score).toBeLessThan(700);
  });
});

/* -------------------------------------------------------------------------- */
/* Ordering and stability                                                     */
/* -------------------------------------------------------------------------- */

describe("searchLocations — ordering", () => {
  it("sorts results by descending score", () => {
    const results = searchLocations("a");

    for (let i = 1; i < results.length; i++) {
      const previous = results[i - 1];
      const current = results[i];
      if (!previous || !current) continue;
      expect(previous.score).toBeGreaterThanOrEqual(current.score);
    }
  });

  it("breaks score ties by alphabetical city name", () => {
    const results = searchLocations("a");

    let i = 0;
    while (i < results.length) {
      const start = results[i];
      if (!start) break;

      let j = i;
      while (
        j < results.length &&
        results[j]?.score === start.score
      ) {
        j++;
      }

      const tied = results.slice(i, j);
      const cities = citiesOf(tied);
      const sorted = [...cities].sort((a, b) =>
        a.localeCompare(b),
      );

      expect(cities).toEqual(sorted);
      i = j;
    }
  });

  it("produces the same order across repeated calls", () => {
    const first = searchLocations("san");
    const second = searchLocations("san");

    expect(idsOf(first)).toEqual(idsOf(second));
  });

  it("is stable — equal-score, equal-city entries preserve catalog order", () => {
    /*
     * `Array.prototype.sort` has been stable since ES2019.
     * Two locations with the same city name and the same
     * score must come out in catalog order.
     */
    const results = searchLocations("San");
    const sanCities = results.filter((r) =>
      r.location.city.toLowerCase().startsWith("san"),
    );

    for (let i = 1; i < sanCities.length; i++) {
      const prev = sanCities[i - 1];
      const curr = sanCities[i];
      if (!prev || !curr) continue;
      if (prev.score === curr.score) {
        // Same score means same-city-name length tier;
        // catalog order must hold.
        const prevCatalogIndex = WORLD_LOCATIONS.findIndex(
          (l) => l.id === prev.location.id,
        );
        const currCatalogIndex = WORLD_LOCATIONS.findIndex(
          (l) => l.id === curr.location.id,
        );
        expect(prevCatalogIndex).toBeLessThan(currCatalogIndex);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* No matches                                                                 */
/* -------------------------------------------------------------------------- */

describe("searchLocations — no matches", () => {
  it("returns an empty array for a query with no matches", () => {
    const results = searchLocations("zzzzzzzzz-not-a-real-place");
    expect(results).toEqual([]);
  });

  it("does not include zero-score entries", () => {
    const results = searchLocations("a");
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Result shape                                                               */
/* -------------------------------------------------------------------------- */

describe("searchLocations — result shape", () => {
  it("wraps every match in a SearchResult object", () => {
    const results = searchLocations("Tokyo");

    for (const result of results) {
      expect(result).toHaveProperty("location");
      expect(result).toHaveProperty("score");
      expect(typeof result.score).toBe("number");
    }
  });

  it("preserves the WorldLocation reference (no copy)", () => {
    const results = searchLocations("Tokyo");
    const match = results.find(
      (r) => r.location.id === "tokyo",
    );
    const source = WORLD_LOCATIONS.find(
      (l) => l.id === "tokyo",
    );

    expect(match?.location).toBe(source);
  });
});

/* -------------------------------------------------------------------------- */
/* searchLocationsSimple                                                      */
/* -------------------------------------------------------------------------- */

describe("searchLocationsSimple", () => {
  it("returns only location objects, without scores", () => {
    const results = searchLocationsSimple("Tokyo");

    for (const result of results) {
      expect(result).not.toHaveProperty("score");
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("city");
    }
  });

  it("produces the same ordering as searchLocations", () => {
    const full = searchLocations("san");
    const simple = searchLocationsSimple("san");

    expect(simple.map((l) => l.id)).toEqual(idsOf(full));
  });

  it("handles empty queries the same way as the full search", () => {
    const simple = searchLocationsSimple("");
    expect(simple).toHaveLength(WORLD_LOCATIONS.length);
  });

  it("preserves the WorldLocation reference (no copy)", () => {
    const simple = searchLocationsSimple("Tokyo");
    const match = simple.find((l) => l.id === "tokyo");
    const source = WORLD_LOCATIONS.find(
      (l) => l.id === "tokyo",
    );

    expect(match).toBe(source);
  });
});

/* -------------------------------------------------------------------------- */
/* Continuity                                                                 */
/* -------------------------------------------------------------------------- */

describe("searchLocations — continuity", () => {
  it("narrows monotonically as the query grows", () => {
    const broad = new Set(idsOf(searchLocations("Tok")));
    const narrow = idsOf(searchLocations("Toky"));

    for (const id of narrow) {
      expect(broad.has(id)).toBe(true);
    }
  });

  it("does not throw on unusual input", () => {
    const weird = [
      "\u0000",
      "🙂",
      "\t\t",
      "'",
      '"',
      "\\",
      "\\/",
      "….…",
      "東京",
    ];

    for (const query of weird) {
      expect(() => searchLocations(query)).not.toThrow();
    }
  });

  it("does not throw on very long input", () => {
    const long = "a".repeat(10_000);

    expect(() => searchLocations(long)).not.toThrow();
  });

  it("handles Unicode combining characters without crashing", () => {
    /*
     * Combining diacritics on a normal character do not
     * throw — but they also do not match "é" against "e".
     * This test pins the current behavior: no crash.
     */
    const results = searchLocations("e\u0301");

    expect(Array.isArray(results)).toBe(true);
  });
});