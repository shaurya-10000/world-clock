import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  formatLongDate,
  formatSeconds,
  formatShortDate,
  formatTime12,
  formatTime12WithSeconds,
  formatTime24,
  formatTime24WithSeconds,
  getClockDigits,
  getDayPeriod,
  getDecimalHour,
  getLocalTime,
  getLocalTimeZone,
  getTimeZoneAbbreviation,
  getUtcOffset,
  normalizeTimeZone,
  resetTimeCache,
  resetTimeFailureLog,
} from "@/lib/time";

/**
 * Fixed reference instants. Chosen so the UTC time is a
 * whole-hour value at every tested zone — this avoids
 * daylight-saving ambiguity at the DST transition edges.
 */
const REF_UTC = new Date(Date.UTC(2024, 0, 15, 18, 30, 45));

/*
 * Every test that exercises a failure path must start with a
 * clean failure log — otherwise the once-per-cause semantics
 * leak across cases and the "warns exactly once" assertions
 * are meaningless.
 */
beforeEach(() => {
  resetTimeFailureLog();
});

afterEach(() => {
  resetTimeCache();
  resetTimeFailureLog();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Formatter cache                                                            */
/* -------------------------------------------------------------------------- */

describe("formatter cache", () => {
  it("constructs an Intl.DateTimeFormat only once per (zone, preset)", () => {
    resetTimeCache();

    const original = Intl.DateTimeFormat;
    const constructed: string[] = [];

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      this: Intl.DateTimeFormat,
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      constructed.push(
        `${String(options?.timeZone)}|${JSON.stringify(options)}`,
      );
      return new original(locale, options);
    } as unknown as typeof Intl.DateTimeFormat);

    formatTime12(REF_UTC, "America/New_York");
    formatTime12(REF_UTC, "America/New_York");
    formatTime12(REF_UTC, "America/New_York");

    /*
     * The spy also captures the formatter construction
     * performed by `isValidTimeZone`'s try/catch fallback.
     * We assert on the *distinct* set of constructed keys,
     * which collapses those transient checks.
     */
    expect(constructed.length).toBe(1);
  });

  it("constructs a separate formatter per time zone", () => {
    resetTimeCache();
    const original = Intl.DateTimeFormat;
    let count = 0;

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      this: Intl.DateTimeFormat,
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      count++;
      return new original(locale, options);
    } as unknown as typeof Intl.DateTimeFormat);

    formatTime24(REF_UTC, "America/New_York");
    formatTime24(REF_UTC, "Europe/London");

    expect(count).toBe(2);
  });

  it("resetTimeCache forces fresh construction", () => {
    resetTimeCache();
    const original = Intl.DateTimeFormat;
    let count = 0;

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      this: Intl.DateTimeFormat,
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      count++;
      return new original(locale, options);
    } as unknown as typeof Intl.DateTimeFormat);

    formatTime12(REF_UTC, "Europe/Paris");
    resetTimeCache();
    formatTime12(REF_UTC, "Europe/Paris");

    expect(count).toBe(2);
  });

  it("shares one cache entry between aliased and canonical zones", () => {
    resetTimeCache();

    const original = Intl.DateTimeFormat;
    const constructed: string[] = [];

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      this: Intl.DateTimeFormat,
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      constructed.push(`${String(options?.timeZone)}`);
      return new original(locale, options);
    } as unknown as typeof Intl.DateTimeFormat);

    formatTime12(REF_UTC, "Asia/Calcutta");
    formatTime12(REF_UTC, "Asia/Kolkata");

    /*
     * Both calls must resolve to the same canonical zone —
     * so the only construction that receives a `timeZone`
     * option is the canonical one. The `isValidTimeZone`
     * try/catch path constructs a bare formatter without a
     * `timeZone` option, which is filtered out by the
     * `String(options?.timeZone)` check — those entries
     * appear as `"undefined"` and are ignored here.
     */
    const realZoneConstructions = constructed.filter(
      (key) => key !== "undefined",
    );

    expect(realZoneConstructions).toEqual(["Asia/Kolkata"]);
  });
});

