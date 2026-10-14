"use client";

import { motion, useReducedMotion } from "framer-motion";
import { memo, useState } from "react";

import { getAtmosphere, type Atmosphere } from "@/lib/atmosphere";
import type { LocalTime } from "@/lib/time";

import { CLOCK_SIZE_CLASS } from "./constants";

/* -------------------------------------------------------------------------- */
/* Design tokens                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The single accent colour is `#f26b3a`. It marks the second hand
 * and the pivot. Tailwind needs literal class strings, so the
 * classes below spell it out as `bg-[#f26b3a]`.
 */

/**
 * Per-atmosphere palette, matching the digital clock so the two
 * faces read as siblings on the same sky.
 *
 *   - `ink`: the colour of the ticks, numerals and hands. In the
 *     day it follows the theme's foreground; at dawn, dusk and
 *     night it switches to a light tint, because the sky behind
 *     the clock is dark or saturated then. It is exposed to the
 *     subtree as the `--clock-ink` custom property.
 *   - `outerGlow` / `innerGlow`: the soft halo behind the face and
 *     the radial glow at its centre.
 */
interface AtmospherePalette {
  readonly ink: string;
  readonly outerGlow: string;
  readonly innerGlow: string;
}

const PALETTES: Readonly<Record<Atmosphere, AtmospherePalette>> = {
  day: {
    ink: "var(--foreground)",
    outerGlow: "bg-white/20",
    innerGlow: "bg-white/16",
  },
  dawn: {
    ink: "rgb(255 247 237)",
    outerGlow: "bg-orange-200/10",
    innerGlow: "bg-orange-300/[0.08]",
  },
  dusk: {
    ink: "rgb(245 243 255)",
    outerGlow: "bg-violet-200/10",
    innerGlow: "bg-violet-300/[0.08]",
  },
  night: {
    ink: "rgb(255 255 255)",
    outerGlow: "bg-cyan-200/[0.025]",
    innerGlow: "bg-cyan-100/[0.018]",
  },
};

/* -------------------------------------------------------------------------- */
/* Tick marks                                                                 */
/* -------------------------------------------------------------------------- */

interface Tick {
  readonly id: number;
  readonly style: React.CSSProperties;
}

/**
 * Where the tick band starts, as a percentage of the clock's
 * radius measured from the outer edge.
 */
const TICK_INSET_PERCENT = 11;

/**
 * The 60 tick marks, precomputed once at module load.
 *
 * ## How a tick is built
 *
 * Each tick is a thin element exactly one radius tall (`h-1/2`
 * of the face), standing on the 12 o'clock axis with its
 * transform origin at its bottom edge, which is the centre of
 * the clock. Rotating it by `index * 6` degrees sweeps it around
 * the dial. The visible mark is only a short segment painted
 * near the top of that element with a hard-stop gradient;
 * everything else is transparent.
 *
 * The element height and the gradient start are both percentages
 * of the face, so the ticks scale with the clock at every size.
 *
 * ## Hierarchy
 *
 *   - Quarter marks (0, 15, 30, 45): longest and heaviest.
 *   - Other hour marks (every fifth): long.
 *   - Minute marks: short and faint.
 */
const TICKS: readonly Tick[] = Array.from(
  { length: 60 },
  (_, index) => {
    const quarter = index % 15 === 0;
    const major = index % 5 === 0;

    const length = quarter ? 16 : major ? 11 : 4;
    const width = quarter ? 3 : major ? 2 : 1;
    const opacity = quarter ? 0.9 : major ? 0.6 : 0.2;
    const color = "var(--clock-ink)";

    const start = `${TICK_INSET_PERCENT}%`;
    const end = `calc(${TICK_INSET_PERCENT}% + ${length}px)`;

    return {
      id: index,
      style: {
        width: `${width}px`,
        opacity,
        background: `linear-gradient(to bottom, transparent 0, transparent ${start}, ${color} ${start}, ${color} ${end}, transparent ${end})`,
        transformOrigin: "50% 100%",
        transform: `translateX(-50%) rotate(${index * 6}deg)`,
      },
    };
  },
);

/**
 * The 60 tick marks around the clock face.
 *
 * `React.memo` with no props means this subtree renders once and
 * is thereafter skipped by React's reconciler, even when
 * `AnalogClock` re-renders every second.
 */
const ClockTicks = memo(function ClockTicks() {
  return (
    <>
      {TICKS.map((tick) => (
        <span
          key={tick.id}
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-1/2"
          style={tick.style}
        />
      ))}
    </>
  );
});

/* -------------------------------------------------------------------------- */
/* Hour numerals                                                              */
/* -------------------------------------------------------------------------- */

interface Numeral {
  readonly id: number;
  readonly className: string;
}

/**
 * Position classes for the four cardinal hour numerals. All
 * offsets are percentages of the face, so the numerals stay
 * inside the tick band at every clock size.
 */
