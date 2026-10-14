/**
 * Globe rendering constants.
 *
 * Every tunable value that influences the globe's visual or
 * interactive behavior lives here. This keeps the camera feel,
 * marker sizing, and travel timing adjustable without reading
 * through component code.
 *
 * ## Reading this file
 *
 * The file is grouped by concern:
 *
 *   1. Scene graph   — names used to find objects in the tree.
 *   2. Camera        — position, FOV, clipping, distance ladder.
 *   3. Interaction   — drag, momentum, auto-rotate, wheel.
 *   4. Animation     — travel timing and easing.
 *   5. Markers       — size, altitude, colors.
 *   6. Polygons      — country border fill and stroke.
 *   7. Sphere        — the base sphere geometry and material.
 *   8. Visual mode   — persisted preference.
 *   9. Terminator    — the day/night ring and polar axis marks.
 *  10. Realistic globe — texture URLs and PBR tuning.
 *  11. Realistic clouds — the cloud shell.
 *  12. Realistic atmosphere — the rim shell.
 *
 * Values are not ordered by importance within a group — they
 * are ordered top-to-bottom in roughly the order a reader
 * would want to understand the subsystem. Reference-style
 * comments (e.g. "this is `3` on the ladder") are inline;
 * design-rationale comments (e.g. "why `3.6` and not `3.5`")
 * are in the JSDoc above each constant.
 */

/* -------------------------------------------------------------------------- */
/* Scene graph                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The name assigned to the globe group in the R3F scene tree.
 *
 * `GlobeScene` sets this name on the `<group>` that wraps the
 * sphere, country polygons, markers, and arrival card.
 * `SolarSampler` looks the group up by name via
 * `scene.getObjectByName` to read its quaternion, which is the
 * rotation between geographic coordinates and world space.
 *
 * Do not inline this string anywhere else. Import it.
 */
export const GLOBE_GROUP_NAME = "world-clock-globe" as const;

/* -------------------------------------------------------------------------- */
/* Camera                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Default camera distance on desktop, in world units.
 *
 * At `FOV = 42°`, the geometric relationship between camera
 * distance and the vertical extent of the frustum is:
 *
 *   visibleHeight = 2 · distance · tan(FOV / 2)
 *
 * At distance `3.6`, visibleHeight ≈ `2.76` world units. The
 * globe's diameter is `3.10`, so the sphere is slightly larger
 * than the visible frame at this distance — the poles clip
 * against the top and bottom edges, and the user sees the
 * globe filling the section with no margin.
 *
 * `DESKTOP_INITIAL_CAMERA_STEP_INDEX` resolves to this value.
 */
export const INITIAL_CAMERA_DISTANCE = 3.6;

/**
 * Default camera distance on mobile, in world units.
 *
 * Same as desktop. The mobile section is taller relative to
 * its width, so a sphere that fills the vertical frame sits
 * comfortably inside it with no wasted horizontal space.
 *
 * ## Relationship to `MOBILE_INITIAL_CAMERA_STEP_INDEX`
 *
 * `MOBILE_INITIAL_CAMERA_STEP_INDEX` resolves to this value
 * via the distance ladder. The two constants are kept
 * separate so the mobile-specific *step* can change without
 * touching the ladder. If they ever diverge, this constant is
 * the one to update — the step index resolves through
 * `getCameraDistanceForStep`.
 */
export const MOBILE_INITIAL_CAMERA_DISTANCE = 3.6;

/**
 * Minimum camera distance, in world units.
 *
 * `2.6` — close, but with the near face of the sphere still
 * comfortably inside the frustum. The previous value (`2.0`)
 * put the camera close enough that the sphere's silhouette
 * clipped the frustum edges, producing a "zoomed through the
 * surface" feeling.
 *
 * This is both the closest step on the ladder and the hard
 * floor for wheel/pinch zoom. Keeping them equal means the
 * stepper's `+` button and the wheel cannot disagree about
 * how close is allowed.
 */
