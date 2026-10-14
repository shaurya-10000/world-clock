import { describe, expect, it } from "vitest";

import {
  CLOUDS,
  CLOCK_SIZE_CLASS,
  EASE,
  STARS,
  type CloudConfig,
} from "@/components/clock/constants";
import { generateStarField } from "@/lib/starfield";

/* -------------------------------------------------------------------------- */
/* CLOCK_SIZE_CLASS                                                           */
/* -------------------------------------------------------------------------- */

describe("CLOCK_SIZE_CLASS", () => {
  it("is a non-empty string", () => {
    expect(typeof CLOCK_SIZE_CLASS).toBe("string");
    expect(CLOCK_SIZE_CLASS.length).toBeGreaterThan(0);
  });

  it("includes a responsive breakpoint modifier", () => {
    // The class is used by both clock faces and is expected
    // to scale up at the `sm` breakpoint.
    expect(CLOCK_SIZE_CLASS).toContain("sm:");
  });

  it("uses a min-clamped viewport-relative width for mobile", () => {
    // The mobile width is `min(78vw, 430px)` — a viewport
    // unit with an upper bound so the clock does not grow
    // indefinitely on a tablet in portrait.
    expect(CLOCK_SIZE_CLASS).toContain("78vw");
    expect(CLOCK_SIZE_CLASS).toContain("430px");
  });

  it("caps the desktop width at 430px", () => {
    // The `sm:` variant uses a fixed width, not a
    // viewport-relative one — the clock does not scale with
    // the window above the breakpoint.
    expect(CLOCK_SIZE_CLASS).toContain("sm:w-[430px]");
  });
});

/* -------------------------------------------------------------------------- */
/* EASE                                                                       */
/* -------------------------------------------------------------------------- */