const NUMERALS: readonly Numeral[] = [
  {
    id: 12,
    className: "left-1/2 top-[16%] -translate-x-1/2",
  },
  {
    id: 3,
    className: "right-[15%] top-1/2 -translate-y-1/2",
  },
  {
    id: 6,
    className: "bottom-[16%] left-1/2 -translate-x-1/2",
  },
  {
    id: 9,
    className: "left-[15%] top-1/2 -translate-y-1/2",
  },
];

/**
 * The four cardinal hour numerals (12, 3, 6, 9).
 *
 * Static, so memoized for the same reason as `ClockTicks`.
 * Their colour comes from `--clock-ink`, so they follow the
 * atmosphere without re-rendering.
 */
const HourNumerals = memo(function HourNumerals() {
  return (
    <>
      {NUMERALS.map((numeral) => (
        <span
          key={numeral.id}
          aria-hidden="true"
          className={`
            absolute font-serif text-[18px] font-light leading-none
            text-[color:var(--clock-ink)] opacity-90 sm:text-[22px]
            ${numeral.className}
          `}
        >
          {numeral.id}
        </span>
      ))}
    </>
  );
});

/* -------------------------------------------------------------------------- */
/* Hand angle computation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Derive the three hand angles from a `LocalTime`.
 *
 * Degrees are measured clockwise from 12 o'clock, matching the
 * CSS `rotate` convention used by the hand elements. Extracted
 * as a pure function so it can be tested without rendering.
 *
 * These angles are *wrapped* (they return to 0 at the top of each
 * cycle). They are not passed to Framer Motion directly;
 * `useContinuousAngle` unwraps them first so the hands never spin
 * backwards at a minute or hour boundary.
 *
 * ## Hour hand drift
 *
 *   - `(hour % 12) * 30` — the base 30° per hour mark.
 *   - `minute * 0.5` — half a degree per minute, so the hour
 *     hand drifts smoothly across the hour.
 *   - `second / 120` — 1/120 of a degree per second, so the
 *     hour hand does not visibly jitter when the minute
 *     advances.
 *
 * ## Minute hand drift
 *
 *   - `minute * 6` — the base 6° per minute mark.
 *   - `second * 0.1` — 0.1° per second, so the minute hand
 *     advances continuously rather than clicking once per
 *     minute.
 *
 * ## Second hand
 *
 * One term: `second * 6`.
 *
 * ## 24-hour normalization
 *
 * `hour % 12` maps 00:00 and 12:00 to the same mark on a 12-hour
 * face.
 *
 * @param time - The local time to derive angles from.
 * @returns The three hand angles in degrees, clockwise from 12.
 */
export function computeHandAngles(time: LocalTime): {
  hour: number;
  minute: number;
  second: number;
} {
  return {
    hour:
      (time.hour % 12) * 30 +
      time.minute * 0.5 +
      time.second / 120,
    minute: time.minute * 6 + time.second * 0.1,
    second: time.second * 6,
  };
}

/**
 * Converts a wrapping angle (0–360) into a continuous one.
 *
 * Framer Motion interpolates between the raw numbers it is
 * given, so a wrapped angle going `354 → 0` makes the hand spin
 * backwards through almost a full turn. This hook keeps a running
 * angle and, whenever the wrapped angle changes, moves it by the
 * shortest signed difference: `354 → 360 → 366 …`. The hand
 * therefore always continues forward.
 *
 * ## Implementation
 *
 * The previous wrapped angle and the running angle live in state
 * and are updated during render, using React's documented
 * "derive state from props" pattern. No refs are read or written
 * during render, and no effect is needed. The update is
 * conditional on the input actually changing, so it settles after
 * one extra render, and it is idempotent for a given input
 * (Strict Mode's double render is safe).
 *
 * - The first render returns the angle unchanged.
 * - If the time jumps (e.g. a time override), the hand takes the
 *   shortest path to the new angle instead of a full spin. An
 *   exact 180° jump is a tie and goes forward.
 *
 * @param angle - The wrapped angle in degrees.
 * @returns A continuous angle in degrees (may exceed 360).
 */