export const CAMERA_MIN_DISTANCE = 2.6;

/**
 * Maximum camera distance, in world units.
 *
 * `9.0` — comfortably past the ladder's farthest step, so the
 * user can zoom out a bit further than the last tick if they
 * use the wheel. At `9.0` the globe occupies roughly 40% of
 * the viewport height, which is the "whole Earth from orbit"
 * view.
 */
export const CAMERA_MAX_DISTANCE = 9.0;

/**
 * The discrete camera distances the stepper cycles through.
 *
 * Ordered from closest to furthest. Seven steps with roughly
 * proportional spacing (~10–19% per step), so each press feels
 * like a visible nudge rather than a lurch.
 *
 * The closest step (`2.6`) matches `CAMERA_MIN_DISTANCE` — the
 * stepper cannot go closer than the wheel allows. The farthest
 * step (`5.8`) sits below `CAMERA_MAX_DISTANCE` on purpose: the
 * stepper stops at a comfortable "wide but still detailed"
 * distance, while the wheel can pull back further for a full
 * globe view.
 *
 * The array is `as const` so its length is known at compile
 * time — `MAX_CAMERA_STEP_INDEX` derives from it and several
 * consumers key arrays and modulo operations off that.
 */
export const CAMERA_DISTANCE_STEPS = [
  2.6, 2.9, 3.2, 3.6, 4.2, 5.0, 5.8,
] as const;

/**
 * The index into `CAMERA_DISTANCE_STEPS` that the stepper
 * starts at on desktop.
 *
 * `3` is `3.6` — the default distance. The globe fills the
 * section's height with no margin, matching the reference
 * framing.
 */
export const DESKTOP_INITIAL_CAMERA_STEP_INDEX = 3;

/**
 * The index into `CAMERA_DISTANCE_STEPS` that the stepper
 * starts at on mobile.
 *
 * Same as desktop. Kept as a separate constant so the two can
 * diverge without touching the ladder itself.
 *
 * Note that this is the *step index*, not the *distance*. The
 * initial distance on mobile is `MOBILE_INITIAL_CAMERA_DISTANCE`,
 * which happens to equal the distance at this index — a
 * coincidence the two constants maintain. If they ever drift,
 * the step index is the source of truth for the camera's
 * initial position at mount time.
 */
export const MOBILE_INITIAL_CAMERA_STEP_INDEX = 3;

/** The bounds of the camera-distance ladder. */
export const MIN_CAMERA_STEP_INDEX = 0;
export const MAX_CAMERA_STEP_INDEX =
  CAMERA_DISTANCE_STEPS.length - 1;

/**
 * The camera distance at a given ladder index.
 *
 * Clamps out-of-range indices to the nearest end.
 *
 * ## Why the extra `satisfies`-style read
 *
 * `CAMERA_DISTANCE_STEPS[clamped]` has type
 * `number | undefined` because TypeScript cannot prove that
 * `clamped` is a valid index of a `readonly` tuple. The
 * `clamped` value is guaranteed to be in range by the two
 * `Math.min`/`Math.max` calls above, so the non-null assertion
 * is safe — but it produces a value that is still typed
 * `number` rather than the narrower literal type of the tuple
 * element, which is the correct behavior here. Callers want a
 * `number`, not `2.6 | 2.9 | ...`.
 */
export function getCameraDistanceForStep(index: number): number {
  const clamped = Math.min(
    Math.max(index, MIN_CAMERA_STEP_INDEX),
    MAX_CAMERA_STEP_INDEX,
  );

  return CAMERA_DISTANCE_STEPS[clamped] as number;
}

/**
 * The accessible label for a camera-distance step.
 *
 * Maps each step of the seven-step ladder to a descriptive
 * category. The sequence is monotonic: as the index grows, the
 * label moves from "closest" through "medium" to "widest".
 *
 * The boundaries are inclusive on the lower end — index `4`
 * is "medium", index `5` is "wide". The specific split is
 * tuned against the 7-step ladder; changing the ladder length
 * without re-checking these thresholds would leave a label
 * unused or double-used.
 */
