"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useMemo } from "react";

import {
  getAtmosphereVisual,
  type Atmosphere,
} from "@/lib/atmosphere";
import { generateStarField } from "@/lib/starfield";
import type { SolarState } from "@/lib/useSolarState";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Shared easing curve — a soft ease-out used by every layer. */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Crossfade duration when the dominant atmosphere changes, in
 * seconds.
 *
 * Long enough to feel like a gradual atmospheric shift rather
 * than a UI state change; short enough that rotating quickly
 * still feels responsive. Tuned by eye at 1.2s.
 *
 * During the crossfade both atmosphere layers are mounted
 * (three composited full-viewport layers each). If jank
 * appears on low-end devices during a fast rotation, this is
 * the first constant to shorten — halving it roughly halves
 * the duration of the double-render window.
 */
const CROSSFADE_DURATION = 1.2;

/**
 * Size of the sun glow element.
 *
 * A single very large radial gradient. `vmax` rather than
 * fixed pixels so it scales with viewport. 110vmax covers the
 * entire section with plenty of falloff.
 */
const SUN_GLOW_SIZE = "110vmax";

/**
 * The atmosphere the layer falls back to before either the
 * sampler or the solar state has produced a value.
 *
 * Kept as a named constant so consumers that render this
 * component before any upstream source has emitted see a
 * neutral nighttime background instead of a flash of light.
 *
 * `"night"` is the deliberate choice because it has the least
 * visual weight in the atmosphere system: a dark background
 * reads as "loading" more gracefully than a bright one.
 */
const DEFAULT_ATMOSPHERE: Atmosphere = "night";

/**
 * Intensity floor for the atmosphere layer, `[0, 1]`.
 *
 * Full day peaks at `1.0` so the bright blue sky reads at
 * full saturation. Full night floors at this value so the
 * nighttime palette stays legible instead of collapsing to
 * pure black. Values between interpolate linearly against
 * `solarState.daylightFraction`.
 *
 * The pre-first-sample intensity (`intensity` when
 * `solarState === null`) matches this floor, so the first
 * frame after mount is not dimmer than the very next frame
 * — a one-frame flash that would otherwise appear because
 * the initial state had its own, lower value.
 */
const NIGHT_INTENSITY_FLOOR = 0.55;

/**
 * The opacity threshold below which the star field is treated
 * as invisible.
 *
 * `StarLayer` receives `visible={starOpacity > STAR_VISIBILITY_THRESHOLD}`.
 * Below this threshold, the layer's `animate` target is `0`
 * and the perpetual per-star animations collapse to their
 * static resting opacity. The threshold is deliberately
 * non-zero: at `0.1`, the field has already faded to a
 * barely-visible state, and pinning the stars to a fixed
 * opacity below that value avoids wasting 72 animation
 * subscribers on a star field the user cannot see.
 */
const STAR_VISIBILITY_THRESHOLD = 0.1;

/*
 * The atmosphere visual's `ambient` layers are reused in
 * `AtmosphereLayer` at reduced opacities, different from the
 * values used in the city-row chrome. A full-viewport
 * background reads stronger than a row's tint at the same
 * opacity, so the values are lowered to keep the layer from
 * competing with the canvas.
 *
 * The values themselves (`0.4` for `ambient.background`,
 * `0.3` for `ambient.glow`) are expressed inline as Tailwind
 * utilities (`opacity-40`, `opacity-30`) on the layer divs
 * below, rather than as exported constants, since they are
 * used exactly once each.
 */

/* -------------------------------------------------------------------------- */
/* Star field                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The globe's star field.
 *
 * Denser than the Time Zones section's field (72 vs 48 stars)
 * and slightly more spread, since the globe's ambient layer is
 * wider. Generated deterministically via the shared helper.
 *
 * The `"globe-star"` id prefix keeps React keys distinct from
 * the Time Zones field, which uses the `"star"` prefix, in
 * case both are ever mounted in the same tree.
 */
const STARS = generateStarField(72, {
  idPrefix: "globe-star",
  leftInset: 3,
  topInset: 2,
  leftSpan: 94,
  topSpan: 82,
  delayStep: 0.31,
  baseDuration: 3.1,
  durationRange: 1.5,
});

