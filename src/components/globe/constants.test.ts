import { describe, expect, it } from "vitest";

import {
  ARRIVAL_DISTANCE_THRESHOLD,
  AUTO_ROTATE_RESUME_DELAY_MS,
  AUTO_ROTATE_SPEED,
  AXIS_MARKER_OPACITY,
  CAMERA_DISTANCE_STEPS,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_NEAR,
  DEFAULT_VISUAL_MODE,
  DESKTOP_INITIAL_CAMERA_STEP_INDEX,
  DRAG_SENSITIVITY,
  GLOBE_GROUP_NAME,
  INITIAL_CAMERA_DISTANCE,
  MARKER_ALTITUDE,
  MARKER_ALTITUDE_REALISTIC,
  MARKER_COLOR,
  MARKER_COLOR_FAVORITED,
  MARKER_COLOR_SELECTED,
  MARKER_HALO_OPACITY,
  MARKER_HALO_RADIUS,
  MARKER_RADIUS,
  MARKER_RADIUS_SELECTED,
  MAX_CAMERA_STEP_INDEX,
  MIN_CAMERA_STEP_INDEX,
  MOBILE_BREAKPOINT_PX,
  MOBILE_INITIAL_CAMERA_DISTANCE,
  MOBILE_INITIAL_CAMERA_STEP_INDEX,
  MOMENTUM_DECAY_PER_SECOND,
  MOMENTUM_MIN_VELOCITY,
  NORTH_RESET_DURATION,
  POLYGON_ALTITUDE,
  POLYGON_CAP_COLOR,
  POLYGON_SIDE_COLOR,
  POLYGON_STROKE_COLOR,
  RENDERER_TONE_MAPPING_EXPOSURE,
  SHOW_AXIS_MARKERS,
  SHOW_TERMINATOR_RING,
  SPHERE_COLOR,
  SPHERE_METALNESS,
  SPHERE_ROUGHNESS,
  SPHERE_SEGMENTS,
  SURFACE_FADE_END,
  SURFACE_FADE_START,
  TERMINATOR_OPACITY,
  TRAVEL_DURATION,
  TRAVEL_EASING_POWER,
  VISUAL_MODE_SCHEMA_VERSION,
  VISUAL_MODE_STORAGE_KEY,
  WHEEL_STEP_DELTA,
  getCameraDistanceForStep,
  getCameraDistanceLabel,
} from "@/components/globe/constants";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const RGBA_COLOR =
  /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i;

/* -------------------------------------------------------------------------- */
/* Scene graph                                                                */
/* -------------------------------------------------------------------------- */