export function getCameraDistanceLabel(index: number): string {
  if (index <= 0) return "closest";
  if (index >= MAX_CAMERA_STEP_INDEX) return "widest";

  if (index <= 1) return "very close";
  if (index <= 2) return "close";
  if (index <= 4) return "medium";
  return "wide";
}

/**
 * Viewport-width breakpoint, in CSS pixels, below which the
 * mobile initial camera distance is used.
 *
 * Matches Tailwind's `sm:` breakpoint (`640px`).
 */
export const MOBILE_BREAKPOINT_PX = 640;

/**
 * Camera distance at which the minimal globe's shader fades
 * out, revealing the realistic textured sphere underneath.
 *
 * `SURFACE_FADE_START` is the distance at which the minimal
 * sphere is fully opaque. `SURFACE_FADE_END` is the distance
 * at which it is fully transparent. The two are consumed by
 * `computeSurfaceOpacity` in `EarthSphere.tsx`, which
 * interpolates linearly between them.
 *
 * `SURFACE_FADE_START` is above `SURFACE_FADE_END` — the
 * minimal sphere is visible when zoomed out and fades away as
 * the camera approaches. Do not invert them.
 */
export const SURFACE_FADE_START = 3.6;
export const SURFACE_FADE_END = 2.9;

/**
 * Camera distance at which the arrival card appears over the
 * selected location.
 *
 * `3.2` — the card appears when the camera has zoomed past the
 * default distance, signalling that the user has focused on
 * the selected city rather than browsing.
 */
export const ARRIVAL_DISTANCE_THRESHOLD = 3.2;

/** Camera vertical field of view, in degrees. */
export const CAMERA_FOV = 42;

/** Near clipping plane distance. */
export const CAMERA_NEAR = 0.05;

/** Far clipping plane distance. */
export const CAMERA_FAR = 100;

/** Renderer tone-mapping exposure. */
export const RENDERER_TONE_MAPPING_EXPOSURE = 1.05;

/* -------------------------------------------------------------------------- */
/* Interaction                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Radians of globe rotation per pixel of pointer drag.
 *
 * Tuned so a full-width drag (about 900px on desktop) rotates
 * the globe roughly π radians — half a turn. A drag across the
 * whole viewport flips the far hemisphere into view in a single
 * gesture, which is what users expect from a globe.
 */
export const DRAG_SENSITIVITY = 0.0035;

/**
 * Exponential velocity decay per second after the pointer is
 * released.
 *
 * The globe's angular velocity is multiplied by this factor
 * once per second, i.e. `velocity *= decay^dt`. `0.02` means
 * velocity drops to 2% of its release value after one second —
 * a short, tactile glide that does not feel floaty.
 */
export const MOMENTUM_DECAY_PER_SECOND = 0.02;

/**
 * Velocity below which momentum is considered finished.
 *
 * Radians per second. Prevents an asymptotic tail of
 * imperceptible spin that keeps the render loop active forever.
 */
export const MOMENTUM_MIN_VELOCITY = 0.01;

/**
 * Idle auto-rotation speed, in radians per second.
 *
 * A slow Y-axis spin that runs when the user has not touched
 * the globe. Makes the globe feel alive on load and
 * communicates interactivity before the user reads any UI.
 */
export const AUTO_ROTATE_SPEED = 0.06;

/**
 * Milliseconds of inactivity after which auto-rotate resumes.
 */
export const AUTO_ROTATE_RESUME_DELAY_MS = 4000;

/**
 * The camera's polar lock, in radians.
 *
 * The camera is fixed on the world equator plane. This makes
 * the globe the thing that rotates in response to user input,
 * not the camera. It matches the Google Earth model.
 */
export const CAMERA_POLAR_LOCK = 0;

