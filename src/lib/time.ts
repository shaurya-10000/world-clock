/**
 * Time formatting and time zone utilities.
 *
 * `Intl.DateTimeFormat` construction is expensive (roughly
 * 10–40µs per instance on mid-tier mobile hardware), and the
 * previous implementation built several of them on every
 * animation frame for every visible city.
 *
 * Every formatter produced by this module is cached by
 * `(timeZone, preset)` and reused for the lifetime of the
 * page. Time zone identifiers are normalized through
 * `normalizeTimeZone` before being used as cache keys, so a
 * legacy alias (`Asia/Calcutta`) and its canonical form
 * (`Asia/Kolkata`) share one cache entry.
 *
 * A single locale is assumed throughout; if multi-locale
 * support is ever added, extend the cache key rather than
 * threading a `locale` argument through every caller.
 *
 * All formatters are safe to call concurrently — `Intl`
 * instances are immutable and reentrant.
 *
 * ## Failure observability
 *
 * Every function in this module that would otherwise silently
 * swallow an `Intl` failure routes it through
 * `reportFailure`, which emits exactly one `console.warn` per
 * distinct `(reason, timeZone)` pair for the lifetime of the
 * page. This keeps field issues — deprecated zones, missing
 * ICU data, unusual environment behavior — visible in logs
 * without spamming on the hot path when the same zone fails
 * on every tick.
 *
 * ## ICU variance
 *
 * `Intl` output is not byte-identical across ICU builds. Two
 * specific differences matter here:
 *
 *   1. Midnight under `hour12: false` renders as `"24:00"` on
 *      some builds (Ubuntu's, notably) and `"00:00"` on
 *      others (Windows, macOS). `formatTime24` normalizes to
 *      `"00:00"`.
 *
 *   2. The zero-offset time zone name renders as `"GMT"` on
 *      some builds, `"UTC"` on others, and `"UTC+00:00"` or
 *      `"GMT+00:00"` on yet others. `getUtcOffset` collapses
 *      every variant to `"UTC"`.
 *
 * Both normalizations exist so the same code produces the
 * same output on every platform. Without them, tests pass on
 * the developer's machine and fail in CI.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const LOCALE = "en-US";

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/**
 * Some runtimes render midnight as hour `24` under
 * `hour12: false`. The standard astronomical convention is
 * `00`, so we normalize on read.
 */
const MIDNIGHT_AS_24 = 24;

/**
 * The upper bound of the decimal hour range, `[0, 24)`.
 *
 * `getDecimalHour` clamps to just below this so a leap-second
 * ICU output of `"60"` for the seconds field cannot produce
 * exactly `24`, which `getAtmosphere` would wrap to `0` and
 * misclassify as night.
 */
const MAX_DECIMAL_HOUR = 24;

/* -------------------------------------------------------------------------- */
/* Failure reporting                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reasons that can cause this module to fall back to a safe
 * default. Kept as a small closed union so the warn message is
 * always actionable.
 */
type FailureReason =
  | "invalid-zone"
  | "format-failed"
  | "resolve-failed";

/**
 * Set of `(reason, timeZone)` pairs already reported. Bounded
 * by the number of distinct zones a page ever touches — at
 * most a few hundred even in the worst case — so it never
 * grows unbounded in practice.
 */
const reportedFailures = new Set<string>();

/**
 * Warn once per `(reason, timeZone)` pair.
 *
 * The first time a given zone fails for a given reason we emit
 * a single `console.warn` with enough context to identify the
 * zone and reason. Subsequent identical failures are silent,
 * which is what lets the hot path call this on every tick
 * without spamming the console.
 *
 * Never throws. A logger failure is not a reason to break
 * rendering.
 */
function reportFailure(
  reason: FailureReason,
  timeZone: string,
): void {
  const key = `${reason}|${timeZone}`;
  if (reportedFailures.has(key)) {
    return;
  }
  reportedFailures.add(key);

  console.warn(
    `[time] ${reason} for time zone "${timeZone}"; ` +
      "returning a safe default. This warning fires once per " +
      "(reason, zone) pair.",
  );
}

/**
 * Reset the failure-reporting memo. Exported for tests only.
 */
export function resetTimeFailureLog(): void {
  reportedFailures.clear();
}

/* -------------------------------------------------------------------------- */
/* Time zone normalization                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Some environments (older Safari, certain Linux builds)
 * resolve to a deprecated IANA name such as `Asia/Calcutta`,
 * which `Intl.DateTimeFormat` still accepts but which produces
 * inconsistent `timeZoneName` output. Normalize here, before
 * a zone identifier reaches the cache or `Intl`.
 *
 * Every value must itself be a canonical identifier that
 * `Intl.DateTimeFormat` accepts without an alias hop.
 */
