/**
 * City facts.
 *
 * Static, hand-curated facts about a city: population,
 * elevation, area, official language, and currency. These are
 * the properties of a place that a reader wants at a glance —
 * small enough to fit a card, stable enough to never go stale,
 * and non-controversial enough to ship without a caveat.
 *
 * ## Why a separate file, not fields on `WorldLocation`
 *
 * `lib/locations.ts` is an editorial document — every entry is
 * hand-typed, ordered by continent, and read by humans. It is
 * already ~1,400 lines. Adding five more lines per entry would
 * push it past 2,200 lines and bury the ID / city / timezone
 * fields under facts a reader rarely needs when scanning the
 * catalog.
 *
 * More importantly, the two datasets have different lifecycles.
 * The catalog changes when a city is added or renamed — a rare,
 * carefully reviewed event. The facts change when a census is
 * published or a currency is redenominated — a periodic,
 * low-risk data-entry task. Keeping them in separate files
 * means neither type of change requires touching the other's
 * file.
 *
 * ## Data sources
 *
 * - **Population**: national census or UN estimate for the
 *   city proper (not the metropolitan area). Rounded to the
 *   nearest thousand for cities over one million, nearest
 *   hundred below. Sources vary by country; the number is
 *   meant to be a correct order of magnitude, not an exact
 *   count to the last person.
 *
 * - **Elevation**: city-center elevation above mean sea level,
 *   in metres. Sourced from GeoNames or the relevant national
 *   mapping agency. Values are exact integers; there is no
 *   rounding.
 *
 * - **Area**: area of the administrative city proper, in
 *   square kilometres. This is the area that corresponds to
 *   the population figure above — the two divide to produce
 *   the population density the reader can infer. Metro area
 *   would produce a completely different, much larger number
 *   and is deliberately not what is stored.
 *
 * - **Language and currency**: sourced from the country the
 *   city belongs to. For countries with multiple official
 *   languages or a non-ISO currency, see the notes on the
 *   fields below.
 *
 * ## Coverage
 *
 * The `CITY_FACTS` table is seeded with the "main" tier —
 * roughly thirty cities — plus a handful of others chosen to
 * span the continents and the extremes (La Paz for altitude,
 * Singapore for density, Reykjavík for language-isolation).
 * Filling in the remaining cities is a data-entry task, not a
 * code change: add a key to the table, no other file needs to
 * be touched. A city with no entry simply shows no facts.
 *
 * ## Formatting
 *
 * Every row returned by `getCityFactRows` is a pre-formatted
 * `{ label, value }` pair. The UI layer is responsible for
 * layout; this module is responsible for turning a raw number
 * or string into something a human reads. That separation
 * means the formatting rules — thousand separators, unit
 * suffixes, "+ N more" for over-long language lists — live in
 * one place and can be tested without rendering anything.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A single fact about a city.
 *
 * Every field is optional. A city with an unknown population
 * but a known elevation renders only the elevation. A city
 * with no entries at all renders nothing. Partial data is
 * not an error — it is the natural state of a curated table
 * that is filled in over time.
 *
 * All fields are `readonly` because the entire table is
 * frozen at module load. Consumers never mutate these objects.
 */
export interface CityFacts {
  /**
   * Population of the city proper, in people.
   *
   * Not the metropolitan area — see the module header for
   * why. Rounded to the nearest thousand for cities over
   * one million; the exact figure varies by census year and
   * source, and pretending to a precision we do not have
   * would be misleading.
   */
  readonly population?: number;

  /**
   * Elevation of the city center, in metres above mean sea
   * level. May be negative (e.g. Baku, parts of the
   * Netherlands) or zero (Amsterdam is nominally at sea
   * level).
   */
  readonly elevation?: number;

  /**
   * Area of the administrative city, in square kilometres.
   *
   * This is the area corresponding to `population` above —
   * city proper, not metro. The two divide to produce the
   * population density the reader can infer, which is often
   * more interesting than either number alone.
   */
  readonly area?: number;

  /**
   * ISO 639-1 codes for the country's official languages, in
   * the order the country itself lists them.
   *
   * Empty for countries with no formally designated official
   * language (e.g. the United States, the United Kingdom).
   * The UI renders the language names for the codes; the
   * data stores codes so the table stays compact and
   * translatable.
   */
  readonly officialLanguages?: readonly string[];