/**
 * Wheel delta required to advance one step on the camera
 * distance ladder.
 *
 * The DOM `WheelEvent.deltaY` magnitude varies wildly across
 * browsers and platforms. Rather than accumulate a running
 * total, this threshold treats any single event above it as
 * one step. Small events are ignored so a trackpad's inertial
 * tail does not rack up zoom steps.
 */
export const WHEEL_STEP_DELTA = 40;

/**
 * Duration of the "reset north" animation, in milliseconds.
 */
export const NORTH_RESET_DURATION = 400;

/* -------------------------------------------------------------------------- */
/* Animation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Milliseconds for the globe to rotate and face a location.
 */
export const TRAVEL_DURATION = 1100;

/**
 * Easing exponent applied to the globe rotation.
 *
 * Higher values make the curve closer to a step: fast at the
 * start, then a long tail of small adjustments. The current
 * value (`4`) produces a motion that reads as "the globe is
 * deciding where to land" rather than "the globe is being
 * dragged there."
 */
export const TRAVEL_EASING_POWER = 4;

/* -------------------------------------------------------------------------- */
/* Markers                                                                    */
/* -------------------------------------------------------------------------- */

/** Marker radius in world units when not selected. */
export const MARKER_RADIUS = 0.035;

/** Marker radius in world units when selected. */
export const MARKER_RADIUS_SELECTED = 0.055;

/** Halo radius around the selected marker, in world units. */
export const MARKER_HALO_RADIUS = 0.095;

/** Halo opacity. */
export const MARKER_HALO_OPACITY = 0.12;

/** Unselected marker color (muted gray). */
export const MARKER_COLOR = "#8d959d";

/** Selected marker color, when the marker is not a favorite. */
export const MARKER_COLOR_SELECTED = "#c5a059";

/** Selected marker color, when the marker is a favorite. */
export const MARKER_COLOR_FAVORITED = "#ff4d8d";

/** Altitude of markers above the surface in minimal mode, as a fraction of the globe radius. */
export const MARKER_ALTITUDE = 0.025;

/**
 * Altitude of markers above the surface in realistic mode, as
 * a fraction of the globe radius.
 *
 * Higher than `MARKER_ALTITUDE` because the realistic globe
 * has two shells above the surface: a cloud layer at
 * `CLOUD_ALTITUDE` (1.2%) and an atmosphere shell at
 * `ATMOSPHERE_SHELL_SCALE` (2%). At the minimal-mode altitude
 * of 2.5%, markers would sit inside the atmosphere's additive
 * rim — washed out and clipped at the silhouette.
 */
export const MARKER_ALTITUDE_REALISTIC = 0.034;

/* -------------------------------------------------------------------------- */
/* Country polygons                                                           */
/* -------------------------------------------------------------------------- */

/** Fill color for the polygon cap (the visible top face). */
export const POLYGON_CAP_COLOR = "rgba(255,255,255,0.035)";

/** Fill color for polygon sides (visible at grazing angles). */
export const POLYGON_SIDE_COLOR = "rgba(255,255,255,0.045)";

/** Stroke color for polygon outlines. */
export const POLYGON_STROKE_COLOR = "rgba(255,255,255,0.16)";

/** Altitude of country polygons above the surface, as a fraction of the globe radius. */
export const POLYGON_ALTITUDE = 0.008;

/* -------------------------------------------------------------------------- */
/* Sphere                                                                     */
/* -------------------------------------------------------------------------- */

/** Number of sphere segments (both width and height). */
export const SPHERE_SEGMENTS = 96;

/** Base sphere color. */
export const SPHERE_COLOR = "#101419";

/** Sphere material roughness. */
export const SPHERE_ROUGHNESS = 0.82;

/** Sphere material metalness. */
export const SPHERE_METALNESS = 0.08;

/* -------------------------------------------------------------------------- */
/* Visual mode                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The globe's surface style.
 */
export type GlobeVisualMode = "minimal" | "realistic";

/** Default visual mode on first visit. */
export const DEFAULT_VISUAL_MODE: GlobeVisualMode = "realistic";

