import { describe, expect, it } from "vitest";

import { formatOverrideTimestamp } from "@/components/globe/TimeOverrideBanner";

describe("formatOverrideTimestamp — format", () => {
  it("appends the UTC suffix", () => {
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 5, 20, 20, 51),
    );
    expect(result).toMatch(/ UTC$/);
  });

  it("renders the year, month name, day, hour, and minute", () => {
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 5, 20, 20, 51),
    );
    expect(result).toContain("2024");
    expect(result).toContain("June");
    expect(result).toContain("20");
    expect(result).toContain("20:51");
  });

  it("pads the hour and minute to two digits", () => {
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 0, 5, 3, 7),
    );
    /* January 5, 2024 at 03:07 UTC. */
    expect(result).toContain("03:07");
  });

  it("uses a 24-hour clock — never AM or PM", () => {
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 5, 20, 20, 51),
    );
    expect(result).not.toMatch(/\bAM\b|\bPM\b/i);
  });

  it("uses the medium month name, not a number or abbreviation", () => {
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 5, 20, 20, 51),
    );
    expect(result).toContain("June");
    expect(result).not.toContain("Jun ");
    expect(result).not.toContain("/06/");
  });
});

describe("formatOverrideTimestamp — time zone", () => {
  it("formats the instant in UTC regardless of the host time zone", () => {
    /*
     * The banner describes astronomical moments, which are
     * conventionally quoted in UTC. The formatter is
     * configured with `timeZone: "UTC"`, so the output must
     * not depend on the environment's local zone. We assert
     * by feeding a timestamp and checking that a UTC-midnight
     * instant renders as 00:00.
     */
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 0, 1, 0, 0),
    );
    expect(result).toContain("00:00");
  });

  it("renders an end-of-day instant without rolling into the next day", () => {
    const result = formatOverrideTimestamp(
      Date.UTC(2024, 0, 1, 23, 59),
    );
    expect(result).toContain("23:59");
    expect(result).toContain("January");
    expect(result).toContain("1");
  });
});

describe("formatOverrideTimestamp — boundaries", () => {
  it("accepts an epoch-ms number and produces a string", () => {
    const result = formatOverrideTimestamp(0);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles a pre-1970 timestamp without throwing", () => {
    /*
     * Solstice/equinox calculations can legitimately produce
     * instants before the epoch if the user's "now" is
     * pre-1970 (unlikely in production, but the formatter
     * should be total). This pins that it does not throw.
     */
    expect(() =>
      formatOverrideTimestamp(Date.UTC(1969, 6, 20, 20, 0)),
    ).not.toThrow();
  });

  it("is deterministic — the same input produces the same output", () => {
    const ms = Date.UTC(2025, 5, 20, 20, 42);
    expect(formatOverrideTimestamp(ms)).toBe(
      formatOverrideTimestamp(ms),
    );
  });
});