/* -------------------------------------------------------------------------- */
/* Star layer                                                                 */
/* -------------------------------------------------------------------------- */

interface StarLayerProps {
  visible: boolean;
  reducedMotion: boolean;
}

/**
 * The twinkling star field.
 *
 * Each star is a small `motion.span` with a breathing opacity
 * animation. When `reducedMotion` is set, every star is pinned
 * to a static opacity and the animation is disabled — the
 * field renders, but nothing moves.
 *
 * ## Animation cost
 *
 * 72 perpetual Framer Motion animations run while this layer
 * is mounted. Individually cheap, but they prevent the
 * browser from idling the compositor when the page is
 * otherwise static. There is no visibility-based pause today;
 * if profiling shows the star field dominating idle-frame
 * cost, the fix is to swap `animate` for `whileInView` or to
 * gate the whole layer on `document.visibilityState`.
 */
function StarLayer({
  visible,
  reducedMotion,
}: StarLayerProps) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{
        duration: reducedMotion ? 0 : 1.4,
        ease: EASE,
      }}
    >
      {STARS.map((star) => (
        <motion.span
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            boxShadow:
              star.size > 1
                ? "0 0 6px rgba(255,255,255,0.5)"
                : "none",
          }}
          animate={{
            opacity: reducedMotion ? 0.4 : [0.15, 0.75, 0.18],
          }}
          transition={{
            duration: reducedMotion ? 0 : star.duration,
            delay: star.delay,
            repeat: reducedMotion ? 0 : Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Atmosphere layer                                                           */
/* -------------------------------------------------------------------------- */

interface AtmosphereLayerProps {
  atmosphere: Atmosphere;
}

/**
 * The painted background for a single atmosphere.
 *
 * Three stacked layers:
 *
 *   1. A vertical linear gradient built from the atmosphere
 *      visual's `sky` field, running top to bottom.
 *   2. The atmosphere visual's `ambient.background` radial
 *      treatment, reused from the city-row chrome so the two
 *      read as members of the same system.
 *   3. The atmosphere visual's `ambient.glow`, in a
 *      lower-opacity role, so the top-left of the section
 *      gets a subtle highlight without dominating.
 *
 * The layer's outer wrapper applies the caller-provided
 * intensity; this component renders at full strength and is
 * faded by its parent.
 */
function AtmosphereLayer({
  atmosphere,
}: AtmosphereLayerProps) {
  const visual = useMemo(
    () => getAtmosphereVisual(atmosphere),
    [atmosphere],
  );

  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${visual.sky.from} 0%, ${visual.sky.via} 48%, ${visual.sky.to} 100%)`,
        }}
      />

      <div
        className={`
          absolute inset-0
          ${visual.ambient.background}
          opacity-40
        `}
      />

      <div
        className={`
          absolute inset-0
          ${visual.ambient.glow}
          opacity-30
        `}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

/**
 * All the numeric values this component derives from
 * `solarState`, computed in one place.
 *
 * Bundling them into a single memo means a single object
 * identity change per render that actually has new input, and
 * keeps the three values guaranteed-consistent — a future
 * change that makes one of them depend on the others (e.g.
 * "glow opacity scales with star opacity at deep night") has
 * one place to make the change and cannot accidentally leave
 * one computation stale.
 */
export interface DerivedVisuals {
  readonly intensity: number;
  readonly glowPosition: { left: string; top: string };
  readonly glowVisible: boolean;
  readonly starOpacity: number;
}

/**
 * Compute every visual value from a solar state.
 *
 * Pure function — no side effects, no external reads beyond
 * its argument. That is what makes it directly testable; see
 * `GlobeAtmosphere.test.ts` for the boundary cases.
 *
 * The three values are computed together because they share
 * the same input and the same update cadence. Keeping them
 * separate would triple the memo slots without any benefit.
 *
 * @param solarState - The current solar state, or `null`
 *   before the sampler has produced a first sample.
 */
export function deriveVisuals(
  solarState: SolarState | null,
): DerivedVisuals {
  if (!solarState) {
    return {
      /*
       * Before the first sample, the layer sits at the
       * night floor — not a lower, "loading" value. A
       * one-frame flash would appear if the initial opacity
       * differed from the very next frame's night value.
       */
      intensity: NIGHT_INTENSITY_FLOOR,
      glowPosition: { left: "50%", top: "50%" },
      glowVisible: false,
      starOpacity: 0.3,
    };
  }

  const daylight = solarState.daylightFraction;

  /*
   * Sun glow position, as CSS percentage strings. Falls back
   * to center-screen when the sun is behind the globe — the
   * `glowVisible` flag handles the actual hide.
   */
  const pos = solarState.subsolarScreenPosition;
  const glowPosition = pos
    ? {
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
      }
    : { left: "50%", top: "50%" };

  return {
    intensity:
      NIGHT_INTENSITY_FLOOR +
      daylight * (1 - NIGHT_INTENSITY_FLOOR),

    glowPosition,

    glowVisible: pos !== null,

    /*
     * Star field opacity — visible in proportion to darkness.
     *
     * The `1.4` multiplier means the field reaches zero
     * opacity before `daylightFraction === 1`; stars fade out
     * slightly ahead of full daylight rather than at the exact
     * boundary, which reads more naturally as the terminator
     * sweeps past.
     */
    starOpacity: Math.max(0, Math.min(1, 1 - daylight * 1.4)),
  };
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

interface GlobeAtmosphereProps {
  /**
   * The current solar state.
   *
   * `null` before the sampler has emitted its first sample.
   * Used as a fallback for the atmosphere if
   * `atmosphereOverride` is not provided.
   */
  solarState: SolarState | null;

  /**
   * The sampled atmosphere for the visible hemisphere, or
   * `null` when no sample has been produced yet.
   *
   * ## Source
   *
   * Written by `GlobeAtmosphereSampler` inside the canvas and
   * lifted to the page by `Globe.tsx`'s poller. When provided,
   * it takes precedence over `solarState.dominantAtmosphere`
   * — this is the value that drives the background crossfade.
   *
   * ## What `null` means
   *
   * `null` is not a fallback sentinel — it has a specific
   * meaning. It corresponds exactly to
   * `globeAtmosphereRef.current === null` upstream, which is
   * the sampler's "no sample yet" state. This component does
   * not see `null` once the sampler has produced its first
   * value; `Globe.tsx`'s poller only publishes non-null
   * values, so `atmosphereOverride` arrives as a real
   * `Atmosphere` on the first tick after the sample lands.
   *
   * ## Priority
   *
   * When this prop is a real value, the component uses it.
   * When it is `null`, the component falls back to
   * `solarState.dominantAtmosphere`. When *that* is also
   * `null` (the sampler hasn't run yet and the solar state
   * hasn't been computed), the component uses
   * `DEFAULT_ATMOSPHERE` (`"night"`).
   */
  atmosphereOverride?: Atmosphere | null;
}

/**
 * The ambient background behind the globe canvas.
 *
 * Renders:
 *   - the sampled atmosphere of the visible hemisphere,
 *   - a sun glow tracking the subsolar point's projection,
 *   - a star field whose opacity is driven by how much of the
 *     disc is in shadow.
 *
 * There are deliberately no top or bottom vignettes fading
 * into `--background`. The sticky header already separates
 * the section from the page chrome, and fading a daytime sky
 * into the near-black page background produced dark bands at
 * the top and bottom of the section.
 *
 * Intended to be mounted as an absolutely positioned sibling
 * of the Canvas, filling the same parent section.
 *
 * ## Atmosphere source
 *
 * The atmosphere used to paint the background is chosen in
 * priority order:
 *
 *   1. `atmosphereOverride`, when it is a real `Atmosphere`.
 *      This is the sampled dominant atmosphere of the visible
 *      hemisphere.
 *
 *   2. `solarState.dominantAtmosphere`, as a fallback while
 *      the sampler is warming up.
 *
 *   3. `DEFAULT_ATMOSPHERE` (`night`), before either is
 *      available.
 *
 * ## Why the second-priority fallback exists
 *
 * `atmosphereOverride` is `null` for the first commit after
 * the sampler mounts — the sampler has not yet produced a
 * value, and `Globe.tsx`'s poller does not publish `null` to
 * its consumers. Without the `solarState.dominantAtmosphere`
 * fallback, the atmosphere would flash to `night` for one
 * render before the override arrives, then crossfade to the
 * correct palette. On a page that loads in daylight, that is
 * a visible black flash.
 *
 * `solarState.dominantAtmosphere` is a physically reasonable
 * approximation of the visible hemisphere even before the
 * sampler refines it — it classifies by solar elevation
 * rather than by local hour at the nearest city, which is
 * slightly wrong but rarely flash-worthy. It is only used for
 * the one or two frames between mount and the first sampler
 * emission.
 *
 * Do not remove this fallback without first verifying that the
 * sampler emits synchronously on mount. It does not, because
 * it is driven by `useFrame` inside the R3F reconciler, which
 * runs at most once per animation frame. And even when it
 * does emit, `Globe.tsx`'s poller only reads the ref on a
 * 250 ms interval — so the override can lag the sampler by up
 * to one poll period, during which this fallback is what the
 * user sees.
 *
 * ## Accessibility
 *
 * The entire subtree is `aria-hidden="true"` and
 * `pointer-events-none`. The atmosphere is decorative chrome;
 * it contributes nothing to the accessibility tree.
 */
export default function GlobeAtmosphere({
  solarState,
  atmosphereOverride = null,
}: GlobeAtmosphereProps) {
  const reducedMotion = useReducedMotion();
  const isReducedMotion = reducedMotion === true;

  /*
   * Pick the atmosphere in priority order. `atmosphereOverride`
   * wins when present; otherwise fall back to the solar
   * state's dominant value; otherwise the neutral default.
   */
  const atmosphere: Atmosphere =
    atmosphereOverride ??
    solarState?.dominantAtmosphere ??
    DEFAULT_ATMOSPHERE;

  const visuals = useMemo(
    () => deriveVisuals(solarState),
    [solarState],
  );

  return (
    <div
      aria-hidden="true"
      className="
        pointer-events-none absolute inset-0 overflow-hidden
      "
    >
      {/*
       * Atmosphere stack.
       *
       * A single AnimatePresence keyed by the atmosphere name.
       * When the name changes, the outgoing layer crossfades
       * to the incoming one. `mode="sync"` keeps both mounted
       * during the fade, which is what makes the transition
       * smooth rather than a hard cut.
       */}
      <div
        className="absolute inset-0"
        style={{ opacity: visuals.intensity }}
      >
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={atmosphere}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: isReducedMotion
                ? 0
                : CROSSFADE_DURATION,
              ease: EASE,
            }}
            className="absolute inset-0"
          >
            <AtmosphereLayer atmosphere={atmosphere} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Star field. Visible in proportion to darkness. */}
      <div
        className="absolute inset-0"
        style={{ opacity: visuals.starOpacity }}
      >
        <StarLayer
          visible={
            visuals.starOpacity > STAR_VISIBILITY_THRESHOLD
          }
          reducedMotion={isReducedMotion}
        />
      </div>

      {/*
       * Sun glow — a very large soft radial gradient whose
       * position tracks the projection of the subsolar point.
       * Fades out entirely when the sun is behind the globe.
       */}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: visuals.glowPosition.left,
          top: visuals.glowPosition.top,
          width: SUN_GLOW_SIZE,
          height: SUN_GLOW_SIZE,
          background:
            "radial-gradient(circle, rgba(255,215,150,0.22) 0%, rgba(255,180,100,0.10) 22%, rgba(255,140,80,0.04) 45%, transparent 72%)",
          filter: "blur(60px)",
        }}
        animate={{ opacity: visuals.glowVisible ? 1 : 0 }}
        transition={{
          duration: isReducedMotion ? 0 : 1.5,
          ease: EASE,
        }}
      />
    </div>
  );
}