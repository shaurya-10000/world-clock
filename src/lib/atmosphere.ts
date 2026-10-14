/**
 * Atmosphere system — the single source of truth for
 * Day / Dawn / Dusk / Night across the entire application.
 *
 * Consumers:
 *   - components/CitiesSection        (row ambient treatment)
 *   - components/WorldClockSection    (sky gradient + search rows)
 *   - components/GlobeAtmosphere      (globe background)
 *
 * ## Invariants
 *
 *   - Framework-agnostic. No React, no icons. Icon names are
 *     string keys, mapped to concrete components by consumers.
 *   - The hour boundaries below are canonical. Any module that
 *     classifies hours by atmosphere must import
 *     `getAtmosphere` rather than reimplement the ranges.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Atmosphere =
  | "dawn"
  | "day"
  | "dusk"
  | "night";

/**
 * Icon key for an atmosphere.
 *
 * Deliberately a string union rather than a React component
 * reference: this module has no framework dependency, and
 * each consumer maps the key to whatever icon set it uses.
 */
export type AtmosphereIcon =
  | "sun"
  | "cloud-sun"
  | "moon";

/**
 * A structured vertical sky gradient.
 *
 * Three explicit stops rather than a CSS string, so future
 * features (continuous sky blending, seasonal variation) can
 * interpolate between atmospheres without string parsing.
 */
export interface SkyGradient {
  readonly from: string;
  readonly via: string;
  readonly to: string;
}

/**
 * The radial ambient treatment used behind city rows and
 * search results.
 *
 * Two stacked layers:
 *   - `background`: the base gradient wash.
 *   - `glow`: a brighter, tighter radial highlight.
 *
 * Both are Tailwind arbitrary-value class strings, ready to
 * drop into `className`.
 */
export interface AmbientVisual {
  readonly background: string;
  readonly glow: string;
}

/**
 * The complete visual description of an atmosphere.
 *
 * Consumers pick the fields they need. `sky` and `ambient` are
 * separate because the two contexts that render atmospheres —
 * a full-page sky and an inline row — have different color
 * relationships. A sky is a vertical wash; a row is a radial
 * glow. Sharing one field would force one to approximate the
 * other.
 *
 * ## Why this is a single interface, not a discriminated union
 *
 * `AtmosphereVisual.id` is `Atmosphere` (a four-member union),
 * not a per-atmosphere literal. Narrowing on `visual.id` gives
 * a caller the *id* narrowed, not the palette — the shape of
 * `visual` does not change between atmospheres. That is
 * deliberate: every consumer today reads fields without
 * branching on the atmosphere, and a discriminated union
 * would force each consumer to narrow before reading `sky`,
 * which buys nothing when the shapes are identical.
 *
 * If a future atmosphere ever needs a field the others do not
 * have, that is the moment to split this interface into a
 * union of per-atmosphere types. Until then, a single
 * interface is the correct representation.
 */
export interface AtmosphereVisual {
  readonly id: Atmosphere;
  readonly label: string;
  readonly icon: AtmosphereIcon;
  readonly iconClass: string;
  readonly accent: string;
  readonly sky: SkyGradient;
  readonly ambient: AmbientVisual;
}

/* -------------------------------------------------------------------------- */
/* Canonical hour boundaries                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Atmosphere boundaries, in local 24-hour decimal time.
 *
 *   [DAWN_START_HOUR,  DAY_START_HOUR)   dawn
 *   [DAY_START_HOUR,   DUSK_START_HOUR)  day
 *   [DUSK_START_HOUR,  NIGHT_START_HOUR) dusk
 *   everything else                      night
 *
 * These are the "civil" ranges used by most consumer weather
 * apps, not astronomical sunrise/sunset. The distinction
 * matters at high latitudes, where true sunrise and sunset
 * drift far from 05:00 and 20:00 across the year.
 */
export const DAWN_START_HOUR = 5;
export const DAY_START_HOUR = 7;
export const DUSK_START_HOUR = 17;
export const NIGHT_START_HOUR = 20;

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Classify a local decimal hour into an atmosphere.
 *
 * Accepts any finite number. Values outside `[0, 24)` are
 * normalized by wrapping, so `25.5` classifies as `1.5` and
 * `-3` classifies as `21`. Callers do not need to pre-clamp.
 *
 * `NaN` is not handled specially — it wraps to `NaN`, fails
 * every comparison, and returns `"night"`. That is the correct
 * fallback for a UI: an unparseable hour should produce a
 * dark, unobtrusive row rather than throw.
 */
export function getAtmosphere(
  decimalHour: number,
): Atmosphere {
  const hour =
    ((decimalHour % 24) + 24) % 24;

  if (
    hour >= DAWN_START_HOUR &&
    hour < DAY_START_HOUR
  ) {
    return "dawn";
  }

  if (
    hour >= DAY_START_HOUR &&
    hour < DUSK_START_HOUR
  ) {
    return "day";
  }

  if (
    hour >= DUSK_START_HOUR &&
    hour < NIGHT_START_HOUR
  ) {
    return "dusk";
  }

  return "night";
}

