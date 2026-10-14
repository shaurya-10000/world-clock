/**
 * World location catalog — the single source of truth for every
 * city the application knows about.
 *
 * Every surface (globe, Cities drawer, Time Zone search) reads
 * from here. Locations are grouped by continent in editorial
 * order; that order is what the Cities drawer renders when the
 * search query is empty, so reordering the file reorders the
 * drawer.
 *
 * Coordinates are WGS84 decimal degrees (latitude +north,
 * longitude +east). They feed the solar-elevation math and the
 * terminator shader, so ~0.01° accuracy matters.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Internal tier tags stored on each location's `globeTiers`
 * array. Distinct from `GlobeTier`, which is the publicly
 * selectable mode set.
 */
export type GlobeTierTag =
  | "main"
  | "capital-international"
  | "major";

/**
 * Publicly selectable globe modes:
 *   - `"major"` — the 48-city curated set (internal `"main"`).
 *   - `"all"`   — every location in the catalog.
 */
export type GlobeTier = "major" | "all";

export type Continent =
  | "north-america"
  | "south-america"
  | "europe"
  | "middle-east"
  | "africa"
  | "south-asia"
  | "east-asia"
  | "southeast-asia"
  | "central-asia"
  | "oceania"
  | "indian-ocean";

export interface WorldLocation {
  /** Stable, URL-safe identifier. Unique across the catalog. */
  readonly id: string;

  /** Display name of the city. */
  readonly city: string;

  /** Display name of the country or territory. */
  readonly country: string;

  /** IANA time zone identifier, e.g. `"America/New_York"`. */
  readonly timezone: string;

  /** Latitude in decimal degrees, `[-90, 90]`. */
  readonly latitude: number;

  /** Longitude in decimal degrees, `[-180, 180]`. */
  readonly longitude: number;

  /** Continent the location belongs to. */
  readonly continent: Continent;

