"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useMemo } from "react";

import {
  getAtmosphere,
  getAtmosphereVisual,
  skyGradientToCss,
} from "@/lib/atmosphere";
import { clamp, easeInOut, lerp } from "@/lib/math";
import type { LocalTime } from "@/lib/time";

import { CLOUDS, EASE, STARS } from "./constants";

/* -------------------------------------------------------------------------- */
/* Sky tint                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The large soft radial wash drawn over the sky gradient.
 *
 * A single class per atmosphere. Hoisted so the string is
 * allocated once at module load rather than re-created on every
 * render — the sky tint is animated between four values, and
 * rebuilding the strings per frame would defeat the browser's
 * CSS-transition deduplication.
 *
 * The `day` tint uses a warm top-center radial because the
 * sun's arc peaks near the top of the frame at solar noon.
 * The `night` tint is a weaker blue wash — bright enough to
 * read as sky, dim enough not to compete with the stars.
 */
const SKY_TINT: Readonly<Record<string, string>> = {
  day: "radial-gradient(circle at 50% 10%,rgba(166,220,248,0.26) 0%,rgba(95,171,210,0.11) 28%,transparent 69%)",
  dawn: "radial-gradient(circle at 50% 18%,rgba(255,175,105,0.22) 0%,rgba(205,114,91,0.09) 34%,transparent 70%)",
  dusk: "radial-gradient(circle at 52% 18%,rgba(227,131,104,0.18) 0%,rgba(105,79,126,0.1) 34%,transparent 70%)",
  night:
    "radial-gradient(circle at 50% 8%,rgba(48,86,134,0.18) 0%,rgba(11,23,44,0.06) 40%,transparent 72%)",
};

/**
 * The horizon glow — a wide warm band near the bottom that
 * brightens at dawn and dusk.
 */
const HORIZON_GLOW =
  "radial-gradient(ellipse at 50% 75%,rgba(247,147,104,0.22) 0%,rgba(212,108,95,0.08) 28%,transparent 68%)";

/**
 * The base cloud body. Every cloud renders this gradient plus
 * three blurred highlight lobes on top.
 */
const CLOUD_BACKGROUND =
  "radial-gradient(ellipse at center,rgba(251,253,255,0.75) 0%,rgba(225,238,245,0.42) 35%,rgba(197,219,229,0.08) 72%,transparent 100%)";

/* -------------------------------------------------------------------------- */
/* Sun and moon positions                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Computes the sun's position along its apparent arc, in
 * normalized viewport coordinates (percentages).
 *
 * The sun rises at 05:30 local and sets at 18:30. Horizontal
 * position moves from 7% (left edge) to 93% (right edge) of
 * the viewport, eased with `easeInOut` so the sun lingers near
 * the horizon. Vertical position follows a sine arc, peaking
 * at 14% from the top at solar noon.
 *
 * ## Why these hours differ from the atmosphere classifier
 *
 * The categorical boundaries in `lib/atmosphere.ts` start
 * "day" at 07:00 and "night" at 20:00. The sun's visual arc
 * here starts at 05:30 and ends at 18:30. The two differ
 * deliberately:
 *
 *   - The classifier's hours are cultural — they reflect when
 *     most people consider a particular palette to be
 *     appropriate.
 *   - The sun's arc is astronomical — it reflects when the
 *     sun is actually near the horizon.
 *
 * Do not unify them without re-tuning the arc. Aligning the
 * two would make the sun appear to hover below the horizon
 * during the "day" palette and above it during "night".
 *
 * @param decimalHour - Local time as a fractional hour (e.g. `13.5`).
 * @returns `{ left, top }` as percentages of the viewport.
 */
export function getSunPosition(decimalHour: number): {
  left: number;
  top: number;
} {
  const sunrise = 5.5;
  const sunset = 18.5;

  const progress = clamp(
    (decimalHour - sunrise) / (sunset - sunrise),
    0,
    1,
  );

  const eased = easeInOut(progress);

  return {
    left: lerp(7, 93, eased),
    top: lerp(70, 14, Math.sin(progress * Math.PI)),
  };
}