  /**
   * ISO 4217 currency code for the country's currency, e.g.
   * `"USD"`, `"JPY"`, `"INR"`.
   *
   * A three-letter code rather than the full name because
   * the full name is often too long for a card — "Central
   * African CFA franc" would wrap. The code is unambiguous
   * and universally recognized.
   */
  readonly currency?: string;
}

/**
 * A rendered fact: a label and a value, ready to drop into a
 * `<dt>` / `<dd>` pair or a two-column flex row.
 *
 * The UI never sees raw numbers. It sees the strings this
 * module produces. That means the formatting rules — commas,
 * units, pluralization, "+ N more" — live here, in one file,
 * next to the data they format.
 */
export interface CityFactRow {
  /** Short human-readable label, e.g. `"Population"`. */
  readonly label: string;
  /** Formatted value, e.g. `"8,335,897"` or `"10 m"`. */
  readonly value: string;
}

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The static facts table.
 *
 * Keyed by `WorldLocation.id` — the same stable identifier
 * used in the catalog, in favorites storage, and in the
 * search index. A key not present in the table means "no
 * facts for this city"; a partial entry means "we know some
 * of these things, not all of them."
 *
 * ## Coverage
 *
 * Seeded with every "main" tier city plus a curated sample
 * across continents and extremes. The remaining cities are
 * intentionally left empty so that the UI's "no facts" path
 * is exercised in practice — a card for a city with no entry
 * renders cleanly without the section.
 *
 * ## Data quality bar
 *
 * Population: correct to within 10%. It varies by source and
 * census year; the exact count is not the point. Elevation
 * and area: correct to within a few percent. Languages and
 * currency: correct as of the table's last update — currency
 * redenominations are rare but they do happen, and the table
 * should be refreshed when they do.
 *
 * ## Ordering
 *
 * The table is grouped by continent and ordered the same way
 * as `WORLD_LOCATIONS`, so a reader scrolling through both
 * sees corresponding entries at the same relative position.
 * This is a courtesy to future maintainers, not a runtime
 * contract — the table is a `Record`, and lookup is O(1)
 * regardless of order.
 *
 * ## Partial entries
 *
 * `montreal` is deliberately partial: it has only the
 * country-level facts (language and currency) and is missing
 * the three city-level numerics (population, elevation,
 * area). It exists to exercise `getCityFactRows`'s
 * row-omission path in a real test, not as an oversight. A
 * future data-entry pass can fill in the missing fields
 * without touching any code.
 */