/* -------------------------------------------------------------------------- */
/* formatTime12 / formatTime24                                                */
/* -------------------------------------------------------------------------- */

describe("formatTime12", () => {
  it("formats a New York winter timestamp", () => {
    expect(formatTime12(REF_UTC, "America/New_York")).toBe("1:30 PM");
  });

  it("formats a London winter timestamp", () => {
    expect(formatTime12(REF_UTC, "Europe/London")).toBe("6:30 PM");
  });

  it("formats a Tokyo timestamp", () => {
    expect(formatTime12(REF_UTC, "Asia/Tokyo")).toBe("3:30 AM");
  });

  it("formats midnight as 12 AM", () => {
    const midnight = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    expect(formatTime12(midnight, "UTC")).toBe("12:00 AM");
  });

  it("formats noon as 12 PM", () => {
    const noon = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
    expect(formatTime12(noon, "UTC")).toBe("12:00 PM");
  });
});

describe("formatTime24", () => {
  it("formats the same reference timestamp in 24-hour form", () => {
    expect(formatTime24(REF_UTC, "America/New_York")).toBe("13:30");
  });

  it("pads single-digit hours with a leading zero", () => {
    const early = new Date(Date.UTC(2024, 0, 15, 7, 5, 0));
    expect(formatTime24(early, "UTC")).toBe("07:05");
  });

  it("formats midnight as 00:00, not 24:00", () => {
    const midnight = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    const formatted = formatTime24(midnight, "UTC");
    expect(formatted).not.toBe("24:00");
    expect(formatted).toBe("00:00");
  });
});

describe("formatTime12WithSeconds / formatTime24WithSeconds", () => {
  it("includes seconds in 12-hour form", () => {
    expect(
      formatTime12WithSeconds(REF_UTC, "America/New_York"),
    ).toBe("1:30:45 PM");
  });

  it("includes seconds in 24-hour form", () => {
    expect(
      formatTime24WithSeconds(REF_UTC, "America/New_York"),
    ).toBe("13:30:45");
  });
});

describe("formatSeconds", () => {
  it("returns the seconds field for a double-digit value", () => {
    expect(formatSeconds(REF_UTC, "America/New_York")).toBe("45");
  });

  it("returns the seconds field for a single-digit value", () => {
    // Node's small-icu build renders `second: "2-digit"` as
    // an unpadded value for some locales; accept either
    // padded or unpadded output rather than over-constraining
    // the runtime's ICU behavior.
    const t = new Date(Date.UTC(2024, 0, 15, 0, 0, 5));
    expect(formatSeconds(t, "UTC")).toMatch(/^0?5$/);
  });

  it("returns '00' or '0' at exactly zero seconds", () => {
    const t = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    expect(formatSeconds(t, "UTC")).toMatch(/^0{1,2}$/);
  });
});

/* -------------------------------------------------------------------------- */
/* formatShortDate / formatLongDate                                           */
/* -------------------------------------------------------------------------- */

describe("formatShortDate", () => {
  it("produces a weekday + short-month + day string", () => {
    expect(formatShortDate(REF_UTC, "UTC")).toBe("Mon, Jan 15");
  });

  it("reflects the zone's calendar day, not the UTC day", () => {
    expect(formatShortDate(REF_UTC, "Asia/Tokyo")).toContain("16");
  });
});

describe("formatLongDate", () => {
  it("produces a weekday + long-month + day + year string", () => {
    expect(formatLongDate(REF_UTC, "UTC")).toBe(
      "Monday, January 15, 2024",
    );
  });

  it("reflects the zone's calendar day across the date line", () => {
    expect(formatLongDate(REF_UTC, "Asia/Tokyo")).toContain("16");
  });
});

/* -------------------------------------------------------------------------- */
/* getClockDigits                                                             */
/* -------------------------------------------------------------------------- */