/**
 * Computes the moon's position along its apparent arc.
 *
 * The moon rises at 17:30 local and sets at 05:30 the following
 * morning. Hours before 05:30 are treated as belonging to the
 * previous evening's arc (i.e. `24 + hour`) so the arc wraps
 * cleanly. The `5.5` boundary matches `sunrise` in
 * {@link getSunPosition} — sunrise and moonset are the same
 * moment.
 *
 * ## Direction
 *
 * The horizontal interpolation runs `lerp(93, 7, eased)` — the
 * moon travels right-to-left, opposite the sun. This is
 * deliberate: the moon rises in the east (right side of a
 * north-facing view), crosses the sky, and sets in the west
 * (left side). The vertical arc is the same shape as the
 * sun's, but peaking at 13% rather than 14% — the moon has a
 * slightly higher apogee in this framing so the two celestial
 * bodies do not overlap at their respective peaks.
 *
 * @param decimalHour - Local time as a fractional hour.
 * @returns `{ left, top }` as percentages of the viewport.
 */
export function getMoonPosition(decimalHour: number): {
  left: number;
  top: number;
} {
  const nightHour = decimalHour < 5.5 ? decimalHour + 24 : decimalHour;

  const moonrise = 17.5;
  const moonset = 29.5;

  const progress = clamp(
    (nightHour - moonrise) / (moonset - moonrise),
    0,
    1,
  );

  const eased = easeInOut(progress);

  return {
    left: lerp(93, 7, eased),
    top: lerp(70, 13, Math.sin(progress * Math.PI)),
  };
}

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