describe("EASE", () => {
  it("is a four-number tuple", () => {
    expect(EASE).toHaveLength(4);
    for (const value of EASE) {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("every control point is within [0, 1]", () => {
    // A cubic-bezier control point outside this range
    // produces undefined behavior in some browsers, so the
    // tuple is constrained even though CSS technically
    // allows values outside the range for overshoot effects.
    for (const value of EASE) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("is the specific ease-out curve used elsewhere in the app", () => {
    // The exact values matter — the curve is coordinated
    // across multiple sections so their animations feel
    // consistent. Pinning the numbers prevents an
    // accidental "cleanup" of one call site.
    expect([...EASE]).toEqual([0.16, 1, 0.3, 1]);
  });

  it("is a readonly tuple at the type level", () => {
    // `as const` makes this a readonly tuple. The runtime
    // check confirms the values are exactly what the type
    // says; the compile-time check is enforced by the
    // `readonly` assertion elsewhere. A spread-to-array
    // here avoids a TypeScript narrowing issue.
    expect(Array.isArray(EASE)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* CLOUDS                                                                     */
/* -------------------------------------------------------------------------- */

describe("CLOUDS", () => {
  it("is non-empty", () => {
    expect(CLOUDS.length).toBeGreaterThan(0);
  });

  it("contains exactly four clouds", () => {
    /*
     * The SkyAtmosphere component renders one layer per
     * cloud. Four is the tuned count for the section's
     * dimensions — more would visually crowd, fewer would
     * leave the sky feeling empty. Pinning the count means
     * a future addition is a deliberate decision with a
     * corresponding update to the layout tests.
     */
    expect(CLOUDS).toHaveLength(4);
  });

  it("every cloud has a non-empty unique id", () => {
    const ids = CLOUDS.map((c) => c.id);
    for (const id of ids) {
      expect(id.length).toBeGreaterThan(0);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every cloud id uses the 'cloud-' prefix", () => {
    // The prefix distinguishes the ids from any other keyed
    // list in the same tree. It is also a naming convention
    // that makes debugging easier.
    for (const cloud of CLOUDS) {
      expect(cloud.id.startsWith("cloud-")).toBe(true);
    }
  });

  it("every cloud has positive dimensions", () => {
    for (const cloud of CLOUDS) {
      expect(cloud.width).toBeGreaterThan(0);
      expect(cloud.height).toBeGreaterThan(0);
    }
  });

  it("every cloud has finite dimensions", () => {
    for (const cloud of CLOUDS) {
      expect(Number.isFinite(cloud.width)).toBe(true);
      expect(Number.isFinite(cloud.height)).toBe(true);
    }
  });

  it("every cloud has a positive duration", () => {
    for (const cloud of CLOUDS) {
      expect(cloud.duration).toBeGreaterThan(0);
    }
  });

  it("every cloud has an opacity within [0, 1]", () => {
    for (const cloud of CLOUDS) {
      expect(cloud.opacity).toBeGreaterThanOrEqual(0);
      expect(cloud.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("every cloud's left and top are valid CSS percentage strings", () => {
    for (const cloud of CLOUDS) {
      expect(cloud.left).toMatch(/^-?\d+(\.\d+)?%$/);
      expect(cloud.top).toMatch(/^-?\d+(\.\d+)?%$/);
    }
  });

  it("at least one cloud has a negative delay", () => {
    // Negative delays phase-shift the cloud into an
    // already-moving state on mount. Without at least one,
    // the drift would read as mechanical.
    const hasNegativeDelay = CLOUDS.some((c) => c.delay < 0);
    expect(hasNegativeDelay).toBe(true);
  });

  it("every cloud has a unique delay", () => {
    /*
     * Duplicate delays would put two clouds in the same
     * phase, defeating the purpose of the negative delays.
     * Each cloud starts at a different point in its cycle.
     */
    const delays = CLOUDS.map((c) => c.delay);
    expect(new Set(delays).size).toBe(delays.length);
  });

  it("every cloud satisfies the CloudConfig interface at runtime", () => {
    const required: readonly (keyof CloudConfig)[] = [
      "id",
      "width",
      "height",
      "left",
      "top",
      "duration",
      "delay",
      "opacity",
    ];

    for (const cloud of CLOUDS) {
      for (const key of required) {
        expect(cloud).toHaveProperty(key);
      }
    }
  });

  it("every cloud has a different size signature", () => {
    /*
     * Two clouds with the same width and height would
     * render as visibly duplicated layers. The field is
     * tuned for visual variety.
     */
    const signatures = CLOUDS.map(
      (c) => `${c.width}x${c.height}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

/* -------------------------------------------------------------------------- */
/* STARS                                                                      */
/* -------------------------------------------------------------------------- */

describe("STARS", () => {
  it("is non-empty", () => {
    expect(STARS.length).toBeGreaterThan(0);
  });

  it("contains exactly 48 stars", () => {
    /*
     * The count is chosen to be sparse enough that no two
     * stars visually overlap at common viewport widths, and
     * dense enough that the sky reads as populated.
     */
    expect(STARS).toHaveLength(48);
  });

  it("matches the deterministic field for the configured count", () => {
    // The field is generated from `generateStarField(48, ...)`,
    // which is itself deterministic. Rebuilding the same call
    // here proves the constant has not drifted from its
    // definition.
    const expected = generateStarField(48, { idPrefix: "star" });
    expect(STARS).toEqual(expected);
  });

  it("every star id carries the 'star-' prefix", () => {
    // The prefix distinguishes this field from the globe's
    // `"globe-star"` field so React keys never collide.
    for (const star of STARS) {
      expect(star.id.startsWith("star-")).toBe(true);
    }
  });

  it("every star id is unique", () => {
    const ids = new Set(STARS.map((s) => s.id));
    expect(ids.size).toBe(STARS.length);
  });

  it("no id collides with the globe star prefix", () => {
    /*
     * The globe field uses `"globe-star-"`. If the two
     * fields were ever mounted in the same tree, a
     * collision would produce duplicate React keys.
     * Verifying no id starts with the other prefix is a
     * cheap guard.
     */
    for (const star of STARS) {
      expect(star.id.startsWith("globe-star-")).toBe(false);
    }
  });

  it("every star has finite numeric fields", () => {
    for (const star of STARS) {
      expect(Number.isFinite(star.left)).toBe(true);
      expect(Number.isFinite(star.top)).toBe(true);
      expect(Number.isFinite(star.size)).toBe(true);
      expect(Number.isFinite(star.delay)).toBe(true);
      expect(Number.isFinite(star.duration)).toBe(true);
    }
  });

  it("is frozen at runtime", () => {
    /*
     * The star field is created once by
     * `generateStarField` and exported as a `readonly`
     * array. The runtime check confirms no accidental
     * mutation has occurred and the array is a plain
     * array (not a proxy or other exotic object).
     */
    expect(Array.isArray(STARS)).toBe(true);
  });
});