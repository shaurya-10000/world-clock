import { describe, expect, it } from "vitest";

import {
  ALL_LOCATIONS,
  MAJOR_LOCATIONS,
  WORLD_LOCATIONS,
  getLocationsByContinent,
  getLocationsByGlobeTier,
  getWorldLocationById,
  getWorldLocationByTimezone,
  type Continent,
  type GlobeTier,
  type WorldLocation,
} from "@/lib/locations";

/**
 * IANA time zone identifier shape.
 *
 * IANA zones come in two forms:
 *   Area/Location                e.g. Europe/London
 *   Area/SubArea/Location        e.g. America/Argentina/Buenos_Aires
 *
 * Segments may contain letters, digits, underscores, hyphens,
 * and plus signs (`Etc/GMT+5`). The area segment must be
 * capitalized (`America`, not `america`) — this catches
 * lowercase typos that would otherwise slip through a looser
 * pattern.
 */
const IANA_TIMEZONE =
  /^[A-Z][A-Za-z]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?$/;

const ALL_CONTINENTS: readonly Continent[] = [
  "north-america",
  "south-america",
  "europe",
  "middle-east",
  "africa",
  "south-asia",
  "east-asia",
  "southeast-asia",
  "central-asia",
  "oceania",
  "indian-ocean",
];

/* -------------------------------------------------------------------------- */
/* WORLD_LOCATIONS                                                            */
/* -------------------------------------------------------------------------- */