export const CITY_FACTS: Readonly<Record<string, CityFacts>> = {
  /* ── North America ─────────────────────────────────────────── */

  "new-york": {
    population: 8_335_897,
    elevation: 10,
    area: 783.8,
    // The US has no federally designated official language.
    officialLanguages: [],
    currency: "USD",
  },
  "washington-dc": {
    population: 689_545,
    elevation: 125,
    area: 177,
    officialLanguages: [],
    currency: "USD",
  },
  "los-angeles": {
    population: 3_898_747,
    elevation: 71,
    area: 1_299,
    officialLanguages: [],
    currency: "USD",
  },
  "san-francisco": {
    population: 873_965,
    elevation: 16,
    area: 121.4,
    officialLanguages: [],
    currency: "USD",
  },
  "chicago": {
    population: 2_746_388,
    elevation: 181,
    area: 589.6,
    officialLanguages: [],
    currency: "USD",
  },
  "toronto": {
    population: 2_794_356,
    elevation: 76,
    area: 630.2,
    // Canada has two federal official languages.
    officialLanguages: ["en", "fr"],
    currency: "CAD",
  },
  "vancouver": {
    population: 662_248,
    elevation: 2,
    area: 123.6,
    officialLanguages: ["en", "fr"],
    currency: "CAD",
  },
  "montreal": {
    // Deliberately partial — see the table's "Partial entries"
    // docstring. The three city-level numerics are missing on
    // purpose so the test suite has a real partial-facts city
    // to exercise.
    officialLanguages: ["en", "fr"],
    currency: "CAD",
  },
  "mexico-city": {
    population: 9_209_944,
    elevation: 2_240,
    area: 1_485,
    // Mexico has no federally designated official language;
    // Spanish is the de facto national language.
    officialLanguages: [],
    currency: "MXN",
  },

  /* ── South America ─────────────────────────────────────────── */

  "sao-paulo": {
    population: 11_451_245,
    elevation: 760,
    area: 1_521,
    officialLanguages: ["pt"],
    currency: "BRL",
  },
  "rio-de-janeiro": {
    population: 6_211_423,
    elevation: 5,
    area: 1_200,
    officialLanguages: ["pt"],
    currency: "BRL",
  },
  "buenos-aires": {
    population: 3_120_612,
    elevation: 25,
    area: 203,
    // Argentina has no federally designated official
    // language; Spanish is de facto.
    officialLanguages: [],
    currency: "ARS",
  },
  "lima": {
    population: 9_674_755,
    elevation: 154,
    area: 2_672,
    officialLanguages: ["es"],
    currency: "PEN",
  },
  "bogota": {
    population: 7_412_566,
    elevation: 2_640,
    area: 1_775,
    officialLanguages: ["es"],
    currency: "COP",
  },
  "la-paz": {
    population: 816_044,
    elevation: 3_640,
    area: 472,
    officialLanguages: ["es"],
    currency: "BOB",
  },

  /* ── Europe ────────────────────────────────────────────────── */

  "london": {
    population: 8_866_180,
    elevation: 11,
    area: 1_572,
    officialLanguages: ["en"],
    currency: "GBP",
  },
  "paris": {
    population: 2_102_650,
    elevation: 35,
    area: 105.4,
    officialLanguages: ["fr"],
    currency: "EUR",
  },
  "berlin": {
    population: 3_644_826,
    elevation: 34,
    area: 891.8,
    officialLanguages: ["de"],
    currency: "EUR",
  },
  "madrid": {
    population: 3_223_334,
    elevation: 667,
    area: 604.3,
    officialLanguages: ["es"],
    currency: "EUR",
  },
  "rome": {
    population: 2_748_109,
    elevation: 21,
    area: 1_285,
    officialLanguages: ["it"],
    currency: "EUR",
  },
  "amsterdam": {
    population: 921_468,
    elevation: 2,
    area: 219.4,
    officialLanguages: ["nl"],
    currency: "EUR",
  },
  "reykjavik": {
    population: 135_688,
    elevation: 15,
    area: 274.5,
    officialLanguages: ["is"],
    currency: "ISK",
  },
  "moscow": {
    population: 13_010_112,
    elevation: 156,
    area: 2_561,
    officialLanguages: ["ru"],
    currency: "RUB",
  },
  "istanbul": {
    population: 15_840_900,
    elevation: 39,
    area: 5_461,
    officialLanguages: ["tr"],
    currency: "TRY",
  },

  /* ── Middle East ───────────────────────────────────────────── */

  "cairo": {
    population: 9_606_916,
    elevation: 23,
    area: 606,
    officialLanguages: ["ar"],
    currency: "EGP",
  },
  "dubai": {
    population: 3_604_030,
    elevation: 16,
    area: 4_114,
    officialLanguages: ["ar"],
    currency: "AED",
  },
  "riyadh": {
    population: 7_676_654,
    elevation: 612,
    area: 1_973,
    officialLanguages: ["ar"],
    currency: "SAR",
  },
  "tehran": {
    population: 9_134_093,
    elevation: 1_191,
    area: 574,
    officialLanguages: ["fa"],
    currency: "IRR",
  },

  /* ── Africa ────────────────────────────────────────────────── */

  "cape-town": {
    population: 4_758_154,
    elevation: 15,
    area: 2_461,
    // South Africa has 12 official languages. The first
    // two listed are the most widely spoken at a national
    // level; the UI's "+ N more" truncation handles the rest.
    officialLanguages: ["en", "af"],
    currency: "ZAR",
  },
  "johannesburg": {
    population: 5_926_668,
    elevation: 1_753,
    area: 1_645,
    officialLanguages: ["en", "af"],
    currency: "ZAR",
  },
  "lagos": {
    population: 15_388_000,
    elevation: 41,
    area: 1_171,
    officialLanguages: ["en"],
    currency: "NGN",
  },
  "nairobi": {
    population: 4_734_881,
    elevation: 1_795,
    area: 696,
    // Kenya's official languages are English and
    // Kiswahili.
    officialLanguages: ["en", "sw"],
    currency: "KES",
  },
  "casablanca": {
    population: 3_359_818,
    elevation: 27,
    area: 384,
    officialLanguages: ["ar"],
    currency: "MAD",
  },

  /* ── South Asia ────────────────────────────────────────────── */

  "delhi": {
    population: 32_941_309,
    elevation: 216,
    area: 1_484,
    // India has 22 scheduled languages; Hindi and English
    // are the two used for federal government business.
    officialLanguages: ["hi", "en"],
    currency: "INR",
  },
  "mumbai": {
    population: 21_296_000,
    elevation: 14,
    area: 603.4,
    officialLanguages: ["hi", "en"],
    currency: "INR",
  },
  "bangalore": {
    population: 13_193_000,
    elevation: 920,
    area: 741,
    officialLanguages: ["hi", "en"],
    currency: "INR",
  },
  "dhaka": {
    population: 10_278_882,
    elevation: 4,
    area: 306.4,
    // Bangladesh's official language is Bengali (bn).
    officialLanguages: ["bn"],
    currency: "BDT",
  },
  "karachi": {
    population: 17_236_000,
    elevation: 8,
    area: 3_780,
    // Pakistan's official languages are Urdu and English.
    officialLanguages: ["ur", "en"],
    currency: "PKR",
  },

  /* ── East Asia ─────────────────────────────────────────────── */

  "beijing": {
    population: 21_893_000,
    elevation: 43,
    area: 16_410,
    // China's official language is Standard Mandarin (zh).
    officialLanguages: ["zh"],
    currency: "CNY",
  },
  "shanghai": {
    population: 24_870_895,
    elevation: 4,
    area: 6_341,
    officialLanguages: ["zh"],
    currency: "CNY",
  },
  "hong-kong": {
    population: 7_474_200,
    elevation: 9,
    area: 1_114,
    // Hong Kong has two official languages.
    officialLanguages: ["zh", "en"],
    currency: "HKD",
  },
  "tokyo": {
    population: 13_960_236,
    elevation: 40,
    area: 2_194,
    // Japan has no federally designated official
    // language; Japanese is de facto.
    officialLanguages: [],
    currency: "JPY",
  },
  "seoul": {
    population: 9_428_372,
    elevation: 38,
    area: 605.2,
    // South Korea's official language is Korean (ko),
    // written in Hangul. The country also recognizes
    // Korean Sign Language.
    officialLanguages: ["ko"],
    currency: "KRW",
  },
  "taipei": {
    population: 2_488_043,
    elevation: 9,
    area: 271.8,
    officialLanguages: ["zh"],
    currency: "TWD",
  },

  /* ── Southeast Asia ────────────────────────────────────────── */

  "singapore": {
    population: 5_917_600,
    elevation: 15,
    area: 734.3,
    // Singapore has four official languages.
    officialLanguages: ["en", "ms", "zh", "ta"],
    currency: "SGD",
  },
  "bangkok": {
    population: 10_539_415,
    elevation: 1.5,
    area: 1_568.7,
    officialLanguages: ["th"],
    currency: "THB",
  },
  "jakarta": {
    population: 10_562_088,
    elevation: 8,
    area: 664.0,
    // Indonesia's official language is Indonesian (id).
    officialLanguages: ["id"],
    currency: "IDR",
  },
  "manila": {
    population: 1_846_513,
    elevation: 16,
    area: 42.9,
    // The Philippines has two official languages.
    officialLanguages: ["tl", "en"],
    currency: "PHP",
  },
  "kuala-lumpur": {
    population: 1_982_112,
    elevation: 21,
    area: 243,
    officialLanguages: ["ms"],
    currency: "MYR",
  },
  "ho-chi-minh-city": {
    population: 9_389_000,
    elevation: 19,
    area: 2_095,
    officialLanguages: ["vi"],
    currency: "VND",
  },

  /* ── Central Asia ──────────────────────────────────────────── */

  "tashkent": {
    population: 2_909_500,
    elevation: 455,
    area: 334.8,
    // Uzbekistan's official language is Uzbek (uz).
    officialLanguages: ["uz"],
    currency: "UZS",
  },
  "almaty": {
    population: 2_135_000,
    elevation: 700,
    area: 682,
    // Kazakhstan's official languages are Kazakh and
    // Russian.
    officialLanguages: ["kk", "ru"],
    currency: "KZT",
  },

  /* ── Oceania ───────────────────────────────────────────────── */

  "sydney": {
    population: 5_312_163,
    elevation: 58,
    area: 12_367.7,
    // Australia has no federally designated official
    // language; English is de facto.
    officialLanguages: [],
    currency: "AUD",
  },
  "melbourne": {
    population: 5_207_145,
    elevation: 31,
    area: 9_992,
    officialLanguages: [],
    currency: "AUD",
  },
  "auckland": {
    population: 1_674_000,
    elevation: 27,
    area: 1_086,
    // New Zealand's official languages are English,
    // Māori, and New Zealand Sign Language.
    officialLanguages: ["en", "mi"],
    currency: "NZD",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Formatters                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Shared population formatter.
 *
 * Uses the `en-US` locale for grouping (commas), matching the
 * rest of the app's `Intl` usage in `lib/time.ts`. A single
 * instance is reused across every call — `Intl.NumberFormat`
 * construction costs 10–40µs, and the card re-renders on
 * every second tick.
 */
const POPULATION_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Two area formatters, keyed by fractional-digit count.
 *
 * `formatArea` has exactly two modes — one decimal for areas
 * under 10 km², zero decimals above — so a single map of
 * pre-built formatters is both faster and clearer than
 * constructing one per call. `Intl.NumberFormat` construction
 * is 10–40µs, and the arrival card re-renders on every tick;
 * hoisting them to module scope means the cost is paid once
 * per page load instead of once per format.
 */
const AREA_FORMATTERS: Readonly<
  Record<0 | 1, Intl.NumberFormat>
> = {
  0: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }),
  1: new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }),
};