interface SkyAtmosphereProps {
  /** Current local time at the active location. */
  time: LocalTime;
  /** When `true`, disables all motion for accessibility. */
  reducedMotion: boolean;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The sky behind the clock.
 *
 * Renders the atmosphere — sky gradient, sun, moon, clouds,
 * stars, and horizon glow — as a function of the local time at
 * the active location. Everything is derived from two inputs:
 * the categorical `atmosphere` (palette selection) and the
 * continuous `decimalHour` (sun / moon positions).
 *
 * ## Layering
 *
 * The layers are stacked in this z-order (lowest first):
 *
 *   1. Sky gradient (base)
 *   2. Sky tint (radial wash)
 *   3. Sun (z-10)
 *   4. Clouds (z-20)
 *   5. Horizon glow (z-20)
 *   6. Stars (z-40)
 *   7. Moon (z-50)
 *
 * There is deliberately no bottom fade-to-background layer.
 * The Time Zones section is the last section on the page, so
 * there is nothing below it to blend into, and a fade to the
 * near-black `--background` turned the lower part of a daytime
 * sky into a dark band.
 *
 * ## Accessibility
 *
 * The entire subtree is `aria-hidden="true"` and
 * `pointer-events-none`; it is purely decorative. There are no
 * focusable elements. The clock that sits above it owns the
 * accessible name.
 *
 * ## Reduced motion
 *
 * `useReducedMotion` is consulted, and the caller's
 * `reducedMotion` prop is OR'd with it — either source of
 * truth can disable animation. When disabled, every transition
 * duration becomes 0, repeating animations run 0 times, and
 * opacity values take their resting state rather than
 * flickering.
 *
 * @example
 * ```tsx
 * <SkyAtmosphere time={localTime} reducedMotion={false} />
 * ```
 */
export default function SkyAtmosphere({
  time,
  reducedMotion,
}: SkyAtmosphereProps) {
  const prefersReducedMotion = useReducedMotion();
  const isReducedMotion = reducedMotion || prefersReducedMotion === true;

  const { atmosphere, skyCss, sun, moon } = useMemo(() => {
    const a = getAtmosphere(time.decimalHour);
    return {
      atmosphere: a,
      skyCss: skyGradientToCss(getAtmosphereVisual(a).sky),
      sun: getSunPosition(time.decimalHour),
      moon: getMoonPosition(time.decimalHour),
    };
  }, [time.decimalHour]);

  const isDawn = atmosphere === "dawn";
  const isDusk = atmosphere === "dusk";
  const isNight = atmosphere === "night";

  const skyTint = SKY_TINT[atmosphere] ?? SKY_TINT.night;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-20 overflow-hidden"
    >
      <motion.div
        className="absolute inset-0"
        animate={{ background: skyCss }}
        transition={{
          duration: isReducedMotion ? 0 : 1.3,
          ease: EASE,
        }}
      />

      <motion.div
        className="absolute inset-x-0 top-0 h-[74%]"
        animate={{ background: skyTint }}
        transition={{
          duration: isReducedMotion ? 0 : 1.2,
          ease: EASE,
        }}
      />

      <motion.div
        className="absolute z-10 size-[88px] -translate-x-1/2 -translate-y-1/2 rounded-full sm:size-[116px]"
        style={{
          left: `${sun.left}%`,
          top: `${sun.top}%`,
        }}
        animate={{
          opacity: isNight ? 0 : 1,
          scale: isNight ? 0.72 : 1,
        }}
        transition={{
          duration: isReducedMotion ? 0 : 0.9,
          ease: EASE,
        }}
      >
        <div className="absolute -inset-12 rounded-full bg-[radial-gradient(circle,rgba(255,230,175,0.42)_0%,rgba(255,195,106,0.18)_38%,transparent_72%)] blur-[15px]" />

        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fffef1_0%,#ffe8a9_32%,#ffc768_65%,#ef9d3a_100%)] shadow-[0_0_45px_rgba(255,204,110,0.42)]" />
      </motion.div>

      <div className="absolute inset-0 z-20">
        {CLOUDS.map((cloud) => (
          <motion.div
            key={cloud.id}
            className="absolute rounded-full blur-[7px]"
            style={{
              width: `${cloud.width}px`,
              height: `${cloud.height}px`,
              left: cloud.left,
              top: cloud.top,
              background: CLOUD_BACKGROUND,
            }}
            animate={{
              opacity: isNight
                ? 0
                : isDawn || isDusk
                  ? cloud.opacity * 0.7
                  : cloud.opacity,
              x: isReducedMotion ? 0 : [0, 32, 0, -32, 0],
            }}
            transition={{
              opacity: {
                duration: isReducedMotion ? 0 : 0.7,
                ease: EASE,
              },
              x: {
                duration: cloud.duration,
                delay: cloud.delay,
                repeat: isReducedMotion ? 0 : Infinity,
                ease: "easeInOut",
              },
            }}
          >
            <div className="absolute -left-[12%] top-[12%] h-[82%] w-[42%] rounded-full bg-white/20 blur-[12px]" />
            <div className="absolute left-[20%] top-[-18%] h-[100%] w-[48%] rounded-full bg-white/28 blur-[10px]" />
            <div className="absolute right-[8%] top-[2%] h-[76%] w-[38%] rounded-full bg-white/16 blur-[12px]" />
          </motion.div>
        ))}
      </div>

      <motion.div
        className="absolute inset-x-0 bottom-[18%] z-20 h-[40%]"
        animate={{ opacity: isDawn || isDusk ? 0.85 : 0.08 }}
        transition={{ duration: isReducedMotion ? 0 : 1 }}
        style={{ background: HORIZON_GLOW }}
      />

      <AnimatePresence>
        {(isNight || isDawn || isDusk) &&
          STARS.map((star) => (
            <motion.span
              key={star.id}
              className="absolute z-40 rounded-full bg-white"
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                boxShadow:
                  star.size > 1
                    ? "0 0 7px rgba(255,255,255,0.55)"
                    : "none",
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: isNight
                  ? isReducedMotion
                    ? 0.45
                    : [0.18, 0.85, 0.22]
                  : 0.1,
                scale:
                  isNight && !isReducedMotion ? [1, 1.22, 1] : 1,
              }}
              transition={{
                duration: isReducedMotion ? 0 : star.duration,
                delay: star.delay,
                repeat:
                  isNight && !isReducedMotion ? Infinity : 0,
                ease: "easeInOut",
              }}
            />
          ))}
      </AnimatePresence>

      <motion.div
        className="absolute z-50 size-[72px] -translate-x-1/2 -translate-y-1/2 sm:size-[92px]"
        style={{
          left: `${moon.left}%`,
          top: `${moon.top}%`,
        }}
        animate={{
          opacity: isNight ? 1 : isDawn || isDusk ? 0.35 : 0,
          scale: isNight ? 1 : 0.82,
        }}
        transition={{
          duration: isReducedMotion ? 0 : 1,
          ease: EASE,
        }}
      >
        <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(210,230,249,0.16),transparent_68%)] blur-[10px]" />

        <div className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#e3ebf3_52%,#9cadc2_100%)] shadow-[0_0_36px_rgba(218,233,249,0.2)]">
          <span className="absolute left-[22%] top-[20%] size-[10px] rounded-full bg-[#b7c4d2]/40" />
          <span className="absolute left-[61%] top-[29%] size-[14px] rounded-full bg-[#b7c4d2]/30" />
          <span className="absolute left-[42%] top-[65%] size-[8px] rounded-full bg-[#aebbc8]/30" />
        </div>
      </motion.div>
    </div>
  );
}