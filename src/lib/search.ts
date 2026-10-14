/**
 * Location search.
 *
 * Single ranking algorithm shared by every search surface:
 * the Cities drawer and the Time Zone section's search field.
 *
 * The scoring scheme is deliberately coarse-grained:
 *   - exact matches outrank prefix matches,
 *   - prefix matches outrank substring matches,
 *   - within each tier, city outranks country outranks time
 *     zone.
 *
 * Within a tier, shorter strings win — so "Paris" outranks
 * "Paris, Texas" for the query "paris".
 *
 * ## Locale independence
 *
 * Matching uses `String.prototype.toLowerCase()`, not
 * `toLocaleLowerCase()`. The locale-sensitive variant is
 * wrong for this use case: on a browser whose default locale
 * is Turkish, `"I".toLocaleLowerCase()` is `"ı"` (dotless
 * i), so a search for `"istanbul"` would fail to match the
 * city `"Istanbul"`. Locale-invariant lowering keeps search
 * deterministic across every environment the app runs in.
 *
 * The tiebreaker sort still uses `localeCompare`, which is
 * intentionally locale-aware — see `searchLocations` below.
 */

import {
  WORLD_LOCATIONS,
  type WorldLocation,
} from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SearchResult {
  readonly location: WorldLocation;
  readonly score: number;
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Score tiers. The three-hundred-point gap between tier bases
 * guarantees that any match in a higher tier outranks any
 * match in a lower tier, no matter how long the strings are.
 *
 * The length-based tiebreaker within a tier is capped at 99
 * so it can never cross a tier boundary.
 */

const SCORE_EXACT_CITY = 1000;
const SCORE_EXACT_COUNTRY = 900;
const SCORE_EXACT_TIMEZONE = 850;
const SCORE_PREFIX_CITY = 700;
const SCORE_PREFIX_COUNTRY = 600;
const SCORE_PREFIX_TIMEZONE = 500;
const SCORE_SUBSTRING_CITY = 400;
const SCORE_SUBSTRING_COUNTRY = 300;
const SCORE_SUBSTRING_TIMEZONE = 200;

/**
 * Largest length penalty applied within a tier. Chosen so a
 * prefix match (700) can never fall below the substring tier
 * base (400): `700 − 99 === 601 > 400`.
 */
const MAX_LENGTH_PENALTY = 99;

/**
 * Score a single location against a normalized (lowercase,
 * trimmed) query. Higher is better; `0` means "no match".
 *
 * The function is pure — same inputs, same output, no side
 * effects — so it can be memoized or fuzzed without surprises.
 *
 * `toLowerCase` is deliberately the locale-invariant form.
 * See the module header for why.
 */
function scoreLocation(
  location: WorldLocation,
  normalized: string,
): number {
  const city = location.city.toLowerCase();
  const country = location.country.toLowerCase();
  const timezone = location.timezone.toLowerCase();

  /* Exact matches. */
  if (city === normalized) return SCORE_EXACT_CITY;
  if (country === normalized) return SCORE_EXACT_COUNTRY;
  if (timezone === normalized) return SCORE_EXACT_TIMEZONE;

  /* Prefix matches. */
  if (city.startsWith(normalized)) {
    return (
      SCORE_PREFIX_CITY - Math.min(city.length, MAX_LENGTH_PENALTY)
    );
  }
  if (country.startsWith(normalized)) {
    return (
      SCORE_PREFIX_COUNTRY -
      Math.min(country.length, MAX_LENGTH_PENALTY)
    );
  }
  if (timezone.startsWith(normalized)) {
    return (
      SCORE_PREFIX_TIMEZONE -
      Math.min(timezone.length, MAX_LENGTH_PENALTY)
    );
  }

  /* Substring matches. */
  if (city.includes(normalized)) {
    return (
      SCORE_SUBSTRING_CITY - Math.min(city.length, MAX_LENGTH_PENALTY)
    );
  }
  if (country.includes(normalized)) {
    return (
      SCORE_SUBSTRING_COUNTRY -
      Math.min(country.length, MAX_LENGTH_PENALTY)
    );
  }
  if (timezone.includes(normalized)) {
    return (
      SCORE_SUBSTRING_TIMEZONE -
      Math.min(timezone.length, MAX_LENGTH_PENALTY)
    );
  }

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Search the location catalog.
 *
 * An empty or whitespace-only query returns every location in
 * catalog order with `score: 0`. Used by the search dropdown
 * to show "everything" before the user has typed, and by the
 * Cities drawer as its default listing.
 *
 * The returned array is fresh on every call; the underlying
 * `WorldLocation` objects are shared and immutable.
 *
 * ## Normalization
 *
 * The query is trimmed and lowercased with the locale-invariant
 * `toLowerCase()`. Both the query and each location's fields
 * are normalized the same way, so the comparison is
 * deterministic regardless of the host environment's locale.
 *
 * ## Sorting
 *
 * Results are sorted by descending score, then alphabetically
 * by city using `localeCompare`. The tiebreaker is
 * intentionally locale-aware — a user in France expects `"É"`
 * to sort near `"E"`, not after `"Z"`. `Array.prototype.sort`
 * has been stable since ES2019, so equal-score, equal-city
 * entries retain their catalog order.
 */
export function searchLocations(
  query: string,
): readonly SearchResult[] {
  const normalized = query.trim().toLowerCase();

  if (normalized.length === 0) {
    return WORLD_LOCATIONS.map((location) => ({
      location,
      score: 0,
    }));
  }

  const results: SearchResult[] = [];

  for (const location of WORLD_LOCATIONS) {
    const score = scoreLocation(location, normalized);

    if (score > 0) {
      results.push({ location, score });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.location.city.localeCompare(b.location.city);
  });

  return results;
}

/**
 * Convenience wrapper returning only the location objects,
 * for consumers that don't need the score.
 */
export function searchLocationsSimple(
  query: string,
): readonly WorldLocation[] {
  return searchLocations(query).map((result) => result.location);
}