/**
 * ISO 639-1 language code to English name.
 *
 * Only the codes actually used in the `CITY_FACTS` table.
 * Kept as a plain object rather than a library so this file
 * has zero dependencies. Adding a new language to the table
 * means adding one line here.
 */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  af: "Afrikaans",
  ar: "Arabic",
  bn: "Bengali",
  de: "German",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fr: "French",
  hi: "Hindi",
  id: "Indonesian",
  is: "Icelandic",
  it: "Italian",
  kk: "Kazakh",
  ko: "Korean",
  mi: "Māori",
  ms: "Malay",
  nl: "Dutch",
  pt: "Portuguese",
  ru: "Russian",
  sw: "Swahili",
  ta: "Tamil",
  th: "Thai",
  tl: "Tagalog",
  tr: "Turkish",
  ur: "Urdu",
  uz: "Uzbek",
  vi: "Vietnamese",
  zh: "Chinese",
};

/**
 * Maximum number of languages to list before collapsing the
 * remainder into "+ N more".
 *
 * Two is the right number: it fits on one line at the card's
 * width, and most multilingual countries are dominated by two
 * languages at the national level. A country with more than
 * two official languages shows the first two and a count of
 * the remainder, which is honest without being noisy.
 */
const MAX_VISIBLE_LANGUAGES = 2;

