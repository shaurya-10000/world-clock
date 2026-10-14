import { describe, expect, it } from "vitest";

import { splitTimeParts } from "@/components/clock/DigitalClock";

/* -------------------------------------------------------------------------- */
/* 12-hour inputs                                                             */
/* -------------------------------------------------------------------------- */

describe("splitTimeParts — 12-hour inputs", () => {
  it("splits a 12-hour string into digits and AM", () => {
    expect(splitTimeParts("3:30:45 AM")).toEqual({
      digits: "3:30:45",
      period: "AM",
    });
  });

  it("splits a 12-hour string into digits and PM", () => {
    expect(splitTimeParts("11:59:59 PM")).toEqual({
      digits: "11:59:59",
      period: "PM",
    });
  });

  it("handles midnight as 12:00:00 AM", () => {
    expect(splitTimeParts("12:00:00 AM")).toEqual({
      digits: "12:00:00",
      period: "AM",
    });
  });

  it("handles noon as 12:00:00 PM", () => {
    expect(splitTimeParts("12:00:00 PM")).toEqual({
      digits: "12:00:00",
      period: "PM",
    });
  });

  it("handles a single-digit hour", () => {
    expect(splitTimeParts("1:05:03 PM")).toEqual({
      digits: "1:05:03",
      period: "PM",
    });
  });

  it("handles a two-digit hour", () => {
    expect(splitTimeParts("11:05:03 AM")).toEqual({
      digits: "11:05:03",
      period: "AM",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Case handling                                                              */
/* -------------------------------------------------------------------------- */

describe("splitTimeParts — case handling", () => {
  it("accepts lowercase am/pm", () => {
    expect(splitTimeParts("7:00:00 am")).toEqual({
      digits: "7:00:00",
      period: "am",
    });
  });

  it("accepts mixed-case Am/Pm", () => {
    expect(splitTimeParts("7:00:00 Pm")).toEqual({
      digits: "7:00:00",
      period: "Pm",
    });
  });

  it("preserves the input case in the returned period", () => {
    /*
     * The regex matches case-insensitively but returns the
     * matched substring exactly as it appeared. Callers that
     * need a canonical case must normalize themselves. This
     * pins the non-normalizing contract.
     */
    expect(splitTimeParts("7:00:00 aM").period).toBe("aM");
    expect(splitTimeParts("7:00:00 AM").period).toBe("AM");
  });
});

/* -------------------------------------------------------------------------- */
/* 24-hour inputs                                                             */
/* -------------------------------------------------------------------------- */

describe("splitTimeParts — 24-hour inputs", () => {
  it("returns the input as digits when no period is present", () => {
    expect(splitTimeParts("15:30:45")).toEqual({
      digits: "15:30:45",
      period: "",
    });
  });

  it("preserves the leading zero in 24-hour strings", () => {
    expect(splitTimeParts("03:30:45")).toEqual({
      digits: "03:30:45",
      period: "",
    });
  });

  it("handles 00:00:00", () => {
    expect(splitTimeParts("00:00:00")).toEqual({
      digits: "00:00:00",
      period: "",
    });
  });

  it("handles 23:59:59", () => {
    expect(splitTimeParts("23:59:59")).toEqual({
      digits: "23:59:59",
      period: "",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Edge cases                                                                 */
/* -------------------------------------------------------------------------- */

describe("splitTimeParts — edge cases", () => {
  it("returns empty parts for an empty string", () => {
    expect(splitTimeParts("")).toEqual({
      digits: "",
      period: "",
    });
  });

  it("does not misinterpret AM/PM inside the digits", () => {
    /*
     * The regex requires whitespace before the period and
     * the period at the end of the string. `"AM:30:45"`
     * has neither, so it passes through unchanged.
     */
    expect(splitTimeParts("AM:30:45")).toEqual({
      digits: "AM:30:45",
      period: "",
    });
  });

  it("captures only the final AM/PM token", () => {
    /*
     * The non-greedy `.+?` plus the end anchor make the
     * regex backtrack to the *last* whitespace-separated
     * AM/PM token. So `"3:30:45 AM PM"` splits at the
     * last space, leaving `"3:30:45 AM"` as the digits.
     */
    expect(splitTimeParts("3:30:45 AM PM")).toEqual({
      digits: "3:30:45 AM",
      period: "PM",
    });
  });

  it("does not match a trailing period token without a preceding space", () => {
    /*
     * `"3:30:45AM"` has no whitespace before `AM`, so the
     * regex fails to match and the input passes through
     * unchanged.
     */
    expect(splitTimeParts("3:30:45AM")).toEqual({
      digits: "3:30:45AM",
      period: "",
    });
  });

  it("does not match a trailing period token without an anchor match", () => {
    /*
     * `"AM"` alone has no digits and no whitespace — it is
     * a bare token. It passes through unchanged.
     */
    expect(splitTimeParts("AM")).toEqual({
      digits: "AM",
      period: "",
    });
  });

  it("handles multiple spaces before the period", () => {
    /*
     * `\s+` matches one or more whitespace characters, so
     * extra spaces are absorbed rather than captured.
     */
    expect(splitTimeParts("3:30:45    AM")).toEqual({
      digits: "3:30:45",
      period: "AM",
    });
  });

  it("handles a tab before the period", () => {
    /*
     * `\s+` includes tabs, newlines, and other whitespace.
     */
    expect(splitTimeParts("3:30:45\tAM")).toEqual({
      digits: "3:30:45",
      period: "AM",
    });
  });

  it("preserves trailing whitespace inside the digits group when the period is absent", () => {
    /*
     * `"3:30:45 "` has no AM/PM token, so the regex fails
     * to match. The whole string — including its trailing
     * space — is returned as digits.
     */
    expect(splitTimeParts("3:30:45 ")).toEqual({
      digits: "3:30:45 ",
      period: "",
    });
  });

  it("is deterministic — same input, same output", () => {
    for (const input of [
      "3:30:45 AM",
      "15:30:45",
      "12:00:00 AM",
      "3:30:45 AM PM",
      "",
    ]) {
      expect(splitTimeParts(input)).toEqual(splitTimeParts(input));
    }
  });

  it("returns a fresh object on every call", () => {
    const a = splitTimeParts("3:30:45 AM");
    const b = splitTimeParts("3:30:45 AM");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});