  /**
   * Internal tier tags — any subset of `GlobeTierTag`.
   * See `GlobeTierTag` for the relationship to public tiers.
   */
  readonly globeTiers: readonly GlobeTierTag[];
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

export const WORLD_LOCATIONS: readonly WorldLocation[] = [
  /* ── North America ─────────────────────────────────────────── */

  {
    id: "new-york",
    city: "New York",
    country: "United States",
    timezone: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "washington-dc",
    city: "Washington, D.C.",
    country: "United States",
    timezone: "America/New_York",
    latitude: 38.9072,
    longitude: -77.0369,
    continent: "north-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "boston",
    city: "Boston",
    country: "United States",
    timezone: "America/New_York",
    latitude: 42.3601,
    longitude: -71.0589,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "miami",
    city: "Miami",
    country: "United States",
    timezone: "America/New_York",
    latitude: 25.7617,
    longitude: -80.1918,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "atlanta",
    city: "Atlanta",
    country: "United States",
    timezone: "America/New_York",
    latitude: 33.749,
    longitude: -84.388,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "chicago",
    city: "Chicago",
    country: "United States",
    timezone: "America/Chicago",
    latitude: 41.8781,
    longitude: -87.6298,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "dallas",
    city: "Dallas",
    country: "United States",
    timezone: "America/Chicago",
    latitude: 32.7767,
    longitude: -96.797,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "houston",
    city: "Houston",
    country: "United States",
    timezone: "America/Chicago",
    latitude: 29.7604,
    longitude: -95.3698,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "denver",
    city: "Denver",
    country: "United States",
    timezone: "America/Denver",
    latitude: 39.7392,
    longitude: -104.9903,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "phoenix",
    city: "Phoenix",
    country: "United States",
    timezone: "America/Phoenix",
    latitude: 33.4484,
    longitude: -112.074,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "los-angeles",
    city: "Los Angeles",
    country: "United States",
    timezone: "America/Los_Angeles",
    latitude: 34.0522,
    longitude: -118.2437,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "san-francisco",
    city: "San Francisco",
    country: "United States",
    timezone: "America/Los_Angeles",
    latitude: 37.7749,
    longitude: -122.4194,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "seattle",
    city: "Seattle",
    country: "United States",
    timezone: "America/Los_Angeles",
    latitude: 47.6062,
    longitude: -122.3321,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "honolulu",
    city: "Honolulu",
    country: "United States",
    timezone: "Pacific/Honolulu",
    latitude: 21.3099,
    longitude: -157.8581,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "anchorage",
    city: "Anchorage",
    country: "United States",
    timezone: "America/Anchorage",
    latitude: 61.2181,
    longitude: -149.9003,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "toronto",
    city: "Toronto",
    country: "Canada",
    timezone: "America/Toronto",
    latitude: 43.6532,
    longitude: -79.3832,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "montreal",
    city: "Montreal",
    country: "Canada",
    timezone: "America/Toronto",
    latitude: 45.5017,
    longitude: -73.5673,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "vancouver",
    city: "Vancouver",
    country: "Canada",
    timezone: "America/Vancouver",
    latitude: 49.2827,
    longitude: -123.1207,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "ottawa",
    city: "Ottawa",
    country: "Canada",
    timezone: "America/Toronto",
    latitude: 45.4215,
    longitude: -75.6972,
    continent: "north-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "mexico-city",
    city: "Mexico City",
    country: "Mexico",
    timezone: "America/Mexico_City",
    latitude: 19.4326,
    longitude: -99.1332,
    continent: "north-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "guadalajara",
    city: "Guadalajara",
    country: "Mexico",
    timezone: "America/Mexico_City",
    latitude: 20.6597,
    longitude: -103.3496,
    continent: "north-america",
    globeTiers: ["major"],
  },
  {
    id: "panama-city",
    city: "Panama City",
    country: "Panama",
    timezone: "America/Panama",
    latitude: 8.9824,
    longitude: -79.5199,
    continent: "north-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "havana",
    city: "Havana",
    country: "Cuba",
    timezone: "America/Havana",
    latitude: 23.1136,
    longitude: -82.3666,
    continent: "north-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "san-jose-costa-rica",
    city: "San José",
    country: "Costa Rica",
    timezone: "America/Costa_Rica",
    latitude: 9.9281,
    longitude: -84.0907,
    continent: "north-america",
    globeTiers: ["capital-international", "major"],
  },

  /* ── South America ─────────────────────────────────────────── */

  {
    id: "sao-paulo",
    city: "São Paulo",
    country: "Brazil",
    timezone: "America/Sao_Paulo",
    latitude: -23.5505,
    longitude: -46.6333,
    continent: "south-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "brasilia",
    city: "Brasília",
    country: "Brazil",
    timezone: "America/Sao_Paulo",
    latitude: -15.7939,
    longitude: -47.8828,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "rio-de-janeiro",
    city: "Rio de Janeiro",
    country: "Brazil",
    timezone: "America/Sao_Paulo",
    latitude: -22.9068,
    longitude: -43.1729,
    continent: "south-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "buenos-aires",
    city: "Buenos Aires",
    country: "Argentina",
    timezone: "America/Argentina/Buenos_Aires",
    latitude: -34.6037,
    longitude: -58.3816,
    continent: "south-america",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "santiago",
    city: "Santiago",
    country: "Chile",
    timezone: "America/Santiago",
    latitude: -33.4489,
    longitude: -70.6693,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "lima",
    city: "Lima",
    country: "Peru",
    timezone: "America/Lima",
    latitude: -12.0464,
    longitude: -77.0428,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "bogota",
    city: "Bogotá",
    country: "Colombia",
    timezone: "America/Bogota",
    latitude: 4.711,
    longitude: -74.0721,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "caracas",
    city: "Caracas",
    country: "Venezuela",
    timezone: "America/Caracas",
    latitude: 10.4806,
    longitude: -66.9036,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "quito",
    city: "Quito",
    country: "Ecuador",
    timezone: "America/Guayaquil",
    latitude: -0.1807,
    longitude: -78.4678,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "montevideo",
    city: "Montevideo",
    country: "Uruguay",
    timezone: "America/Montevideo",
    latitude: -34.9011,
    longitude: -56.1645,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "asuncion",
    city: "Asunción",
    country: "Paraguay",
    timezone: "America/Asuncion",
    latitude: -25.2637,
    longitude: -57.5759,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "la-paz",
    city: "La Paz",
    country: "Bolivia",
    timezone: "America/La_Paz",
    latitude: -16.4897,
    longitude: -68.1193,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "georgetown",
    city: "Georgetown",
    country: "Guyana",
    timezone: "America/Guyana",
    latitude: 6.8013,
    longitude: -58.1551,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "paramaribo",
    city: "Paramaribo",
    country: "Suriname",
    timezone: "America/Paramaribo",
    latitude: 5.852,
    longitude: -55.2038,
    continent: "south-america",
    globeTiers: ["capital-international", "major"],
  },

  /* ── Europe ────────────────────────────────────────────────── */

  {
    id: "london",
    city: "London",
    country: "United Kingdom",
    timezone: "Europe/London",
    latitude: 51.5074,
    longitude: -0.1278,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "dublin",
    city: "Dublin",
    country: "Ireland",
    timezone: "Europe/Dublin",
    latitude: 53.3498,
    longitude: -6.2603,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "paris",
    city: "Paris",
    country: "France",
    timezone: "Europe/Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "brussels",
    city: "Brussels",
    country: "Belgium",
    timezone: "Europe/Brussels",
    latitude: 50.8503,
    longitude: 4.3517,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "amsterdam",
    city: "Amsterdam",
    country: "Netherlands",
    timezone: "Europe/Amsterdam",
    latitude: 52.3676,
    longitude: 4.9041,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "luxembourg",
    city: "Luxembourg",
    country: "Luxembourg",
    timezone: "Europe/Luxembourg",
    latitude: 49.6116,
    longitude: 6.1319,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "berlin",
    city: "Berlin",
    country: "Germany",
    timezone: "Europe/Berlin",
    latitude: 52.52,
    longitude: 13.405,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "frankfurt",
    city: "Frankfurt",
    country: "Germany",
    timezone: "Europe/Berlin",
    latitude: 50.1109,
    longitude: 8.6821,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "zurich",
    city: "Zurich",
    country: "Switzerland",
    timezone: "Europe/Zurich",
    latitude: 47.3769,
    longitude: 8.5417,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "vienna",
    city: "Vienna",
    country: "Austria",
    timezone: "Europe/Vienna",
    latitude: 48.2082,
    longitude: 16.3738,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "prague",
    city: "Prague",
    country: "Czech Republic",
    timezone: "Europe/Prague",
    latitude: 50.0755,
    longitude: 14.4378,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "warsaw",
    city: "Warsaw",
    country: "Poland",
    timezone: "Europe/Warsaw",
    latitude: 52.2297,
    longitude: 21.0122,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "budapest",
    city: "Budapest",
    country: "Hungary",
    timezone: "Europe/Budapest",
    latitude: 47.4979,
    longitude: 19.0402,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "bratislava",
    city: "Bratislava",
    country: "Slovakia",
    timezone: "Europe/Bratislava",
    latitude: 48.1486,
    longitude: 17.1077,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "bucharest",
    city: "Bucharest",
    country: "Romania",
    timezone: "Europe/Bucharest",
    latitude: 44.4268,
    longitude: 26.1025,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "sofia",
    city: "Sofia",
    country: "Bulgaria",
    timezone: "Europe/Sofia",
    latitude: 42.6977,
    longitude: 23.3219,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "athens",
    city: "Athens",
    country: "Greece",
    timezone: "Europe/Athens",
    latitude: 37.9838,
    longitude: 23.7275,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "rome",
    city: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "milan",
    city: "Milan",
    country: "Italy",
    timezone: "Europe/Rome",
    latitude: 45.4642,
    longitude: 9.19,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "madrid",
    city: "Madrid",
    country: "Spain",
    timezone: "Europe/Madrid",
    latitude: 40.4168,
    longitude: -3.7038,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "barcelona",
    city: "Barcelona",
    country: "Spain",
    timezone: "Europe/Madrid",
    latitude: 41.3874,
    longitude: 2.1686,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "lisbon",
    city: "Lisbon",
    country: "Portugal",
    timezone: "Europe/Lisbon",
    latitude: 38.7223,
    longitude: -9.1393,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "copenhagen",
    city: "Copenhagen",
    country: "Denmark",
    timezone: "Europe/Copenhagen",
    latitude: 55.6761,
    longitude: 12.5683,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "stockholm",
    city: "Stockholm",
    country: "Sweden",
    timezone: "Europe/Stockholm",
    latitude: 59.3293,
    longitude: 18.0686,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "oslo",
    city: "Oslo",
    country: "Norway",
    timezone: "Europe/Oslo",
    latitude: 59.9139,
    longitude: 10.7522,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "helsinki",
    city: "Helsinki",
    country: "Finland",
    timezone: "Europe/Helsinki",
    latitude: 60.1699,
    longitude: 24.9384,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "reykjavik",
    city: "Reykjavík",
    country: "Iceland",
    timezone: "Atlantic/Reykjavik",
    latitude: 64.1466,
    longitude: -21.9426,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "zagreb",
    city: "Zagreb",
    country: "Croatia",
    timezone: "Europe/Zagreb",
    latitude: 45.815,
    longitude: 15.9819,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "belgrade",
    city: "Belgrade",
    country: "Serbia",
    timezone: "Europe/Belgrade",
    latitude: 44.7866,
    longitude: 20.4489,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "sarajevo",
    city: "Sarajevo",
    country: "Bosnia and Herzegovina",
    timezone: "Europe/Sarajevo",
    latitude: 43.8563,
    longitude: 18.4131,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "tirana",
    city: "Tirana",
    country: "Albania",
    timezone: "Europe/Tirane",
    latitude: 41.3275,
    longitude: 19.8187,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "skopje",
    city: "Skopje",
    country: "North Macedonia",
    timezone: "Europe/Skopje",
    latitude: 42.0069,
    longitude: 21.4072,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "podgorica",
    city: "Podgorica",
    country: "Montenegro",
    timezone: "Europe/Podgorica",
    latitude: 42.4304,
    longitude: 19.2594,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kyiv",
    city: "Kyiv",
    country: "Ukraine",
    timezone: "Europe/Kyiv",
    latitude: 50.4501,
    longitude: 30.5234,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "moscow",
    city: "Moscow",
    country: "Russia",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "st-petersburg",
    city: "St. Petersburg",
    country: "Russia",
    timezone: "Europe/Moscow",
    latitude: 59.9311,
    longitude: 30.3609,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "istanbul",
    city: "Istanbul",
    country: "Türkiye",
    timezone: "Europe/Istanbul",
    latitude: 41.0082,
    longitude: 28.9784,
    continent: "europe",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "ankara",
    city: "Ankara",
    country: "Türkiye",
    timezone: "Europe/Istanbul",
    latitude: 39.9334,
    longitude: 32.8597,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "tbilisi",
    city: "Tbilisi",
    country: "Georgia",
    timezone: "Asia/Tbilisi",
    latitude: 41.7151,
    longitude: 44.8271,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "yerevan",
    city: "Yerevan",
    country: "Armenia",
    timezone: "Asia/Yerevan",
    latitude: 40.1872,
    longitude: 44.5152,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "baku",
    city: "Baku",
    country: "Azerbaijan",
    timezone: "Asia/Baku",
    latitude: 40.4093,
    longitude: 49.8671,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "minsk",
    city: "Minsk",
    country: "Belarus",
    timezone: "Europe/Minsk",
    latitude: 53.9,
    longitude: 27.559,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "chisinau",
    city: "Chișinău",
    country: "Moldova",
    timezone: "Europe/Chisinau",
    latitude: 47.0105,
    longitude: 28.8638,
    continent: "europe",
    globeTiers: ["capital-international", "major"],
  },

  /* ── Middle East ───────────────────────────────────────────── */

  {
    id: "cairo",
    city: "Cairo",
    country: "Egypt",
    timezone: "Africa/Cairo",
    latitude: 30.0444,
    longitude: 31.2357,
    continent: "middle-east",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "alexandria-egypt",
    city: "Alexandria",
    country: "Egypt",
    timezone: "Africa/Cairo",
    latitude: 31.2001,
    longitude: 29.9187,
    continent: "middle-east",
    globeTiers: ["major"],
  },
  {
    id: "riyadh",
    city: "Riyadh",
    country: "Saudi Arabia",
    timezone: "Asia/Riyadh",
    latitude: 24.7136,
    longitude: 46.6753,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "jeddah",
    city: "Jeddah",
    country: "Saudi Arabia",
    timezone: "Asia/Riyadh",
    latitude: 21.4858,
    longitude: 39.1925,
    continent: "middle-east",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "dubai",
    city: "Dubai",
    country: "United Arab Emirates",
    timezone: "Asia/Dubai",
    latitude: 25.2048,
    longitude: 55.2708,
    continent: "middle-east",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "abu-dhabi",
    city: "Abu Dhabi",
    country: "United Arab Emirates",
    timezone: "Asia/Dubai",
    latitude: 24.4539,
    longitude: 54.3773,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "doha",
    city: "Doha",
    country: "Qatar",
    timezone: "Asia/Qatar",
    latitude: 25.2854,
    longitude: 51.531,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kuwait-city",
    city: "Kuwait City",
    country: "Kuwait",
    timezone: "Asia/Kuwait",
    latitude: 29.3759,
    longitude: 47.9774,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "manama",
    city: "Manama",
    country: "Bahrain",
    timezone: "Asia/Bahrain",
    latitude: 26.2235,
    longitude: 50.5876,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "muscat",
    city: "Muscat",
    country: "Oman",
    timezone: "Asia/Muscat",
    latitude: 23.588,
    longitude: 58.3829,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "baghdad",
    city: "Baghdad",
    country: "Iraq",
    timezone: "Asia/Baghdad",
    latitude: 33.3152,
    longitude: 44.3661,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "amman",
    city: "Amman",
    country: "Jordan",
    timezone: "Asia/Amman",
    latitude: 31.9539,
    longitude: 35.9106,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "beirut",
    city: "Beirut",
    country: "Lebanon",
    timezone: "Asia/Beirut",
    latitude: 33.8938,
    longitude: 35.5018,
    continent: "middle-east",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "damascus",
    city: "Damascus",
    country: "Syria",
    timezone: "Asia/Damascus",
    latitude: 33.5138,
    longitude: 36.2765,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "jerusalem",
    city: "Jerusalem",
    country: "Israel",
    timezone: "Asia/Jerusalem",
    latitude: 31.7683,
    longitude: 35.2137,
    continent: "middle-east",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "tel-aviv",
    city: "Tel Aviv",
    country: "Israel",
    timezone: "Asia/Jerusalem",
    latitude: 32.0853,
    longitude: 34.7818,
    continent: "middle-east",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "tehran",
    city: "Tehran",
    country: "Iran",
    timezone: "Asia/Tehran",
    latitude: 35.6892,
    longitude: 51.389,
    continent: "middle-east",
    globeTiers: ["main", "capital-international", "major"],
  },

  /* ── Africa ────────────────────────────────────────────────── */

  {
    id: "cape-town",
    city: "Cape Town",
    country: "South Africa",
    timezone: "Africa/Johannesburg",
    latitude: -33.9249,
    longitude: 18.4241,
    continent: "africa",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "johannesburg",
    city: "Johannesburg",
    country: "South Africa",
    timezone: "Africa/Johannesburg",
    latitude: -26.2041,
    longitude: 28.0473,
    continent: "africa",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "pretoria",
    city: "Pretoria",
    country: "South Africa",
    timezone: "Africa/Johannesburg",
    latitude: -25.7479,
    longitude: 28.2293,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "lagos",
    city: "Lagos",
    country: "Nigeria",
    timezone: "Africa/Lagos",
    latitude: 6.5244,
    longitude: 3.3792,
    continent: "africa",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "abuja",
    city: "Abuja",
    country: "Nigeria",
    timezone: "Africa/Lagos",
    latitude: 9.0765,
    longitude: 7.3986,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "accra",
    city: "Accra",
    country: "Ghana",
    timezone: "Africa/Accra",
    latitude: 5.6037,
    longitude: -0.187,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "nairobi",
    city: "Nairobi",
    country: "Kenya",
    timezone: "Africa/Nairobi",
    latitude: -1.2921,
    longitude: 36.8219,
    continent: "africa",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "addis-ababa",
    city: "Addis Ababa",
    country: "Ethiopia",
    timezone: "Africa/Addis_Ababa",
    latitude: 9.03,
    longitude: 38.74,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "dar-es-salaam",
    city: "Dar es Salaam",
    country: "Tanzania",
    timezone: "Africa/Dar_es_Salaam",
    latitude: -6.7924,
    longitude: 39.2083,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kampala",
    city: "Kampala",
    country: "Uganda",
    timezone: "Africa/Kampala",
    latitude: 0.3476,
    longitude: 32.5825,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kigali",
    city: "Kigali",
    country: "Rwanda",
    timezone: "Africa/Kigali",
    latitude: -1.9441,
    longitude: 30.0619,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "luanda",
    city: "Luanda",
    country: "Angola",
    timezone: "Africa/Luanda",
    latitude: -8.839,
    longitude: 13.2894,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kinshasa",
    city: "Kinshasa",
    country: "Democratic Republic of the Congo",
    timezone: "Africa/Kinshasa",
    latitude: -4.4419,
    longitude: 15.2663,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "casablanca",
    city: "Casablanca",
    country: "Morocco",
    timezone: "Africa/Casablanca",
    latitude: 33.5731,
    longitude: -7.5898,
    continent: "africa",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "rabat",
    city: "Rabat",
    country: "Morocco",
    timezone: "Africa/Casablanca",
    latitude: 34.0209,
    longitude: -6.8416,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "algiers",
    city: "Algiers",
    country: "Algeria",
    timezone: "Africa/Algiers",
    latitude: 36.7538,
    longitude: 3.0588,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "tunis",
    city: "Tunis",
    country: "Tunisia",
    timezone: "Africa/Tunis",
    latitude: 36.8065,
    longitude: 10.1815,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "tripoli",
    city: "Tripoli",
    country: "Libya",
    timezone: "Africa/Tripoli",
    latitude: 32.8872,
    longitude: 13.1913,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "khartoum",
    city: "Khartoum",
    country: "Sudan",
    timezone: "Africa/Khartoum",
    latitude: 15.5007,
    longitude: 32.5599,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "dakar",
    city: "Dakar",
    country: "Senegal",
    timezone: "Africa/Dakar",
    latitude: 14.7167,
    longitude: -17.4677,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "abidjan",
    city: "Abidjan",
    country: "Côte d'Ivoire",
    timezone: "Africa/Abidjan",
    latitude: 5.36,
    longitude: -4.0083,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "maputo",
    city: "Maputo",
    country: "Mozambique",
    timezone: "Africa/Maputo",
    latitude: -25.9692,
    longitude: 32.5732,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "lusaka",
    city: "Lusaka",
    country: "Zambia",
    timezone: "Africa/Lusaka",
    latitude: -15.3875,
    longitude: 28.3228,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "harare",
    city: "Harare",
    country: "Zimbabwe",
    timezone: "Africa/Harare",
    latitude: -17.8252,
    longitude: 31.0335,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "windhoek",
    city: "Windhoek",
    country: "Namibia",
    timezone: "Africa/Windhoek",
    latitude: -22.5609,
    longitude: 17.0658,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "gaborone",
    city: "Gaborone",
    country: "Botswana",
    timezone: "Africa/Gaborone",
    latitude: -24.6282,
    longitude: 25.9231,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "antananarivo",
    city: "Antananarivo",
    country: "Madagascar",
    timezone: "Indian/Antananarivo",
    latitude: -18.8792,
    longitude: 47.5079,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "mauritius",
    city: "Port Louis",
    country: "Mauritius",
    timezone: "Indian/Mauritius",
    latitude: -20.1609,
    longitude: 57.5012,
    continent: "africa",
    globeTiers: ["capital-international", "major"],
  },

  /* ── South Asia ────────────────────────────────────────────── */

  {
    id: "delhi",
    city: "New Delhi",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 28.6139,
    longitude: 77.209,
    continent: "south-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "mumbai",
    city: "Mumbai",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 19.076,
    longitude: 72.8777,
    continent: "south-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "bangalore",
    city: "Bengaluru",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 12.9716,
    longitude: 77.5946,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "hyderabad",
    city: "Hyderabad",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 17.385,
    longitude: 78.4867,
    continent: "south-asia",
    globeTiers: ["major"],
  },
  {
    id: "chennai",
    city: "Chennai",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 13.0827,
    longitude: 80.2707,
    continent: "south-asia",
    globeTiers: ["major"],
  },
  {
    id: "kolkata",
    city: "Kolkata",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 22.5726,
    longitude: 88.3639,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "pune",
    city: "Pune",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 18.5204,
    longitude: 73.8567,
    continent: "south-asia",
    globeTiers: ["major"],
  },
  {
    id: "ahmedabad",
    city: "Ahmedabad",
    country: "India",
    timezone: "Asia/Kolkata",
    latitude: 23.0225,
    longitude: 72.5714,
    continent: "south-asia",
    globeTiers: ["major"],
  },
  {
    id: "dhaka",
    city: "Dhaka",
    country: "Bangladesh",
    timezone: "Asia/Dhaka",
    latitude: 23.8103,
    longitude: 90.4125,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kathmandu",
    city: "Kathmandu",
    country: "Nepal",
    timezone: "Asia/Kathmandu",
    latitude: 27.7172,
    longitude: 85.324,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "colombo",
    city: "Colombo",
    country: "Sri Lanka",
    timezone: "Asia/Colombo",
    latitude: 6.9271,
    longitude: 79.8612,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "islamabad",
    city: "Islamabad",
    country: "Pakistan",
    timezone: "Asia/Karachi",
    latitude: 33.6844,
    longitude: 73.0479,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "karachi",
    city: "Karachi",
    country: "Pakistan",
    timezone: "Asia/Karachi",
    latitude: 24.8607,
    longitude: 67.0011,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "lahore",
    city: "Lahore",
    country: "Pakistan",
    timezone: "Asia/Karachi",
    latitude: 31.5204,
    longitude: 74.3587,
    continent: "south-asia",
    globeTiers: ["major"],
  },
  {
    id: "male",
    city: "Malé",
    country: "Maldives",
    timezone: "Indian/Maldives",
    latitude: 4.1755,
    longitude: 73.5093,
    continent: "south-asia",
    globeTiers: ["capital-international", "major"],
  },

  /* ── East Asia ─────────────────────────────────────────────── */

  {
    id: "beijing",
    city: "Beijing",
    country: "China",
    timezone: "Asia/Shanghai",
    latitude: 39.9042,
    longitude: 116.4074,
    continent: "east-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "shanghai",
    city: "Shanghai",
    country: "China",
    timezone: "Asia/Shanghai",
    latitude: 31.2304,
    longitude: 121.4737,
    continent: "east-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "guangzhou",
    city: "Guangzhou",
    country: "China",
    timezone: "Asia/Shanghai",
    latitude: 23.1291,
    longitude: 113.2644,
    continent: "east-asia",
    globeTiers: ["major"],
  },
  {
    id: "shenzhen",
    city: "Shenzhen",
    country: "China",
    timezone: "Asia/Shanghai",
    latitude: 22.5431,
    longitude: 114.0579,
    continent: "east-asia",
    globeTiers: ["major"],
  },
  {
    id: "chengdu",
    city: "Chengdu",
    country: "China",
    timezone: "Asia/Shanghai",
    latitude: 30.5728,
    longitude: 104.0668,
    continent: "east-asia",
    globeTiers: ["major"],
  },
  {
    id: "hong-kong",
    city: "Hong Kong",
    country: "Hong Kong",
    timezone: "Asia/Hong_Kong",
    latitude: 22.3193,
    longitude: 114.1694,
    continent: "east-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "taipei",
    city: "Taipei",
    country: "Taiwan",
    timezone: "Asia/Taipei",
    latitude: 25.033,
    longitude: 121.5654,
    continent: "east-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "tokyo",
    city: "Tokyo",
    country: "Japan",
    timezone: "Asia/Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    continent: "east-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "osaka",
    city: "Osaka",
    country: "Japan",
    timezone: "Asia/Tokyo",
    latitude: 34.6937,
    longitude: 135.5023,
    continent: "east-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "kyoto",
    city: "Kyoto",
    country: "Japan",
    timezone: "Asia/Tokyo",
    latitude: 35.0116,
    longitude: 135.7681,
    continent: "east-asia",
    globeTiers: ["major"],
  },
  {
    id: "seoul",
    city: "Seoul",
    country: "South Korea",
    timezone: "Asia/Seoul",
    latitude: 37.5665,
    longitude: 126.978,
    continent: "east-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "busan",
    city: "Busan",
    country: "South Korea",
    timezone: "Asia/Seoul",
    latitude: 35.1796,
    longitude: 129.0756,
    continent: "east-asia",
    globeTiers: ["major"],
  },
  {
    id: "ulaanbaatar",
    city: "Ulaanbaatar",
    country: "Mongolia",
    timezone: "Asia/Ulaanbaatar",
    latitude: 47.8864,
    longitude: 106.9057,
    continent: "east-asia",
    globeTiers: ["capital-international", "major"],
  },

  /* ── Southeast Asia ────────────────────────────────────────── */

  {
    id: "singapore",
    city: "Singapore",
    country: "Singapore",
    timezone: "Asia/Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
    continent: "southeast-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "bangkok",
    city: "Bangkok",
    country: "Thailand",
    timezone: "Asia/Bangkok",
    latitude: 13.7563,
    longitude: 100.5018,
    continent: "southeast-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "jakarta",
    city: "Jakarta",
    country: "Indonesia",
    timezone: "Asia/Jakarta",
    latitude: -6.2088,
    longitude: 106.8456,
    continent: "southeast-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "bali",
    city: "Denpasar",
    country: "Indonesia",
    timezone: "Asia/Makassar",
    latitude: -8.65,
    longitude: 115.2167,
    continent: "southeast-asia",
    globeTiers: ["major"],
  },
  {
    id: "kuala-lumpur",
    city: "Kuala Lumpur",
    country: "Malaysia",
    timezone: "Asia/Kuala_Lumpur",
    latitude: 3.139,
    longitude: 101.6869,
    continent: "southeast-asia",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "manila",
    city: "Manila",
    country: "Philippines",
    timezone: "Asia/Manila",
    latitude: 14.5995,
    longitude: 120.9842,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "hanoi",
    city: "Hanoi",
    country: "Vietnam",
    timezone: "Asia/Ho_Chi_Minh",
    latitude: 21.0278,
    longitude: 105.8342,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "ho-chi-minh-city",
    city: "Ho Chi Minh City",
    country: "Vietnam",
    timezone: "Asia/Ho_Chi_Minh",
    latitude: 10.8231,
    longitude: 106.6297,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "phnom-penh",
    city: "Phnom Penh",
    country: "Cambodia",
    timezone: "Asia/Phnom_Penh",
    latitude: 11.5564,
    longitude: 104.9282,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "vientiane",
    city: "Vientiane",
    country: "Laos",
    timezone: "Asia/Vientiane",
    latitude: 17.9757,
    longitude: 102.6331,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "yangon",
    city: "Yangon",
    country: "Myanmar",
    timezone: "Asia/Yangon",
    latitude: 16.8409,
    longitude: 96.1735,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "dili",
    city: "Dili",
    country: "Timor-Leste",
    timezone: "Asia/Dili",
    latitude: -8.5569,
    longitude: 125.5603,
    continent: "southeast-asia",
    globeTiers: ["capital-international", "major"],
  },

  /* ── Central Asia ──────────────────────────────────────────── */

  {
    id: "astana",
    city: "Astana",
    country: "Kazakhstan",
    timezone: "Asia/Almaty",
    latitude: 51.1694,
    longitude: 71.4491,
    continent: "central-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "almaty",
    city: "Almaty",
    country: "Kazakhstan",
    timezone: "Asia/Almaty",
    latitude: 43.2389,
    longitude: 76.8897,
    continent: "central-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "tashkent",
    city: "Tashkent",
    country: "Uzbekistan",
    timezone: "Asia/Tashkent",
    latitude: 41.2995,
    longitude: 69.2401,
    continent: "central-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "bishkek",
    city: "Bishkek",
    country: "Kyrgyzstan",
    timezone: "Asia/Bishkek",
    latitude: 42.8746,
    longitude: 74.5698,
    continent: "central-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "dushanbe",
    city: "Dushanbe",
    country: "Tajikistan",
    timezone: "Asia/Dushanbe",
    latitude: 38.5598,
    longitude: 68.787,
    continent: "central-asia",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "ashgabat",
    city: "Ashgabat",
    country: "Turkmenistan",
    timezone: "Asia/Ashgabat",
    latitude: 37.9601,
    longitude: 58.3261,
    continent: "central-asia",
    globeTiers: ["capital-international", "major"],
  },

  /* ── Oceania ───────────────────────────────────────────────── */

  {
    id: "sydney",
    city: "Sydney",
    country: "Australia",
    timezone: "Australia/Sydney",
    latitude: -33.8688,
    longitude: 151.2093,
    continent: "oceania",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "melbourne",
    city: "Melbourne",
    country: "Australia",
    timezone: "Australia/Melbourne",
    latitude: -37.8136,
    longitude: 144.9631,
    continent: "oceania",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "brisbane",
    city: "Brisbane",
    country: "Australia",
    timezone: "Australia/Brisbane",
    latitude: -27.4698,
    longitude: 153.0251,
    continent: "oceania",
    globeTiers: ["major"],
  },
  {
    id: "perth",
    city: "Perth",
    country: "Australia",
    timezone: "Australia/Perth",
    latitude: -31.9505,
    longitude: 115.8605,
    continent: "oceania",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "adelaide",
    city: "Adelaide",
    country: "Australia",
    timezone: "Australia/Adelaide",
    latitude: -34.9285,
    longitude: 138.6007,
    continent: "oceania",
    globeTiers: ["major"],
  },
  {
    id: "darwin",
    city: "Darwin",
    country: "Australia",
    timezone: "Australia/Darwin",
    latitude: -12.4634,
    longitude: 130.8456,
    continent: "oceania",
    globeTiers: ["major"],
  },
  {
    id: "canberra",
    city: "Canberra",
    country: "Australia",
    timezone: "Australia/Sydney",
    latitude: -35.2809,
    longitude: 149.13,
    continent: "oceania",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "auckland",
    city: "Auckland",
    country: "New Zealand",
    timezone: "Pacific/Auckland",
    latitude: -36.8509,
    longitude: 174.7645,
    continent: "oceania",
    globeTiers: ["main", "capital-international", "major"],
  },
  {
    id: "wellington",
    city: "Wellington",
    country: "New Zealand",
    timezone: "Pacific/Auckland",
    latitude: -41.2866,
    longitude: 174.7756,
    continent: "oceania",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "christchurch",
    city: "Christchurch",
    country: "New Zealand",
    timezone: "Pacific/Auckland",
    latitude: -43.5321,
    longitude: 172.6362,
    continent: "oceania",
    globeTiers: ["major"],
  },
  {
    id: "port-moresby",
    city: "Port Moresby",
    country: "Papua New Guinea",
    timezone: "Pacific/Port_Moresby",
    latitude: -9.4438,
    longitude: 147.1803,
    continent: "oceania",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "suva",
    city: "Suva",
    country: "Fiji",
    timezone: "Pacific/Fiji",
    latitude: -18.1248,
    longitude: 178.4501,
    continent: "oceania",
    globeTiers: ["capital-international", "major"],
  },
  {
    id: "apia",
    city: "Apia",
    country: "Samoa",
    timezone: "Pacific/Apia",
    latitude: -13.8507,
    longitude: -171.7513,
    continent: "oceania",
    globeTiers: ["capital-international", "major"],
  },

  /* ── Indian Ocean ──────────────────────────────────────────── */

  {
    id: "seychelles",
    city: "Victoria",
    country: "Seychelles",
    timezone: "Indian/Mahe",
    latitude: -4.6191,
    longitude: 55.4513,
    continent: "indian-ocean",
    globeTiers: ["capital-international", "major"],
  },
];

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Verify the catalog is well-formed at module load.
 *
 * Dev: throws on the first violation so typos surface
 * immediately during development.
 *
 * Prod: `console.error`s each violation but never throws — a
 * single bad entry should not crash the app for every user.
 *
 * This is a runtime-only check. TypeScript validates the
 * *shape* of each entry at compile time; this function
 * validates the *data* (duplicate ids, out-of-range
 * coordinates, empty required strings).
 */
function validateCatalog(
  locations: readonly WorldLocation[],
): void {
  const isProduction = process.env.NODE_ENV === "production";

  const report = (message: string): void => {
    const fullMessage = `[locations] ${message}`;

    if (isProduction) {
      console.error(fullMessage);
      return;
    }

    throw new Error(fullMessage);
  };

  const seenIds = new Set<string>();
  const seenCityCountry = new Set<string>();

  for (const location of locations) {
    if (seenIds.has(location.id)) {
      report(`duplicate id: ${location.id}`);
    }
    seenIds.add(location.id);

    const cityCountryKey = `${location.city}|${location.country}`;
    if (seenCityCountry.has(cityCountryKey)) {
      report(`duplicate city/country: ${cityCountryKey}`);
    }
    seenCityCountry.add(cityCountryKey);

    if (
      !Number.isFinite(location.latitude) ||
      location.latitude < -90 ||
      location.latitude > 90
    ) {
      report(
        `invalid latitude for ${location.id}: ${location.latitude}`,
      );
    }

    if (
      !Number.isFinite(location.longitude) ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      report(
        `invalid longitude for ${location.id}: ${location.longitude}`,
      );
    }

    if (location.timezone.length === 0) {
      report(`empty timezone for ${location.id}`);
    }

    if (location.globeTiers.length === 0) {
      report(`empty globeTiers for ${location.id}`);
    }
  }
}

validateCatalog(WORLD_LOCATIONS);

/* -------------------------------------------------------------------------- */
/* Derived indexes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The "Major Cities" tier: the 48-city curated set (all
 * locations tagged with the internal `"main"` tier). Computed
 * once at module load — the set never changes at runtime.
 */
export const MAJOR_LOCATIONS: readonly WorldLocation[] =
  Object.freeze(
    WORLD_LOCATIONS.filter((location) =>
      location.globeTiers.includes("main"),
    ),
  );

/**
 * The "All Cities" tier: every location in the catalog.
 * Semantic alias for `WORLD_LOCATIONS`.
 */
export const ALL_LOCATIONS: readonly WorldLocation[] =
  WORLD_LOCATIONS;

/**
 * Location lists keyed by public globe tier. Frozen so callers
 * cannot swap a tier's list at runtime.
 */
const LOCATIONS_BY_TIER: Record<
  GlobeTier,
  readonly WorldLocation[]
> = Object.freeze({
  major: MAJOR_LOCATIONS,
  all: ALL_LOCATIONS,
});

/** O(1) lookup by stable id. */
const LOCATIONS_BY_ID: ReadonlyMap<string, WorldLocation> =
  new Map(WORLD_LOCATIONS.map((location) => [location.id, location]));

/**
 * O(1) lookup by IANA time zone. When a zone hosts multiple
 * catalogued cities, the first-seen location wins — this keeps
 * the "local time" default stable across releases.
 */
const LOCATIONS_BY_TIMEZONE: ReadonlyMap<
  string,
  WorldLocation
> = (() => {
  const map = new Map<string, WorldLocation>();

  for (const location of WORLD_LOCATIONS) {
    if (!map.has(location.timezone)) {
      map.set(location.timezone, location);
    }
  }

  return map;
})();

/* -------------------------------------------------------------------------- */
/* Public accessors                                                           */
/* -------------------------------------------------------------------------- */

/** List of locations for the given public globe tier. */
export function getLocationsByGlobeTier(
  tier: GlobeTier,
): readonly WorldLocation[] {
  return LOCATIONS_BY_TIER[tier];
}

/** Look up a location by its stable id. */
export function getWorldLocationById(
  id: string,
): WorldLocation | undefined {
  return LOCATIONS_BY_ID.get(id);
}

/** Look up a location by its IANA time zone. */
export function getWorldLocationByTimezone(
  timezone: string,
): WorldLocation | undefined {
  return LOCATIONS_BY_TIMEZONE.get(timezone);
}

/**
 * All catalogued locations on the given continent, in editorial
 * order. Note: this is an O(n) scan. Callers hitting it on every
 * render should memoize the result.
 */
export function getLocationsByContinent(
  continent: Continent,
): readonly WorldLocation[] {
  return WORLD_LOCATIONS.filter(
    (location) => location.continent === continent,
  );
}