describe("WORLD_LOCATIONS", () => {
  it("is non-empty and frozen-friendly", () => {
    expect(WORLD_LOCATIONS.length).toBeGreaterThan(0);
  });

  it("has unique ids across the entire catalog", () => {
    const ids = WORLD_LOCATIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique (city, country) pairs", () => {
    const keys = WORLD_LOCATIONS.map(
      (l) => `${l.city}|${l.country}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has non-empty required string fields on every entry", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(location.id.length).toBeGreaterThan(0);
      expect(location.city.length).toBeGreaterThan(0);
      expect(location.country.length).toBeGreaterThan(0);
      expect(location.timezone.length).toBeGreaterThan(0);
      expect(location.globeTiers.length).toBeGreaterThan(0);
    }
  });

  it("keeps every coordinate inside its valid range", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(Number.isFinite(location.latitude)).toBe(true);
      expect(location.latitude).toBeGreaterThanOrEqual(-90);
      expect(location.latitude).toBeLessThanOrEqual(90);

      expect(Number.isFinite(location.longitude)).toBe(true);
      expect(location.longitude).toBeGreaterThanOrEqual(-180);
      expect(location.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("only uses known continent values", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(ALL_CONTINENTS).toContain(location.continent);
    }
  });

  it("uses IANA-style time zone identifiers", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(
        location.timezone,
        `invalid timezone on ${location.id}: ${location.timezone}`,
      ).toMatch(IANA_TIMEZONE);
    }
  });

  it("uses only known globe tier tags", () => {
    const validTags = new Set([
      "main",
      "capital-international",
      "major",
    ]);

    for (const location of WORLD_LOCATIONS) {
      for (const tag of location.globeTiers) {
        expect(
          validTags.has(tag),
          `unknown tier tag "${tag}" on ${location.id}`,
        ).toBe(true);
      }
    }
  });

  it("has no duplicate tier tags within a single entry", () => {
    for (const location of WORLD_LOCATIONS) {
      const unique = new Set(location.globeTiers);
      expect(unique.size).toBe(location.globeTiers.length);
    }
  });

  it("ids are URL-safe slugs", () => {
    /*
     * The id appears in URLs (drawer state, favorites
     * storage). A capital letter or a space would break
     * `getWorldLocationById` after a URL round-trip.
     */
    for (const location of WORLD_LOCATIONS) {
      expect(location.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* MAJOR_LOCATIONS                                                            */
/* -------------------------------------------------------------------------- */

describe("MAJOR_LOCATIONS", () => {
  it("is the subset of WORLD_LOCATIONS tagged 'main'", () => {
    const expected = WORLD_LOCATIONS.filter((l) =>
      l.globeTiers.includes("main"),
    );

    expect(MAJOR_LOCATIONS).toEqual(expected);
  });

  it("is frozen at runtime", () => {
    expect(Object.isFrozen(MAJOR_LOCATIONS)).toBe(true);
  });

  it("contains only entries that are also in WORLD_LOCATIONS", () => {
    const ids = new Set(WORLD_LOCATIONS.map((l) => l.id));

    for (const location of MAJOR_LOCATIONS) {
      expect(ids.has(location.id)).toBe(true);
    }
  });

  it("is a strict subset — smaller than the full catalog", () => {
    expect(MAJOR_LOCATIONS.length).toBeLessThan(
      WORLD_LOCATIONS.length,
    );
    expect(MAJOR_LOCATIONS.length).toBeGreaterThan(0);
  });

  it("contains no duplicate entries", () => {
    const ids = MAJOR_LOCATIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves catalog order", () => {
    /*
     * The filter preserves order. Consumers that render the
     * major tier expect the same editorial sequence as the
     * catalog.
     */
    let previousIndex = -1;

    for (const location of MAJOR_LOCATIONS) {
      const catalogIndex = WORLD_LOCATIONS.findIndex(
        (l) => l.id === location.id,
      );
      expect(catalogIndex).toBeGreaterThan(previousIndex);
      previousIndex = catalogIndex;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* ALL_LOCATIONS                                                              */
/* -------------------------------------------------------------------------- */

describe("ALL_LOCATIONS", () => {
  it("is the same reference as WORLD_LOCATIONS", () => {
    // Semantic alias — callers may rely on identity for
    // memoization, so this must never become a copy.
    expect(ALL_LOCATIONS).toBe(WORLD_LOCATIONS);
  });
});

/* -------------------------------------------------------------------------- */
/* getLocationsByGlobeTier                                                    */
/* -------------------------------------------------------------------------- */

describe("getLocationsByGlobeTier", () => {
  it.each([
    ["major", MAJOR_LOCATIONS],
    ["all", ALL_LOCATIONS],
  ] as const)(
    "returns the correct list for tier %s",
    (tier, expected) => {
      expect(getLocationsByGlobeTier(tier)).toBe(expected);
    },
  );

  it("returns a list for every declared GlobeTier", () => {
    const tiers: readonly GlobeTier[] = ["major", "all"];

    for (const tier of tiers) {
      expect(
        getLocationsByGlobeTier(tier).length,
      ).toBeGreaterThan(0);
    }
  });

  it("returns the same reference across calls", () => {
    expect(getLocationsByGlobeTier("major")).toBe(
      getLocationsByGlobeTier("major"),
    );
    expect(getLocationsByGlobeTier("all")).toBe(
      getLocationsByGlobeTier("all"),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* getWorldLocationById                                                       */
/* -------------------------------------------------------------------------- */

describe("getWorldLocationById", () => {
  it("finds a known location", () => {
    expect(getWorldLocationById("new-york")?.city).toBe(
      "New York",
    );
    expect(getWorldLocationById("tokyo")?.country).toBe(
      "Japan",
    );
  });

  it("returns undefined for an unknown id", () => {
    expect(
      getWorldLocationById("not-a-real-id"),
    ).toBeUndefined();
  });

  it("returns undefined for an empty id", () => {
    expect(getWorldLocationById("")).toBeUndefined();
  });

  it("resolves every catalogued id", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(getWorldLocationById(location.id)).toBe(
        location,
      );
    }
  });

  it("is case-sensitive", () => {
    /*
     * IDs are slugs; the lookup is exact. A caller that
     * passes `"Tokyo"` (capital T) gets undefined — this is
     * intentional. URL parsing lowercases, so the id shown
     * in the address bar always matches the catalog.
     */
    expect(getWorldLocationById("Tokyo")).toBeUndefined();
    expect(getWorldLocationById("Tokyo")).toBe(
      getWorldLocationById("TOKYO"),
    );
  });

  it("returns the same reference across calls", () => {
    expect(getWorldLocationById("tokyo")).toBe(
      getWorldLocationById("tokyo"),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* getWorldLocationByTimezone                                                 */
/* -------------------------------------------------------------------------- */

describe("getWorldLocationByTimezone", () => {
  it("returns a location for a known time zone", () => {
    expect(
      getWorldLocationByTimezone("America/New_York"),
    ).toBeDefined();
  });

  it("returns undefined for an unknown time zone", () => {
    expect(
      getWorldLocationByTimezone("Mars/Olympus_Mons"),
    ).toBeUndefined();
  });

  it("returns the first-seen location when a zone hosts many cities", () => {
    // `America/New_York` covers New York, Washington D.C.,
    // Boston and Miami. Editorial order puts New York first.
    expect(
      getWorldLocationByTimezone("America/New_York")?.id,
    ).toBe("new-york");
  });

  it("resolves every catalogued time zone", () => {
    for (const location of WORLD_LOCATIONS) {
      const found = getWorldLocationByTimezone(
        location.timezone,
      );

      expect(found).toBeDefined();
      expect(found?.timezone).toBe(location.timezone);
    }
  });

  it("is case-sensitive", () => {
    /*
     * IANA zone identifiers are case-sensitive. A caller
     * that passes `"america/new_york"` gets undefined —
     * matching the IANA spec, and matching the string
     * stored in the catalog.
     */
    expect(
      getWorldLocationByTimezone("america/new_york"),
    ).toBeUndefined();
  });

  it("returns the first-seen location across every time zone", () => {
    /*
     * The lookup map is built by iterating the catalog once
     * and keeping the first entry per zone. This test
     * verifies the invariant independently: for any time
     * zone with multiple entries, the lookup must match
     * the first one in catalog order.
     */
    const firstByZone = new Map<string, WorldLocation>();
    for (const location of WORLD_LOCATIONS) {
      if (!firstByZone.has(location.timezone)) {
        firstByZone.set(location.timezone, location);
      }
    }

    for (const [zone, expected] of firstByZone) {
      expect(getWorldLocationByTimezone(zone)).toBe(expected);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getLocationsByContinent                                                    */
/* -------------------------------------------------------------------------- */

describe("getLocationsByContinent", () => {
  it("returns only locations on the requested continent", () => {
    const europe = getLocationsByContinent("europe");

    expect(europe.length).toBeGreaterThan(0);
    for (const location of europe) {
      expect(location.continent).toBe("europe");
    }
  });

  it("preserves editorial order from WORLD_LOCATIONS", () => {
    const expected = WORLD_LOCATIONS.filter(
      (l) => l.continent === "oceania",
    );

    expect(getLocationsByContinent("oceania")).toEqual(
      expected,
    );
  });

  it("partitions the catalog — every location lands in exactly one continent bucket", () => {
    const totalFromBuckets = ALL_CONTINENTS.reduce(
      (sum, c) => sum + getLocationsByContinent(c).length,
      0,
    );

    expect(totalFromBuckets).toBe(WORLD_LOCATIONS.length);
  });

  it("returns an array for every declared continent", () => {
    for (const continent of ALL_CONTINENTS) {
      expect(
        Array.isArray(getLocationsByContinent(continent)),
      ).toBe(true);
    }
  });

  it("returns a fresh array on every call (not a cached reference)", () => {
    /*
     * `getLocationsByContinent` uses `Array.filter`, which
     * returns a new array. A future refactor to memoize the
     * result would break referential transparency — callers
     * that mutate the returned array would corrupt the
     * cache.
     */
    expect(getLocationsByContinent("europe")).not.toBe(
      getLocationsByContinent("europe"),
    );
  });

  it("preserves WorldLocation references (no copy)", () => {
    const europe = getLocationsByContinent("europe");
    const london = europe.find((l) => l.id === "london");
    const source = WORLD_LOCATIONS.find((l) => l.id === "london");

    expect(london).toBe(source);
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-index consistency                                                    */
/* -------------------------------------------------------------------------- */

describe("cross-index consistency", () => {
  it("every id in MAJOR_LOCATIONS is resolvable via getWorldLocationById", () => {
    for (const location of MAJOR_LOCATIONS) {
      expect(getWorldLocationById(location.id)).toBe(location);
    }
  });

  it("every time zone in the catalog is resolvable", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(
        getWorldLocationByTimezone(location.timezone),
      ).toBeDefined();
    }
  });

  it("getLocationsByGlobeTier('all') has the same length as the catalog", () => {
    expect(getLocationsByGlobeTier("all").length).toBe(
      WORLD_LOCATIONS.length,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* WorldLocation shape (runtime guard)                                        */
/* -------------------------------------------------------------------------- */

describe("WorldLocation shape (runtime guard)", () => {
  it("every entry satisfies the interface at runtime", () => {
    const required: readonly (keyof WorldLocation)[] = [
      "id",
      "city",
      "country",
      "timezone",
      "latitude",
      "longitude",
      "continent",
      "globeTiers",
    ];

    for (const location of WORLD_LOCATIONS) {
      for (const key of required) {
        expect(location).toHaveProperty(key);
      }
    }
  });
});