describe("globe constants — scene graph", () => {
  it("GLOBE_GROUP_NAME is a non-empty string", () => {
    expect(typeof GLOBE_GROUP_NAME).toBe("string");
    expect(GLOBE_GROUP_NAME.length).toBeGreaterThan(0);
  });

  it("GLOBE_GROUP_NAME is a valid DOM element name", () => {
    /*
     * The name is used with `scene.getObjectByName`. Three.js
     * accepts arbitrary strings, but a name that does not fit
     * an HTML-compatible identifier cannot be a valid CSS
     * selector if a future debug helper tries to find the
     * group via the DOM. The kebab-case form is safe.
     */
    expect(GLOBE_GROUP_NAME).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

/* -------------------------------------------------------------------------- */
/* Camera                                                                     */
/* -------------------------------------------------------------------------- */

describe("globe constants — camera", () => {
  it("keeps the initial camera distance within the zoom range", () => {
    expect(INITIAL_CAMERA_DISTANCE).toBeGreaterThanOrEqual(
      CAMERA_MIN_DISTANCE,
    );
    expect(INITIAL_CAMERA_DISTANCE).toBeLessThanOrEqual(
      CAMERA_MAX_DISTANCE,
    );
  });

  it("has a zoom range with a positive span", () => {
    expect(CAMERA_MAX_DISTANCE).toBeGreaterThan(
      CAMERA_MIN_DISTANCE,
    );
  });

  it("uses a plausible field of view", () => {
    expect(CAMERA_FOV).toBeGreaterThan(0);
    expect(CAMERA_FOV).toBeLessThan(180);
  });

  it("uses a positive near plane", () => {
    expect(CAMERA_NEAR).toBeGreaterThan(0);
  });

  it("places the far plane beyond the near plane", () => {
    expect(CAMERA_FAR).toBeGreaterThan(CAMERA_NEAR);
  });

  it("mobile and desktop initial distances are within the zoom range", () => {
    expect(MOBILE_INITIAL_CAMERA_DISTANCE).toBeGreaterThanOrEqual(
      CAMERA_MIN_DISTANCE,
    );
    expect(MOBILE_INITIAL_CAMERA_DISTANCE).toBeLessThanOrEqual(
      CAMERA_MAX_DISTANCE,
    );
  });

  it("SURFACE_FADE_START is above SURFACE_FADE_END", () => {
    /*
     * The minimal sphere is opaque when zoomed out and
     * transparent when zoomed in. The start distance must be
     * greater than the end distance, or the fade runs in the
     * wrong direction.
     */
    expect(SURFACE_FADE_START).toBeGreaterThan(SURFACE_FADE_END);
  });

  it("the arrival threshold sits between the fade endpoints", () => {
    expect(ARRIVAL_DISTANCE_THRESHOLD).toBeLessThan(
      SURFACE_FADE_START,
    );
    expect(ARRIVAL_DISTANCE_THRESHOLD).toBeGreaterThan(
      SURFACE_FADE_END,
    );
  });

  it("uses a positive tone-mapping exposure", () => {
    expect(RENDERER_TONE_MAPPING_EXPOSURE).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Camera-distance ladder                                                     */
/* -------------------------------------------------------------------------- */

describe("globe constants — camera-distance ladder", () => {
  it("has at least two steps", () => {
    expect(CAMERA_DISTANCE_STEPS.length).toBeGreaterThanOrEqual(2);
  });

  it("is strictly increasing", () => {
    for (let i = 1; i < CAMERA_DISTANCE_STEPS.length; i += 1) {
      expect(CAMERA_DISTANCE_STEPS[i]).toBeGreaterThan(
        CAMERA_DISTANCE_STEPS[i - 1] as number,
      );
    }
  });

  it("has a MIN index of 0 and a MAX index at the last step", () => {
    expect(MIN_CAMERA_STEP_INDEX).toBe(0);
    expect(MAX_CAMERA_STEP_INDEX).toBe(
      CAMERA_DISTANCE_STEPS.length - 1,
    );
  });

  it("the desktop initial step resolves to INITIAL_CAMERA_DISTANCE", () => {
    expect(
      getCameraDistanceForStep(
        DESKTOP_INITIAL_CAMERA_STEP_INDEX,
      ),
    ).toBe(INITIAL_CAMERA_DISTANCE);
  });

  it("the mobile initial step resolves to MOBILE_INITIAL_CAMERA_DISTANCE", () => {
    expect(
      getCameraDistanceForStep(
        MOBILE_INITIAL_CAMERA_STEP_INDEX,
      ),
    ).toBe(MOBILE_INITIAL_CAMERA_DISTANCE);
  });

  it("the closest step matches CAMERA_MIN_DISTANCE", () => {
    expect(
      getCameraDistanceForStep(MIN_CAMERA_STEP_INDEX),
    ).toBe(CAMERA_MIN_DISTANCE);
  });

  it("the farthest step is below CAMERA_MAX_DISTANCE", () => {
    /*
     * The stepper stops at a comfortable wide distance; the
     * wheel can pull back further for a full-globe view.
     */
    expect(
      getCameraDistanceForStep(MAX_CAMERA_STEP_INDEX),
    ).toBeLessThan(CAMERA_MAX_DISTANCE);
  });
});

/* -------------------------------------------------------------------------- */
/* getCameraDistanceForStep                                                   */
/* -------------------------------------------------------------------------- */

describe("getCameraDistanceForStep", () => {
  it("returns the step at a valid index", () => {
    for (let i = 0; i < CAMERA_DISTANCE_STEPS.length; i += 1) {
      expect(getCameraDistanceForStep(i)).toBe(
        CAMERA_DISTANCE_STEPS[i],
      );
    }
  });

  it("clamps a negative index to the closest step", () => {
    expect(getCameraDistanceForStep(-1)).toBe(
      CAMERA_DISTANCE_STEPS[MIN_CAMERA_STEP_INDEX],
    );
    expect(getCameraDistanceForStep(-100)).toBe(
      CAMERA_DISTANCE_STEPS[MIN_CAMERA_STEP_INDEX],
    );
  });

  it("clamps a too-large index to the farthest step", () => {
    expect(getCameraDistanceForStep(999)).toBe(
      CAMERA_DISTANCE_STEPS[MAX_CAMERA_STEP_INDEX],
    );
    expect(
      getCameraDistanceForStep(MAX_CAMERA_STEP_INDEX + 1),
    ).toBe(CAMERA_DISTANCE_STEPS[MAX_CAMERA_STEP_INDEX]);
  });

  it("returns a finite positive number", () => {
    for (let i = -10; i < 20; i += 1) {
      const result = getCameraDistanceForStep(i);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(0);
    }
  });

  it("is idempotent — same input, same output", () => {
    for (let i = -5; i < 15; i += 1) {
      expect(getCameraDistanceForStep(i)).toBe(
        getCameraDistanceForStep(i),
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getCameraDistanceLabel                                                     */
/* -------------------------------------------------------------------------- */

describe("getCameraDistanceLabel", () => {
  it("returns 'closest' for the minimum index", () => {
    expect(getCameraDistanceLabel(MIN_CAMERA_STEP_INDEX)).toBe(
      "closest",
    );
  });

  it("returns 'widest' for the maximum index", () => {
    expect(getCameraDistanceLabel(MAX_CAMERA_STEP_INDEX)).toBe(
      "widest",
    );
  });

  it("clamps out-of-range indices the same way as the value function", () => {
    expect(getCameraDistanceLabel(-1)).toBe("closest");
    expect(getCameraDistanceLabel(999)).toBe("widest");
  });

  it("returns one of the six expected labels for every index", () => {
    const valid = new Set([
      "closest",
      "very close",
      "close",
      "medium",
      "wide",
      "widest",
    ]);

    for (
      let i = MIN_CAMERA_STEP_INDEX;
      i <= MAX_CAMERA_STEP_INDEX;
      i += 1
    ) {
      expect(valid.has(getCameraDistanceLabel(i))).toBe(true);
    }
  });

  it("is monotonic — labels move from closest to widest", () => {
    const order = [
      "closest",
      "very close",
      "close",
      "medium",
      "wide",
      "widest",
    ];

    let previousRank = -1;

    for (
      let i = MIN_CAMERA_STEP_INDEX;
      i <= MAX_CAMERA_STEP_INDEX;
      i += 1
    ) {
      const rank = order.indexOf(getCameraDistanceLabel(i));
      expect(rank).toBeGreaterThanOrEqual(previousRank);
      previousRank = rank;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Interaction                                                                */
/* -------------------------------------------------------------------------- */

describe("globe constants — interaction", () => {
  it("uses a positive drag sensitivity", () => {
    expect(DRAG_SENSITIVITY).toBeGreaterThan(0);
  });

  it("keeps momentum decay within (0, 1)", () => {
    /*
     * A decay factor of 1 means no decay; 0 means instant
     * stop. Both are degenerate; the value must be strictly
     * between.
     */
    expect(MOMENTUM_DECAY_PER_SECOND).toBeGreaterThan(0);
    expect(MOMENTUM_DECAY_PER_SECOND).toBeLessThan(1);
  });

  it("keeps the momentum cutoff below the auto-rotate speed", () => {
    /*
     * If the cutoff were above the auto-rotate speed, the
     * auto-rotate would immediately trigger the momentum
     * check and stop the spin.
     */
    expect(MOMENTUM_MIN_VELOCITY).toBeLessThan(AUTO_ROTATE_SPEED);
  });

  it("uses a positive auto-rotate speed", () => {
    expect(AUTO_ROTATE_SPEED).toBeGreaterThan(0);
  });

  it("uses a positive auto-rotate resume delay", () => {
    expect(AUTO_ROTATE_RESUME_DELAY_MS).toBeGreaterThan(0);
  });

  it("uses a positive wheel-step delta", () => {
    expect(WHEEL_STEP_DELTA).toBeGreaterThan(0);
  });

  it("uses a positive north-reset duration", () => {
    expect(NORTH_RESET_DURATION).toBeGreaterThan(0);
  });

  it("uses a mobile breakpoint matching Tailwind's sm:", () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(640);
  });
});

/* -------------------------------------------------------------------------- */
/* Animation                                                                  */
/* -------------------------------------------------------------------------- */

describe("globe constants — animation", () => {
  it("uses a positive travel duration", () => {
    expect(TRAVEL_DURATION).toBeGreaterThan(0);
  });

  it("uses an easing power greater than 1 so the curve eases out", () => {
    expect(TRAVEL_EASING_POWER).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Markers                                                                    */
/* -------------------------------------------------------------------------- */

describe("globe constants — markers", () => {
  it("uses a larger radius for the selected marker", () => {
    expect(MARKER_RADIUS_SELECTED).toBeGreaterThan(MARKER_RADIUS);
  });

  it("uses a halo larger than the selected marker", () => {
    expect(MARKER_HALO_RADIUS).toBeGreaterThan(
      MARKER_RADIUS_SELECTED,
    );
  });

  it("keeps the halo opacity between 0 and 1", () => {
    expect(MARKER_HALO_OPACITY).toBeGreaterThan(0);
    expect(MARKER_HALO_OPACITY).toBeLessThanOrEqual(1);
  });

  it("keeps marker altitude positive and small", () => {
    expect(MARKER_ALTITUDE).toBeGreaterThan(0);
    expect(MARKER_ALTITUDE).toBeLessThan(0.1);
  });

  it("places realistic-mode markers higher than minimal-mode markers", () => {
    /*
     * Realistic markers need to sit above the atmosphere
     * shell to avoid being clipped. Documented in the
     * constant's JSDoc.
     */
    expect(MARKER_ALTITUDE_REALISTIC).toBeGreaterThan(
      MARKER_ALTITUDE,
    );
  });

  it("defines all marker colors as 6-digit hex", () => {
    expect(MARKER_COLOR).toMatch(HEX_COLOR);
    expect(MARKER_COLOR_SELECTED).toMatch(HEX_COLOR);
    expect(MARKER_COLOR_FAVORITED).toMatch(HEX_COLOR);
  });

  it("gives the favorited color its own distinct value", () => {
    expect(MARKER_COLOR_FAVORITED).not.toBe(MARKER_COLOR_SELECTED);
    expect(MARKER_COLOR_FAVORITED).not.toBe(MARKER_COLOR);
  });
});

/* -------------------------------------------------------------------------- */
/* Country polygons                                                           */
/* -------------------------------------------------------------------------- */

describe("globe constants — country polygons", () => {
  it("defines polygon colors as rgba strings", () => {
    expect(POLYGON_CAP_COLOR).toMatch(RGBA_COLOR);
    expect(POLYGON_SIDE_COLOR).toMatch(RGBA_COLOR);
    expect(POLYGON_STROKE_COLOR).toMatch(RGBA_COLOR);
  });

  it("keeps polygon altitude positive and small", () => {
    expect(POLYGON_ALTITUDE).toBeGreaterThan(0);
    expect(POLYGON_ALTITUDE).toBeLessThan(0.1);
  });

  it("places polygons closer to the surface than markers", () => {
    expect(POLYGON_ALTITUDE).toBeLessThan(MARKER_ALTITUDE);
  });
});

/* -------------------------------------------------------------------------- */
/* Sphere                                                                     */
/* -------------------------------------------------------------------------- */

describe("globe constants — sphere", () => {
  it("uses a high segment count for a smooth surface", () => {
    expect(SPHERE_SEGMENTS).toBeGreaterThanOrEqual(64);
  });

  it("uses an even segment count for symmetric geometry", () => {
    expect(SPHERE_SEGMENTS % 2).toBe(0);
  });

  it("defines the sphere color as a 6-digit hex", () => {
    expect(SPHERE_COLOR).toMatch(HEX_COLOR);
  });

  it("keeps roughness and metalness within [0, 1]", () => {
    expect(SPHERE_ROUGHNESS).toBeGreaterThanOrEqual(0);
    expect(SPHERE_ROUGHNESS).toBeLessThanOrEqual(1);
    expect(SPHERE_METALNESS).toBeGreaterThanOrEqual(0);
    expect(SPHERE_METALNESS).toBeLessThanOrEqual(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Visual mode                                                                */
/* -------------------------------------------------------------------------- */

describe("globe constants — visual mode", () => {
  it("DEFAULT_VISUAL_MODE is one of the two valid modes", () => {
    expect(["minimal", "realistic"]).toContain(
      DEFAULT_VISUAL_MODE,
    );
  });

  it("VISUAL_MODE_STORAGE_KEY is a namespaced string", () => {
    expect(VISUAL_MODE_STORAGE_KEY).toMatch(/^world-clock:/);
  });

  it("VISUAL_MODE_SCHEMA_VERSION is a positive integer", () => {
    expect(Number.isInteger(VISUAL_MODE_SCHEMA_VERSION)).toBe(true);
    expect(VISUAL_MODE_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Terminator                                                                 */
/* -------------------------------------------------------------------------- */

describe("globe constants — terminator", () => {
  it("keeps the terminator opacity within [0, 1]", () => {
    expect(TERMINATOR_OPACITY).toBeGreaterThanOrEqual(0);
    expect(TERMINATOR_OPACITY).toBeLessThanOrEqual(1);
  });

  it("keeps the axis-marker opacity within [0, 1]", () => {
    expect(AXIS_MARKER_OPACITY).toBeGreaterThanOrEqual(0);
    expect(AXIS_MARKER_OPACITY).toBeLessThanOrEqual(1);
  });

  it("exposes boolean visibility flags", () => {
    expect(typeof SHOW_TERMINATOR_RING).toBe("boolean");
    expect(typeof SHOW_AXIS_MARKERS).toBe("boolean");
  });
});