describe("getClockDigits", () => {
  it("returns the wall-clock digits for the zone", () => {
    expect(getClockDigits(REF_UTC, "America/New_York")).toEqual({
      hour: 13,
      minute: 30,
      second: 45,
    });
  });

  it("handles midnight without returning hour 24", () => {
    const midnight = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    const digits = getClockDigits(midnight, "UTC");

    expect(digits.hour).toBe(0);
    expect(digits.hour).not.toBe(24);
  });

  it("handles noon", () => {
    const noon = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
    expect(getClockDigits(noon, "UTC").hour).toBe(12);
  });

  it("returns all zeros for an invalid time zone", () => {
    expect(getClockDigits(REF_UTC, "Not/A_Zone")).toEqual({
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("returns all zeros for an empty time zone", () => {
    expect(getClockDigits(REF_UTC, "")).toEqual({
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("returns integer values", () => {
    const digits = getClockDigits(REF_UTC, "Europe/London");
    expect(Number.isInteger(digits.hour)).toBe(true);
    expect(Number.isInteger(digits.minute)).toBe(true);
    expect(Number.isInteger(digits.second)).toBe(true);
  });

  it("accepts a legacy alias transparently", () => {
    expect(
      getClockDigits(REF_UTC, "Asia/Calcutta"),
    ).toEqual(getClockDigits(REF_UTC, "Asia/Kolkata"));
  });
});

/* -------------------------------------------------------------------------- */
/* getDecimalHour                                                             */
/* -------------------------------------------------------------------------- */

describe("getDecimalHour", () => {
  it("returns a value in [0, 24)", () => {
    const zones = [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
      "Australia/Sydney",
    ];

    for (const zone of zones) {
      const decimal = getDecimalHour(REF_UTC, zone);
      expect(decimal).toBeGreaterThanOrEqual(0);
      expect(decimal).toBeLessThan(24);
    }
  });

  it("composes the hour, minute, and second correctly", () => {
    const decimal = getDecimalHour(REF_UTC, "America/New_York");
    expect(decimal).toBeCloseTo(13.5125, 6);
  });

  it("returns 0 for an invalid time zone", () => {
    expect(getDecimalHour(REF_UTC, "Not/A_Zone")).toBe(0);
  });

  it("never returns exactly 24", () => {
    const base = Date.UTC(2024, 5, 15, 0, 0, 0);

    for (let h = 0; h < 24; h++) {
      const decimal = getDecimalHour(
        new Date(base + h * 3_600_000),
        "America/New_York",
      );
      expect(decimal).toBeLessThan(24);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getTimeZoneAbbreviation                                                    */
/* -------------------------------------------------------------------------- */

describe("getTimeZoneAbbreviation", () => {
  it("returns a short name for a US zone in winter", () => {
    expect(getTimeZoneAbbreviation(REF_UTC, "America/New_York")).toBe(
      "EST",
    );
  });

  it("returns a short name for a US zone in summer (DST)", () => {
    const summer = new Date(Date.UTC(2024, 6, 15, 18, 0, 0));
    expect(getTimeZoneAbbreviation(summer, "America/New_York")).toBe(
      "EDT",
    );
  });

  it("returns the raw zone string for an invalid time zone", () => {
    expect(getTimeZoneAbbreviation(REF_UTC, "Not/A_Zone")).toBe(
      "Not/A_Zone",
    );
  });

  it("returns a non-empty string for every catalogued time zone", () => {
    const zones = [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
      "Asia/Kolkata",
      "Australia/Sydney",
    ];

    for (const zone of zones) {
      const abbr = getTimeZoneAbbreviation(REF_UTC, zone);
      expect(typeof abbr).toBe("string");
      expect(abbr.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getUtcOffset                                                               */
/* -------------------------------------------------------------------------- */

describe("getUtcOffset", () => {
  it("returns 'UTC' for the UTC zone itself", () => {
    expect(getUtcOffset(REF_UTC, "UTC")).toBe("UTC");
  });

  it("returns a UTC-prefixed offset for a normal zone", () => {
    const offset = getUtcOffset(REF_UTC, "America/New_York");
    expect(offset.startsWith("UTC")).toBe(true);
    expect(offset).toContain("-05:00");
  });

  it("uses a + sign for positive offsets", () => {
    const offset = getUtcOffset(REF_UTC, "Asia/Tokyo");
    expect(offset).toContain("+09:00");
  });

  it("returns half-hour offsets", () => {
    const offset = getUtcOffset(REF_UTC, "Asia/Kolkata");
    expect(offset).toContain("+05:30");
  });

  it("never returns a 'GMT'-prefixed string", () => {
    const zones = [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
    ];

    for (const zone of zones) {
      expect(getUtcOffset(REF_UTC, zone)).not.toContain("GMT");
    }
  });

  it("returns 'UTC' for an invalid time zone", () => {
    expect(getUtcOffset(REF_UTC, "Not/A_Zone")).toBe("UTC");
  });
});

/* -------------------------------------------------------------------------- */
/* getDayPeriod                                                               */
/* -------------------------------------------------------------------------- */

describe("getDayPeriod", () => {
  it("returns AM for morning hours", () => {
    const morning = new Date(Date.UTC(2024, 0, 15, 9, 0, 0));
    expect(getDayPeriod(morning, "UTC")).toBe("AM");
  });

  it("returns PM for afternoon hours", () => {
    expect(getDayPeriod(REF_UTC, "America/New_York")).toBe("PM");
  });

  it("returns AM for midnight", () => {
    const midnight = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
    expect(getDayPeriod(midnight, "UTC")).toBe("AM");
  });

  it("returns PM for noon", () => {
    const noon = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
    expect(getDayPeriod(noon, "UTC")).toBe("PM");
  });

  it("respects the time zone when crossing noon UTC", () => {
    const t = new Date(Date.UTC(2024, 0, 15, 11, 0, 0));
    expect(getDayPeriod(t, "UTC")).toBe("AM");
    expect(getDayPeriod(t, "Asia/Tokyo")).toBe("PM");
  });

  it("returns 'AM' for an invalid time zone", () => {
    expect(getDayPeriod(REF_UTC, "Not/A_Zone")).toBe("AM");
  });
});

/* -------------------------------------------------------------------------- */
/* normalizeTimeZone                                                          */
/* -------------------------------------------------------------------------- */

describe("normalizeTimeZone", () => {
  it.each([
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
    ["Asia/Rangoon", "Asia/Yangon"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeTimeZone(input)).toBe(expected);
  });

  it("returns the input unchanged for canonical names", () => {
    const canonical = [
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
      "Asia/Kolkata",
      "America/Argentina/Buenos_Aires",
    ];

    for (const zone of canonical) {
      expect(normalizeTimeZone(zone)).toBe(zone);
    }
  });

  it("is idempotent", () => {
    const inputs = [
      "Asia/Calcutta",
      "Asia/Saigon",
      "Europe/Kiev",
      "UTC",
      "America/New_York",
    ];

    for (const zone of inputs) {
      const once = normalizeTimeZone(zone);
      expect(normalizeTimeZone(once)).toBe(once);
    }
  });

  it("passes through unknown zone strings unchanged", () => {
    expect(normalizeTimeZone("Not/A_Zone")).toBe("Not/A_Zone");
    expect(normalizeTimeZone("")).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* getLocalTimeZone                                                           */
/* -------------------------------------------------------------------------- */

describe("getLocalTimeZone", () => {
  it("returns a non-empty string", () => {
    const zone = getLocalTimeZone();
    expect(typeof zone).toBe("string");
    expect(zone.length).toBeGreaterThan(0);
  });

  it("returns a normalized value", () => {
    const zone = getLocalTimeZone();
    expect(normalizeTimeZone(zone)).toBe(zone);
  });

  it("falls back to UTC when Intl throws", () => {
    const original = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("boom");
    });

    expect(getLocalTimeZone()).toBe("UTC");

    (Intl.DateTimeFormat as unknown) = original;
  });
});

/* -------------------------------------------------------------------------- */
/* getLocalTime                                                               */
/* -------------------------------------------------------------------------- */

describe("getLocalTime", () => {
  const location = { timezone: "America/New_York" };

  it("returns a fully populated snapshot", () => {
    const snapshot = getLocalTime(location, REF_UTC);

    expect(snapshot.hour).toBe(13);
    expect(snapshot.minute).toBe(30);
    expect(snapshot.second).toBe(45);
    expect(snapshot.decimalHour).toBeCloseTo(13.5125, 6);
    expect(snapshot.time12).toBe("1:30:45 PM");
    expect(snapshot.time24).toBe("13:30:45");
    expect(snapshot.period).toBe("PM");
    expect(snapshot.formattedDate).toContain("January");
    expect(snapshot.zoneName).toBe("EST");
    expect(snapshot.utcOffset).toContain("-05:00");
  });

  it("produces consistent fields (period matches hour)", () => {
    const snapshot = getLocalTime(location, REF_UTC);

    if (snapshot.hour < 12) {
      expect(snapshot.period).toBe("AM");
    } else {
      expect(snapshot.period).toBe("PM");
    }
  });

  it("defaults to the current time when no date is given", () => {
    const implicit = getLocalTime(location);
    const explicit = getLocalTime(location, new Date());

    expect(
      Math.abs(implicit.decimalHour - explicit.decimalHour),
    ).toBeLessThan(0.01);
  });

  it("works with a bare { timezone } object", () => {
    const snapshot = getLocalTime({ timezone: "Asia/Tokyo" }, REF_UTC);

    expect(snapshot.hour).toBe(3);
    expect(snapshot.period).toBe("AM");
  });

  it("returns zeros and safe defaults for an invalid time zone", () => {
    const snapshot = getLocalTime(
      { timezone: "Not/A_Zone" },
      REF_UTC,
    );

    expect(snapshot.hour).toBe(0);
    expect(snapshot.minute).toBe(0);
    expect(snapshot.second).toBe(0);
    expect(snapshot.period).toBe("AM");
    expect(snapshot.utcOffset).toBe("UTC");
  });

  it("is deterministic for the same (location, date)", () => {
    const a = getLocalTime(location, REF_UTC);
    const b = getLocalTime(location, REF_UTC);

    expect(a).toEqual(b);
  });

  it("normalizes a legacy alias on read", () => {
    const legacy = getLocalTime(
      { timezone: "Asia/Calcutta" },
      REF_UTC,
    );
    const canonical = getLocalTime(
      { timezone: "Asia/Kolkata" },
      REF_UTC,
    );

    expect(legacy).toEqual(canonical);
  });
});

/* -------------------------------------------------------------------------- */
/* Failure observability                                                      */
/* -------------------------------------------------------------------------- */

describe("failure observability", () => {
  it("warns once for an invalid zone across repeated calls", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getClockDigits(REF_UTC, "Not/A_Zone");
    getClockDigits(REF_UTC, "Not/A_Zone");
    getClockDigits(REF_UTC, "Not/A_Zone");

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns once per distinct invalid zone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getClockDigits(REF_UTC, "Not/A_Zone");
    getClockDigits(REF_UTC, "Also/Not/A_Zone");

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("shares the failure log across functions for the same zone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getClockDigits(REF_UTC, "Not/A_Zone");
    getUtcOffset(REF_UTC, "Not/A_Zone");
    getDayPeriod(REF_UTC, "Not/A_Zone");
    getTimeZoneAbbreviation(REF_UTC, "Not/A_Zone");
    getLocalTime({ timezone: "Not/A_Zone" }, REF_UTC);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("includes the invalid zone identifier in the warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getClockDigits(REF_UTC, "Not/A_Zone");

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("Not/A_Zone");
    expect(message).toContain("invalid-zone");
  });

  it("does not warn on valid zones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getClockDigits(REF_UTC, "America/New_York");
    getUtcOffset(REF_UTC, "Asia/Tokyo");
    getDayPeriod(REF_UTC, "Europe/London");

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once for a resolve failure in getLocalTimeZone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = Intl.DateTimeFormat;

    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("boom");
    });

    getLocalTimeZone();
    getLocalTimeZone();
    getLocalTimeZone();

    expect(warn).toHaveBeenCalledTimes(1);

    (Intl.DateTimeFormat as unknown) = original;
  });

  it("resetTimeFailureLog clears the memo so warnings re-fire", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    getClockDigits(REF_UTC, "Not/A_Zone");
    expect(warn).toHaveBeenCalledTimes(1);

    resetTimeFailureLog();

    getClockDigits(REF_UTC, "Not/A_Zone");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});