const TIME_ZONE_ALIASES: Readonly<Record<string, string>> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

export function normalizeTimeZone(timeZone: string): string {
  return TIME_ZONE_ALIASES[timeZone] ?? timeZone;
}

/* -------------------------------------------------------------------------- */
/* Formatter cache                                                            */
/* -------------------------------------------------------------------------- */

type PresetName =
  | "hms24"
  | "hms12"
  | "hm12"
  | "hm24"
  | "h12"
  | "seconds"
  | "weekdayShortMonthDay"
  | "weekdayLongMonthDayYear"
  | "timeZoneNameShort"
  | "timeZoneNameLongOffset";

const PRESETS: Readonly<
  Record<PresetName, Intl.DateTimeFormatOptions>
> = {
  hms24: {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  },
  hms12: {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  },
  hm12: {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  },
  hm24: {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  },
  h12: {
    hour: "numeric",
    hour12: true,
  },
  seconds: {
    second: "2-digit",
  },
  weekdayShortMonthDay: {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
  weekdayLongMonthDayYear: {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  },
  timeZoneNameShort: {
    timeZoneName: "short",
  },
  timeZoneNameLongOffset: {
    timeZoneName: "longOffset",
  },
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Memo of zones this module has already validated.
 *
 * `isValidTimeZone` is expensive on runtimes without
 * `Intl.supportedValuesOf`: it constructs a throwaway
 * `Intl.DateTimeFormat`. The memo pays for itself on any
 * surface that formats more than one city.
 */
const validationCache = new Map<string, boolean>();

/**
 * True when the runtime accepts the given IANA identifier.
 *
 * Prefers `Intl.supportedValuesOf("timeZone")` where available
 * because that avoids a throwing construction. The
 * spec-mandated list is not exhaustive — it omits `UTC` and
 * some legacy aliases on some runtimes even though
 * `Intl.DateTimeFormat` accepts them — so a miss falls
 * through to a real construction attempt.
 *
 * Expects a normalized identifier. Callers should run the
 * input through `normalizeTimeZone` first.
 */
function isValidTimeZone(timeZone: string): boolean {
  const cached = validationCache.get(timeZone);
  if (cached !== undefined) return cached;

  let valid = false;

  if (typeof Intl.supportedValuesOf === "function") {
    try {
      if (Intl.supportedValuesOf("timeZone").includes(timeZone)) {
        valid = true;
      }
    } catch {
      /* The spec permits a throw; fall through to the probe. */
    }
  }

  if (!valid) {
    try {
      new Intl.DateTimeFormat(LOCALE, { timeZone });
      valid = true;
    } catch {
      valid = false;
    }
  }

  validationCache.set(timeZone, valid);
  return valid;
}

/**
 * Look up (or build) the formatter for a normalized zone and
 * preset.
 *
 * The zone is normalized here, not by callers, so that every
 * consumer — direct or transitively via `formatTime12`,
 * `getClockDigits`, etc. — shares one cache entry per
 * `(canonical zone, preset)` pair.
 */
function getFormatter(
  timeZone: string,
  preset: PresetName,
): Intl.DateTimeFormat {
  const normalized = normalizeTimeZone(timeZone);
  const key = `${normalized}|${preset}`;

  const cached = formatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: normalized,
    ...PRESETS[preset],
  });

  formatterCache.set(key, formatter);

  return formatter;
}

/**
 * Clear the formatter and validation caches.
 *
 * Exported for tests only. Production code has no reason to
 * call this — the cache exists precisely so formatters are
 * built once and reused.
 */
export function resetTimeCache(): void {
  formatterCache.clear();
  validationCache.clear();
}

/* -------------------------------------------------------------------------- */
/* Formatted strings                                                          */
/* -------------------------------------------------------------------------- */

export function formatTime12(date: Date, timeZone: string): string {
  return getFormatter(timeZone, "hm12").format(date);
}

/**
 * 24-hour time string, with midnight normalized to `"00:00"`.
 *
 * ## Why the replacement
 *
 * Some ICU builds render midnight under `hour12: false` as
 * `"24:00"` rather than `"00:00"`. Ubuntu's Node distribution
 * is one such build; Windows' is not. The difference shows up
 * as a test failure on CI that passes locally, which is worse
 * than a straight bug because it looks like flakiness.
 *
 * The `^24:` anchor means the substitution only fires when
 * `24` is followed by a colon at the start of the string. A
 * value like `"12:24"` is left alone — its `24` is in the
 * minutes position, not the hours.
 */
export function formatTime24(date: Date, timeZone: string): string {
  const formatted = getFormatter(timeZone, "hm24").format(date);
  return formatted.replace(/^24:/, "00:");
}

export function formatTime12WithSeconds(
  date: Date,
  timeZone: string,
): string {
  return getFormatter(timeZone, "hms12").format(date);
}