/**
 * `localStorage` key under which the user's visual-mode
 * preference is persisted.
 */
export const VISUAL_MODE_STORAGE_KEY = "world-clock:visual-mode";

/** Schema version for the persisted visual-mode payload. */
export const VISUAL_MODE_SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Terminator                                                                 */
/* -------------------------------------------------------------------------- */

/** Opacity of the dotted terminator ring, at full strength. */
export const TERMINATOR_OPACITY = 0.35;

/** The poles' dotted axis markers, at full strength. */
export const AXIS_MARKER_OPACITY = 0.45;

/**
 * Whether the terminator ring should be visible.
 *
 * `false` because the ring is visually noisy at the current
 * camera scale and is rarely useful to the target user. Kept
 * as a constant rather than deleted so a future "show the
 * terminator" toggle only has to flip this value.
 */
export const SHOW_TERMINATOR_RING = false;

/** Whether the polar axis markers should be visible. */
export const SHOW_AXIS_MARKERS = true;

/* -------------------------------------------------------------------------- */
/* Realistic globe                                                            */
/* -------------------------------------------------------------------------- */

/**
 * URLs for the realistic globe's texture set.
 */
export const EARTH_TEXTURE_URLS = {
  /** Albedo / base color — terrain, oceans, ice caps. */
  map: "/textures/earth/albedo.jpg",

  /** Topology / bump map — mountains and terrain relief. */
  bumpMap: "/textures/earth/bump.jpg",

  /** Water mask — oceans reflect more than land. */
  waterMap: "/textures/earth/water.jpg",

  /** Emissive map — city lights on the night side. */
  emissiveMap: "/textures/earth/night.jpg",

  /** Cloud layer alpha map. */
  cloudMap: "/textures/earth/clouds.png",
} as const;

/** Anisotropic filtering level applied to the albedo and bump maps. */
export const EARTH_TEXTURE_ANISOTROPY = 8;

/** Overall brightness multiplier applied to the sun-facing side. */
export const EARTH_SUN_INTENSITY = 2.6;

/** Fill-light intensity on the night side of the realistic globe. */
export const EARTH_NIGHT_FILL_INTENSITY = 0.12;

/** Warm tint applied to the sun light. */
export const EARTH_SUN_COLOR = "#fff4e0";

/** Cool tint applied to the night-side fill light. */
export const EARTH_NIGHT_FILL_COLOR = "#1a2a44";

/** Emissive color multiplied with the night-lights map. */
export const EARTH_EMISSIVE_COLOR = "#ffcc88";

/** Emissive intensity for the night-lights pass. */
export const EARTH_EMISSIVE_INTENSITY = 1.35;

/** Bump-map intensity on the realistic globe. */
export const EARTH_BUMP_SCALE = 0.04;

/* -------------------------------------------------------------------------- */
/* Realistic clouds                                                           */
/* -------------------------------------------------------------------------- */

/** Altitude of the cloud layer above the surface. */
export const CLOUD_ALTITUDE = 0.012;

/** Angular speed of the cloud layer, in radians per second. */
export const CLOUD_ROTATION_SPEED = 0.012;

/** Opacity of the cloud layer at full coverage. */
export const CLOUD_MAX_OPACITY = 0.62;

/** Cloud material roughness. */
export const CLOUD_ROUGHNESS = 1;

/* -------------------------------------------------------------------------- */
/* Realistic atmosphere                                                       */
/* -------------------------------------------------------------------------- */

/** Scale factor applied to the globe radius for the atmospheric shell. */
export const ATMOSPHERE_SHELL_SCALE = 1.02;

/** Color of the atmospheric rim. */
export const ATMOSPHERE_RIM_COLOR = "#6ba8ff";

/** Opacity of the atmospheric rim at the silhouette. */
export const ATMOSPHERE_RIM_OPACITY = 0.18;

/** Power applied to the Fresnel term in the atmosphere shader. */
export const ATMOSPHERE_RIM_POWER = 3.5;