/* -------------------------------------------------------------------------- */
/* Visual definitions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The canonical palette for each atmosphere.
 *
 * Frozen via `as const` so the shape is fixed at compile time
 * and no consumer can accidentally mutate a shared entry.
 */
const ATMOSPHERE_VISUALS: Record<
  Atmosphere,
  AtmosphereVisual
> = {
  dawn: {
    id: "dawn",
    label: "Dawn",
    icon: "cloud-sun",
    iconClass: "text-amber-300/85",
    accent: "bg-amber-300",
    sky: {
      from: "#19253b",
      via: "#6b4a58",
      to: "#cd835f",
    },
    ambient: {
      background:
        "bg-[radial-gradient(circle_at_82%_35%,rgba(255,187,104,0.34),transparent_25%),radial-gradient(circle_at_74%_100%,rgba(179,103,255,0.22),transparent_34%),linear-gradient(112deg,#100b18,#1e1522_48%,#25160f)]",
      glow:
        "bg-[radial-gradient(circle_at_82%_35%,rgba(255,185,93,0.28),transparent_15%)]",
    },
  },

  day: {
    id: "day",
    label: "Day",
    icon: "sun",
    iconClass: "text-amber-200/90",
    accent: "bg-amber-200",
    sky: {
      from: "#15496c",
      via: "#347ca2",
      to: "#7aabb9",
    },
    ambient: {
      background:
        "bg-[radial-gradient(circle_at_82%_28%,rgba(255,214,120,0.34),transparent_22%),radial-gradient(circle_at_12%_110%,rgba(51,134,255,0.16),transparent_42%),linear-gradient(115deg,#07111b,#0d1b29_52%,#16140d)]",
      glow:
        "bg-[radial-gradient(circle_at_82%_28%,rgba(255,207,103,0.24),transparent_15%)]",
    },
  },

  dusk: {
    id: "dusk",
    label: "Dusk",
    icon: "cloud-sun",
    iconClass: "text-orange-300/85",
    accent: "bg-orange-300",
    sky: {
      from: "#101a31",
      via: "#3a3150",
      to: "#86555a",
    },
    ambient: {
      background:
        "bg-[radial-gradient(circle_at_80%_38%,rgba(255,125,82,0.32),transparent_23%),radial-gradient(circle_at_22%_95%,rgba(118,74,196,0.28),transparent_38%),linear-gradient(112deg,#080c16,#171326_50%,#21130f)]",
      glow:
        "bg-[radial-gradient(circle_at_80%_38%,rgba(255,130,75,0.25),transparent_15%)]",
    },
  },

  night: {
    id: "night",
    label: "Night",
    icon: "moon",
    iconClass: "text-blue-200/75",
    accent: "bg-blue-200",
    sky: {
      from: "#02050c",
      via: "#08162a",
      to: "#0a1420",
    },
    ambient: {
      background:
        "bg-[radial-gradient(circle_at_82%_22%,rgba(115,153,225,0.16),transparent_19%),radial-gradient(circle_at_24%_80%,rgba(68,92,143,0.13),transparent_34%),linear-gradient(120deg,#05070b,#09101b_48%,#06080d)]",
      glow:
        "bg-[radial-gradient(circle_at_82%_22%,rgba(128,165,239,0.14),transparent_13%)]",
    },
  },
} as const;

/**
 * Retrieve the visual definition for an atmosphere.
 *
 * The returned object is a shared, frozen module-level entry.
 * Two calls with the same `atmosphere` return the same object
 * by reference, which is what lets consumers use the result in
 * a `useMemo` dependency array without triggering spurious
 * re-runs.
 */
export function getAtmosphereVisual(
  atmosphere: Atmosphere,
): AtmosphereVisual {
  return ATMOSPHERE_VISUALS[atmosphere];
}

/* -------------------------------------------------------------------------- */
/* Sky gradient helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Render a structured sky gradient to a CSS `linear-gradient`
 * string.
 *
 * The direction and stop positions are fixed here rather than
 * passed in, so every call site produces the same visual.
 * Consumers that need a different direction should layer their
 * own gradient on top rather than fork this helper.
 */
export function skyGradientToCss(
  sky: SkyGradient,
): string {
  return `linear-gradient(180deg,${sky.from} 0%,${sky.via} 45%,${sky.to} 100%)`;
}

/* -------------------------------------------------------------------------- */
/* Categorical helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * True when the atmosphere is a transitional state — dawn or
 * dusk.
 *
 * Used by the search result rows to enable a slow opacity
 * pulse on their warm undertone, and by `SkyAtmosphere` to
 * boost the horizon glow. Both cases read "twilight" as the
 * same category, so the helper exists rather than open-coding
 * the comparison at each call site.
 */
export function isTwilight(
  atmosphere: Atmosphere,
): boolean {
  return (
    atmosphere === "dawn" ||
    atmosphere === "dusk"
  );
}

/**
 * True when the sky should render stars.
 *
 * Dawn and dusk keep a reduced star field because the sky is
 * still mostly dark at their boundaries. Day has no visible
 * stars.
 */
export function showsStars(
  atmosphere: Atmosphere,
): boolean {
  return atmosphere !== "day";
}