export function formatTime24WithSeconds(
  date: Date,
  timeZone: string,
): string {
  const formatted = getFormatter(timeZone, "hms24").format(date);
  return formatted.replace(/^24:/, "00:");
}

export function formatSeconds(
  date: Date,
  timeZone: string,
): string {
  return getFormatter(timeZone, "seconds").format(date);
}

export function formatShortDate(
  date: Date,
  timeZone: string,
): string {
  return getFormatter(timeZone, "weekdayShortMonthDay").format(date);
}

export function formatLongDate(
  date: Date,
  timeZone: string,
): string {
  return getFormatter(timeZone, "weekdayLongMonthDayYear").format(date);
}

/* -------------------------------------------------------------------------- */
/* Numeric extraction                                                         */
/* -------------------------------------------------------------------------- */

export interface ClockDigits {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * The zeroed digit tuple every failure path returns. Frozen
 * so a caller that mutates the returned object cannot corrupt
 * every subsequent failure path in the process.
 */
const ZERO_DIGITS: ClockDigits = Object.freeze({
  hour: 0,
  minute: 0,
  second: 0,
});

/**
 * Extract the local hour, minute, and second for a time zone.
 *
 * Uses a single cached formatter plus `formatToParts`, rather
 * than three separate formatters. Returns `{ 0, 0, 0 }` if
 * the time zone is invalid.
 */
export function getClockDigits(
  date: Date,
  timeZone: string,
): ClockDigits {
  const normalized = normalizeTimeZone(timeZone);

  if (!isValidTimeZone(normalized)) {
    reportFailure("invalid-zone", normalized);
    return ZERO_DIGITS;
  }

  try {
    const parts = getFormatter(normalized, "hms24").formatToParts(
      date,
    );

    let hour = 0;
    let minute = 0;
    let second = 0;

    for (const part of parts) {
      switch (part.type) {
        case "hour":
          hour = Number(part.value);
          break;
        case "minute":
          minute = Number(part.value);
          break;
        case "second":
          second = Number(part.value);
          break;
        default:
          /* ignore other parts (dayPeriod, literal, etc.) */
          break;
      }
    }

    /*
     * Some runtimes render midnight as "24" when
     * `hour12: false`. Normalize. See the constant's
     * docstring.
     */
    if (hour === MIDNIGHT_AS_24) hour = 0;

    return { hour, minute, second };
  } catch {
    reportFailure("format-failed", normalized);
    return ZERO_DIGITS;
  }
}

/**
 * Local time-of-day as a decimal hour in `[0, 24)`.
 *
 * This is the input to `getAtmosphere` and to any visual that
 * varies continuously with time-of-day.
 */
export function getDecimalHour(
  date: Date,
  timeZone: string,
): number {
  const { hour, minute, second } = getClockDigits(date, timeZone);

  const raw =
    hour +
    minute / MINUTES_PER_HOUR +
    second / SECONDS_PER_HOUR;

  return Math.min(raw, MAX_DECIMAL_HOUR - Number.EPSILON);
}

/* -------------------------------------------------------------------------- */
/* Time zone metadata                                                         */
/* -------------------------------------------------------------------------- */

/** Short time-zone name (e.g. "EDT", "GMT+5:30"). */
export function getTimeZoneAbbreviation(
  date: Date,
  timeZone: string,
): string {
  const normalized = normalizeTimeZone(timeZone);

  if (!isValidTimeZone(normalized)) {
    reportFailure("invalid-zone", normalized);
    return timeZone;
  }

  try {
    const parts = getFormatter(
      normalized,
      "timeZoneNameShort",
    ).formatToParts(date);

    return (
      parts.find((part) => part.type === "timeZoneName")?.value ??
      timeZone
    );
  } catch {
    reportFailure("format-failed", normalized);
    return timeZone;
  }
}

/**
 * UTC offset string (e.g. `"UTC-04:00"`, `"UTC"`).
 *
 * ## Why the output is not passed through verbatim
 *
 * `Intl` renders the `longOffset` time-zone name in one of
 * several shapes depending on the ICU build:
 *
 *   - `"GMT"` — some Linux builds, for the zero offset.
 *   - `"UTC"` — some builds, for the zero offset.
 *   - `"GMT+00:00"` — most builds, for the zero offset.
 *   - `"UTC+00:00"` — Ubuntu's build, for the zero offset.
 *   - `"GMT-05:00"` — most builds, for a non-zero offset.
 *   - `"UTC-05:00"` — Ubuntu's build, for a non-zero offset.
 *
 * The rest of the app calls the zero offset `"UTC"` and every
 * other offset `"UTC±HH:MM"`. The two normalizations below
 * collapse every input shape to one of those two forms.
 *
 * ## Zero offset
 *
 * `"UTC+00:00"` and `"UTC-00:00"` are both semantically the
 * zero offset. Neither sign carries information. Both are
 * collapsed to `"UTC"`.
 *
 * ## Non-zero offsets
 *
 * The `GMT` prefix (if present) is rewritten to `UTC`. The
 * offset value itself — sign, hours, minutes — is left
 * untouched.
 */
export function getUtcOffset(
  date: Date,
  timeZone: string,
): string {
  const normalized = normalizeTimeZone(timeZone);

  if (!isValidTimeZone(normalized)) {
    reportFailure("invalid-zone", normalized);
    return "UTC";
  }

  try {
    const parts = getFormatter(
      normalized,
      "timeZoneNameLongOffset",
    ).formatToParts(date);

    const raw =
      parts.find((part) => part.type === "timeZoneName")?.value ?? "";

    if (raw.length === 0) {
      return "UTC";
    }

    /* Normalize the `GMT` prefix to `UTC`. */
    const withUtcPrefix = raw.replace(/^(GMT|UTC)/, "UTC");

    /* Collapse the zero offset, with either sign, to `UTC`. */
    if (
      withUtcPrefix === "UTC+00:00" ||
      withUtcPrefix === "UTC-00:00"
    ) {
      return "UTC";
    }

    return withUtcPrefix;
  } catch {
    reportFailure("format-failed", normalized);
    return "UTC";
  }
}

/** AM / PM for the given time zone. */
export function getDayPeriod(
  date: Date,
  timeZone: string,
): "AM" | "PM" {
  const normalized = normalizeTimeZone(timeZone);

  if (!isValidTimeZone(normalized)) {
    reportFailure("invalid-zone", normalized);
    return "AM";
  }

  try {
    const parts = getFormatter(normalized, "h12").formatToParts(
      date,
    );

    const period =
      parts.find((part) => part.type === "dayPeriod")?.value ??
      "AM";

    return period.toUpperCase() === "PM" ? "PM" : "AM";
  } catch {
    reportFailure("format-failed", normalized);
    return "AM";
  }
}

/**
 * The browser's resolved local time zone, normalized.
 * Returns `"UTC"` in non-browser environments.
 */
export function getLocalTimeZone(): string {
  if (typeof window === "undefined") {
    return "UTC";
  }

  try {
    return normalizeTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    reportFailure("resolve-failed", "browser");
    return "UTC";
  }
}

/* -------------------------------------------------------------------------- */
/* Composite                                                                  */
/* -------------------------------------------------------------------------- */

export type ClockMode = "analog" | "digital";
export type TimeFormat = "12h" | "24h";

/**
 * The complete local-time snapshot for a location.
 *
 * Bundles everything the clock face and its surrounding labels
 * need, computed from a single `Date` and cached formatters.
 * Replaces the previous inline implementation in
 * `WorldClockSection`, which built seven `Intl` formatters per
 * second.
 */
export interface LocalTime {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly decimalHour: number;
  readonly time12: string;
  readonly time24: string;
  readonly period: "AM" | "PM";
  readonly formattedDate: string;
  readonly zoneName: string;
  readonly utcOffset: string;
}

/**
 * Compute the complete local-time snapshot for a location.
 *
 * The `location` parameter is typed structurally rather than
 * against `WorldLocation` so this function can also be used
 * with a bare `{ timezone }` object.
 *
 * If the time zone is invalid, returns a fully-populated
 * object with zeroed digits and safe string defaults, so
 * consumers can render without a null check.
 */
export function getLocalTime(
  location: { readonly timezone: string },
  date: Date = new Date(),
): LocalTime {
  const { timezone } = location;
  const normalized = normalizeTimeZone(timezone);

  if (!isValidTimeZone(normalized)) {
    reportFailure("invalid-zone", normalized);
    return {
      hour: 0,
      minute: 0,
      second: 0,
      decimalHour: 0,
      time12: "",
      time24: "",
      period: "AM",
      formattedDate: "",
      zoneName: timezone,
      utcOffset: "UTC",
    };
  }

  const { hour, minute, second } = getClockDigits(
    date,
    normalized,
  );

  const decimalHour = Math.min(
    hour +
      minute / MINUTES_PER_HOUR +
      second / SECONDS_PER_HOUR,
    MAX_DECIMAL_HOUR - Number.EPSILON,
  );

  return {
    hour,
    minute,
    second,
    decimalHour,
    time12: formatTime12WithSeconds(date, normalized),
    time24: formatTime24WithSeconds(date, normalized),
    period: getDayPeriod(date, normalized),
    formattedDate: formatLongDate(date, normalized),
    zoneName: getTimeZoneAbbreviation(date, normalized),
    utcOffset: getUtcOffset(date, normalized),
  };
}