function useContinuousAngle(angle: number): number {
  const [state, setState] = useState({
    raw: angle,
    continuous: angle,
  });

  if (state.raw === angle) {
    return state.continuous;
  }

  // Forward distance in [0, 360). Anything over 180° is shorter
  // going backwards; an exact 180° tie goes forward.
  const forward = (((angle - state.raw) % 360) + 360) % 360;
  const delta = forward > 180 ? forward - 360 : forward;

  const next = {
    raw: angle,
    continuous: state.continuous + delta,
  };

  setState(next);

  return next.continuous;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface AnalogClockProps {
  time: LocalTime;
}

/**
 * Analog clock face.
 *
 * A frosted-glass disc that matches the digital clock's
 * material, with slim rounded hands, a fine tick track, four
 * light serif numerals, and a signal-orange second hand.
 *
 * ## Design
 *
 * The face is deliberately sparse: no textures, no inner
 * windows, no second ring of detail. The design is carried by
 * the material (the same blurred glass, sheen and glow as
 * `DigitalClock`) and the single orange accent on the second
 * hand. The ink colour follows the sky (day, dawn, dusk, night),
 * so the clock stays legible against the atmosphere behind it.
 *
 * ## Performance
 *
 * The ticks and numerals are static and rendered by memoized
 * subcomponents, so a per-second re-render only updates the
 * three `motion.div` hands.
 *
 * ## Reduced motion
 *
 * When Framer's `useReducedMotion` fires, the hand transition
 * duration is `0`: the hands still move when the time changes,
 * but they snap rather than animate.
 *
 * ## Accessibility
 *
 * The whole face is a single `role="img"` whose accessible name
 * includes the current time string. Everything inside is
 * `aria-hidden`. The face introduces no focusable elements.
 */
export default function AnalogClock({ time }: AnalogClockProps) {
  const reducedMotion = useReducedMotion();
  const isReducedMotion = reducedMotion === true;

  const {
    hour: hourAngle,
    minute: minuteAngle,
    second: secondAngle,
  } = computeHandAngles(time);

  const hourRotation = useContinuousAngle(hourAngle);
  const minuteRotation = useContinuousAngle(minuteAngle);
  const secondRotation = useContinuousAngle(secondAngle);

  const palette = PALETTES[getAtmosphere(time.decimalHour)];

  return (
    <div
      className={["relative aspect-square", CLOCK_SIZE_CLASS].join(" ")}
      role="img"
      aria-label={`Analog clock showing ${time.time12}`}
      style={{ "--clock-ink": palette.ink } as React.CSSProperties}
    >
      {/* Halo behind the whole face. */}
      <div
        aria-hidden="true"
        className={[
          "absolute inset-[6%] rounded-full blur-[46px] transition-all duration-1000",
          palette.outerGlow,
        ].join(" ")}
      />

      {/* Glass disc: same material as the digital clock's panel. */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 rounded-full border
          border-[var(--foreground)]/20 bg-[var(--surface)]
          shadow-[0_28px_80px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]
          backdrop-blur-2xl
        "
      />

      {/* Sheen: light catching the top-left of the glass. */}
      <div
        aria-hidden="true"
        className="
          absolute inset-0 rounded-full
          bg-[radial-gradient(circle_at_30%_18%,rgba(255,255,255,0.13),transparent_55%)]
        "
      />

      {/* Inset bezel line. */}
      <div
        aria-hidden="true"
        className="
          absolute inset-[4%] rounded-full border
          border-[var(--foreground)]/[0.07]
        "
      />

      {/* Glow behind the hands. */}
      <div
        aria-hidden="true"
        className={[
          "absolute left-1/2 top-1/2 size-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[64px] transition-all duration-1000",
          palette.innerGlow,
        ].join(" ")}
      />

      <ClockTicks />

      <HourNumerals />

      {/* Hour hand. */}
      <motion.div
        aria-hidden="true"
        className="
          absolute bottom-1/2 left-1/2 z-20 w-[5px]
          rounded-full bg-[var(--clock-ink)]
          drop-shadow-[0_1px_4px_rgba(0,0,0,0.28)]
        "
        style={{
          height: "27%",
          marginLeft: "-2.5px",
          transformOrigin: "50% 100%",
        }}
        animate={{ rotate: hourRotation }}
        transition={{
          duration: isReducedMotion ? 0 : 0.2,
          ease: "linear",
        }}
      />

      {/* Minute hand. */}
      <motion.div
        aria-hidden="true"
        className="
          absolute bottom-1/2 left-1/2 z-20 w-[3px]
          rounded-full bg-[var(--clock-ink)]/85
          drop-shadow-[0_1px_4px_rgba(0,0,0,0.24)]
        "
        style={{
          height: "39%",
          marginLeft: "-1.5px",
          transformOrigin: "50% 100%",
        }}
        animate={{ rotate: minuteRotation }}
        transition={{
          duration: isReducedMotion ? 0 : 0.2,
          ease: "linear",
        }}
      />

      {/* Second hand, with its counterweight. */}
      <motion.div
        aria-hidden="true"
        className="
          absolute bottom-1/2 left-1/2 z-30 w-[2px]
          rounded-full bg-[#f26b3a]
        "
        style={{
          height: "41%",
          marginLeft: "-1px",
          transformOrigin: "50% 100%",
        }}
        animate={{ rotate: secondRotation }}
        transition={{
          duration: isReducedMotion ? 0 : 0.12,
          ease: "linear",
        }}
      >
        {/* Counterweight tail past the pivot. */}
        <div className="absolute left-1/2 top-full h-[20px] w-[3px] -translate-x-1/2 rounded-full bg-[#f26b3a]" />
      </motion.div>

      {/* Pivot. */}
      <span
        aria-hidden="true"
        className="
          absolute left-1/2 top-1/2 z-40 size-[14px]
          -translate-x-1/2 -translate-y-1/2 rounded-full
          border-2 border-[var(--clock-ink)]
          bg-[var(--background)]
        "
      />

      <span
        aria-hidden="true"
        className="
          absolute left-1/2 top-1/2 z-50 size-[5px]
          -translate-x-1/2 -translate-y-1/2 rounded-full
          bg-[#f26b3a]
        "
      />
    </div>
  );
}