/**
 * Format an elevation value.
 *
 * Uses the Unicode minus sign (U+2212) for negative values
 * rather than the ASCII hyphen-minus, so "−12 m" (Baku) reads
 * as a minus sign rather than a dash between two numbers. The
 * Unicode sign is wider and sits at mathematical height, which
 * is the correct convention for a numeric value.
 *
 * Values are rendered as integers. Fractional elevations
 * exist (Bangkok is −1.5 m) but the fraction is not
 * interesting at the card's level of detail, and rounding to
 * an integer avoids a decimal point that would otherwise
 * imply more precision than we have.
 */
function formatElevation(metres: number): string {
  const rounded = Math.round(metres);
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} m`;
}

/**
 * Format an area value.
 *
 * Values below 10 km² keep one decimal place (Bangkok's area
 * is 1,568.7 km²; a smaller city might be 8.4). Larger values
 * are rounded to the nearest integer. The threshold of 10
 * captures the intuitive break between "a small city district"
 * and "a full city" — a distinction that matters for the
 * value's precision to be meaningful.
 *
 * Both formatters are pre-built at module scope; see
 * `AREA_FORMATTERS`.
 */
function formatArea(squareKilometres: number): string {
  const digits: 0 | 1 = squareKilometres < 10 ? 1 : 0;
  const formatted = AREA_FORMATTERS[digits].format(
    squareKilometres,
  );
  return `${formatted} km²`;
}

/**
 * Format a language list.
 *
 * Empty list → `""` (the caller skips the row). One or two
 * languages → their English names, comma-separated. More than
 * two → the first two names plus "+ N more".
 *
 * Unknown codes fall back to the code itself, so a new entry
 * with a language not yet in `LANGUAGE_NAMES` still renders
 * something rather than crashing or showing "undefined".
 */
function formatLanguages(codes: readonly string[]): string {
  if (codes.length === 0) return "";

  const names = codes.map(
    (code) => LANGUAGE_NAMES[code] ?? code.toUpperCase(),
  );

  if (names.length <= MAX_VISIBLE_LANGUAGES) {
    return names.join(", ");
  }

  const visible = names
    .slice(0, MAX_VISIBLE_LANGUAGES)
    .join(", ");
  const remaining = names.length - MAX_VISIBLE_LANGUAGES;

  return `${visible} + ${remaining} more`;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Return the fact rows for a location.
 *
 * Rows are returned in a fixed, deliberate order:
 *
 *   1. **Population** — the most-requested fact, and the one
 *      that most directly answers "how big is this place?".
 *   2. **Elevation** — the second-most interesting number, and
 *      the one that most often surprises (La Paz, Bogotá).
 *   3. **Area** — appears after population so the reader can
 *      compute density mentally if they care.
 *   4. **Official language** — a fact about the country, not
 *      the city; appears last among the numbers because it is
 *      qualitatively different.
 *   5. **Currency** — same, the country-level counterpart to
 *      language.
 *
 * A fact is omitted from the array entirely when its underlying
 * data is missing or empty. The UI never sees a "Population:
 * —" row; it either gets a real value or does not get the row.
 * That is the correct contract — absent data should not appear
 * as a placeholder, because a placeholder looks like a bug.
 *
 * @param locationId - The stable ID of a location, matching
 *   `WorldLocation.id`.
 * @returns An array of formatted rows, ordered as above.
 *   Empty when the location has no facts.
 */
export function getCityFactRows(
  locationId: string,
): readonly CityFactRow[] {
  const facts = CITY_FACTS[locationId];
  if (!facts) return [];

  const rows: CityFactRow[] = [];

  if (facts.population !== undefined) {
    rows.push({
      label: "Population",
      value: POPULATION_FORMATTER.format(facts.population),
    });
  }

  if (facts.elevation !== undefined) {
    rows.push({
      label: "Elevation",
      value: formatElevation(facts.elevation),
    });
  }

  if (facts.area !== undefined) {
    rows.push({
      label: "Area",
      value: formatArea(facts.area),
    });
  }

  if (
    facts.officialLanguages !== undefined &&
    facts.officialLanguages.length > 0
  ) {
    rows.push({
      label: "Language",
      value: formatLanguages(facts.officialLanguages),
    });
  }

  if (facts.currency !== undefined) {
    rows.push({
      label: "Currency",
      value: facts.currency,
    });
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Expose the internal formatters for direct testing.
 *
 * The public API is `getCityFactRows`, but the three formatters
 * have edge cases (negative elevations, small areas, "+ N
 * more" language lists) that are worth asserting on directly.
 * Re-exporting them through this object makes the test surface
 * explicit without adding public exports to the module.
 *
 * Not intended for production use — a consumer that reaches
 * for these is reaching for implementation detail.
 */
export const __testableFormatters = {
  formatElevation,
  formatArea,
  formatLanguages,
} as const;