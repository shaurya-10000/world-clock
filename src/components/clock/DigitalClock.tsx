"use client";

import { motion } from "framer-motion";

import type { Atmosphere } from "@/lib/atmosphere";
import type { LocalTime, TimeFormat } from "@/lib/time";

import { CLOCK_SIZE_CLASS } from "./constants";

/**
 * Props for {@link DigitalClock}.
 */
interface DigitalClockProps {
  /** Current local time to display. */
  time: LocalTime;
  /** Whether to render in 12-hour or 24-hour format. */
  format: TimeFormat;
  /** When `true`, disables all motion for accessibility. */
  reducedMotion: boolean;
  /** Sky atmosphere; drives the clock's tint palette. */
  atmosphere: Atmosphere;
}

/* -------------------------------------------------------------------------- */
/* Time string parsing                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Splits a displayed time string into its digits and 12-hour period.
 *
 * The regex is anchored at both ends:
 *
 *   - `^(.+?)` captures the digits non-greedily, so the
 *     shortest possible prefix is tried first.
 *   - `\s+(AM|PM)$` requires whitespace followed by a
 *     period token at the very end of the string.
 *
 * The non-greedy quantifier plus the end anchor means the
 * regex will backtrack to the *last* whitespace-separated
 * AM/PM token in the string. That is why `"3:30:45 AM PM"`
 * yields `{ digits: "3:30:45 AM", period: "PM" }` rather than
 * `{ digits: "3:30:45", period: "AM PM" }`. This is
 * deliberate — the period token is always the trailing one.
 *
 * Case is not normalized: the matched substring is returned
 * exactly as it appeared in the input. Callers that need a
 * specific case should normalize the input before calling.
 *
 * @param displayedTime - A string like `"3:30:45 AM"` or `"15:30:45"`.
 * @returns The digits and period; `period` is `""` when no AM/PM is present.
 *
 * @example
 *   splitTimeParts("3:30:45 AM")   // { digits: "3:30:45", period: "AM" }
 *   splitTimeParts("15:30:45")     // { digits: "15:30:45", period: "" }
 *   splitTimeParts("3:30:45 AM PM")// { digits: "3:30:45 AM", period: "PM" }
 */
export function splitTimeParts(displayedTime: string): {
  digits: string;
  period: string;
} {
  const parts = displayedTime.match(/^(.+?)\s+(AM|PM)$/i);
  return {
    digits: parts?.[1] ?? displayedTime,
    period: parts?.[2] ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/* Atmosphere palette                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Class-string sets keyed by atmosphere.
 *
 * Hoisted to module scope so a per-second re-render does not
 * rebuild the strings. Each entry names the tinted surfaces the
 * clock uses:
 *
 *   - `outerGlow`: the large soft halo behind the whole frame.
 *   - `innerGlow`: the smaller radial highlight inside the frame.
 *   - `digits`: the time digits' color and drop shadow.
 *   - `period`: the AM/PM suffix's color.
 *   - `accent`: the fill of the seconds track.
 *   - `dot`: the live indicator above the digits.
 */
interface AtmospherePalette {
  readonly outerGlow: string;
  readonly innerGlow: string;
  readonly digits: string;
  readonly period: string;
  readonly accent: string;
  readonly dot: string;
}

const PALETTES: Readonly<Record<Atmosphere, AtmospherePalette>> = {
  day: {
    outerGlow: "bg-white/20",
    innerGlow: "bg-white/16",
    digits:
      "text-[var(--foreground)] drop-shadow-[0_1px_8px_rgba(255,255,255,0.35)]",
    period: "text-[var(--muted)]",
    accent: "bg-[var(--foreground)]/55",
    dot: "bg-emerald-700/60 shadow-[0_0_10px_rgba(5,150,105,0.2)]",
  },
  dawn: {
    outerGlow: "bg-orange-200/10",
    innerGlow: "bg-orange-300/[0.08]",
    digits:
      "text-orange-50 drop-shadow-[0_0_24px_rgba(255,177,110,0.1)]",
    period: "text-orange-100/55",
    accent: "bg-orange-300/70",
    dot: "bg-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.28)]",
  },
  dusk: {
    outerGlow: "bg-violet-200/10",
    innerGlow: "bg-violet-300/[0.08]",
    digits:
      "text-violet-50 drop-shadow-[0_0_24px_rgba(201,181,255,0.08)]",
    period: "text-violet-100/50",
    accent: "bg-violet-300/70",
    dot: "bg-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.28)]",
  },
  night: {
    outerGlow: "bg-cyan-200/[0.025]",
    innerGlow: "bg-cyan-100/[0.018]",
    digits:
      "text-white drop-shadow-[0_0_26px_rgba(255,255,255,0.06)]",
    period: "text-cyan-100/45",
    accent: "bg-cyan-300/60",
    dot: "bg-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.28)]",
  },
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Digital clock face.
 *
 * Renders the current time in a monospace face inside a rounded,
 * glass-like display whose tint shifts with the current
 * atmosphere (day / dawn / dusk / night). A soft blurred glow sits
 * behind the display to tie it to the sky.
 *
 * ## Design
 *
 * The display is built from a few quiet layers: a top sheen that
 * catches the light, very faint scanlines for a lit-panel feel, an
 * inset bezel line, and a soft glow behind the digits. A thin
 * track along the bottom fills across each minute, so the seconds
 * are visible without adding a second set of digits. The track
 * snaps back to empty at the top of the minute rather than
 * sweeping backwards.
 *
 * In 12-hour mode the `AM`/`PM` period is split from the digits
 * and rendered at a smaller size, the standard layout for
 * large-format digital clocks.
 *
 * The digits no longer fade in on every tick. A once-per-second
 * flicker reads as noise on a large display; the motion now plays
 * only when the format changes.
 *
 * ## Layout
 *
 * The root is the same `aspect-square` box as `AnalogClock`
 * (via `CLOCK_SIZE_CLASS`), so switching between the two faces
 * does not change the section's height.
 *
 * ## Accessibility
 *
 *   - `role="timer"` with `aria-live="off"`. The clock ticks
 *     every second, so any live-region value other than `"off"`
 *     would make screen readers announce the time once per
 *     second. `aria-label` still provides an on-demand readable
 *     description.
 *   - All decorative layers are marked `aria-hidden="true"`.
 *   - The component introduces no focusable elements.
 *
 * ## Reduced motion
 *
 * When `reducedMotion` is `true`, the format-change transition,
 * the seconds-track sweep, and the live-dot pulse are all
 * disabled. The values still update, so the clock keeps telling
 * time.
 *
 * @example
 * ```tsx
 * <DigitalClock
 *   time={localTime}
 *   format="12h"
 *   reducedMotion={false}
 *   atmosphere="night"
 * />
 * ```
 */
export default function DigitalClock({
  time,
  format,
  reducedMotion,
  atmosphere,
}: DigitalClockProps) {
  const displayedTime = format === "24h" ? time.time24 : time.time12;
  const { digits, period } = splitTimeParts(displayedTime);

  const palette = PALETTES[atmosphere];

  /*
   * Seconds track. `(second + 1) / 60` means the track is never
   * fully empty and reaches full at :59. The sweep transition is
   * skipped at :00 so the track resets instantly instead of
   * animating backwards across the display.
   */
  const secondsProgress = (time.second + 1) / 60;
  const animateTrack = !reducedMotion && time.second !== 0;

  return (
    <div
      className={["relative aspect-square", CLOCK_SIZE_CLASS].join(" ")}
      role="timer"
      aria-live="off"
      aria-atomic="true"
      aria-label={`Digital clock showing ${displayedTime}`}
    >
      <div
        aria-hidden="true"
        className={[
          "absolute inset-[7%] rounded-[34px] blur-[46px] transition-all duration-1000",
          palette.outerGlow,
        ].join(" ")}
      />

      <div
        className="
          absolute
          left-1/2
          top-1/2
          h-[56%]
          w-[92%]
          -translate-x-1/2
          -translate-y-1/2
          overflow-hidden
          rounded-[32px]
          border
          border-[var(--foreground)]/20
          bg-[var(--surface)]
          shadow-[0_28px_80px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.18)]
          backdrop-blur-2xl
          transition-all
          duration-1000
          sm:h-[52%]
          sm:w-[94%]
          sm:rounded-[36px]
        "
      >
        {/* Top sheen. */}
        <div
          aria-hidden="true"
          className="
            absolute inset-x-0 top-0 h-1/2
            bg-gradient-to-b from-white/[0.08] to-transparent
          "
        />

        {/* Faint scanlines for a lit-panel texture. */}
        <div
          aria-hidden="true"
          className="
            absolute inset-0 opacity-70
            bg-[repeating-linear-gradient(0deg,transparent_0,transparent_3px,rgba(255,255,255,0.022)_3px,rgba(255,255,255,0.022)_4px)]
          "
        />

        {/* Inset bezel line. */}
        <div
          aria-hidden="true"
          className="
            absolute
            inset-[9px]
            rounded-[25px]
            border
            border-[var(--foreground)]/[0.055]
            sm:inset-[11px]
            sm:rounded-[29px]
          "
        />

        {/* Glow behind the digits. */}
        <div
          aria-hidden="true"
          className={[
            "absolute left-1/2 top-1/2 size-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[64px] transition-all duration-1000",
            palette.innerGlow,
          ].join(" ")}
        />

        {/* Live indicator. */}
        <span
          aria-hidden="true"
          className={[
            "absolute left-1/2 top-[14%] size-1 -translate-x-1/2 rounded-full transition-colors duration-1000",
            reducedMotion ? "" : "animate-pulse",
            palette.dot,
          ].join(" ")}
        />

        <div className="absolute inset-[10%] flex items-center justify-center">
          <motion.div
            key={format}
            initial={{
              opacity: reducedMotion ? 1 : 0.72,
              y: reducedMotion ? 0 : 3,
            }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className={[
              "flex items-baseline justify-center whitespace-nowrap font-mono text-[clamp(2.25rem,6.2vw,4.35rem)] font-light leading-none tracking-[-0.08em] tabular-nums",
              palette.digits,
            ].join(" ")}
          >
            <span>{digits}</span>

            {format === "12h" && period && (
              <span
                className={[
                  "ml-3 translate-y-[-0.12em] font-mono text-[9px] font-medium tracking-[0.17em] uppercase sm:ml-4 sm:text-[10px]",
                  palette.period,
                ].join(" ")}
              >
                {period}
              </span>
            )}
          </motion.div>
        </div>

        {/* Seconds track. */}
        <div
          aria-hidden="true"
          className="
            absolute inset-x-[12%] bottom-[14%] h-[2px]
            overflow-hidden rounded-full
            bg-[var(--foreground)]/10
          "
        >
          <div
            className={[
              "h-full w-full origin-left rounded-full",
              palette.accent,
              animateTrack
                ? "transition-transform duration-1000 ease-linear"
                : "",
            ].join(" ")}
            style={{ transform: `scaleX(${secondsProgress})` }}
          />
        </div>
      </div>
    </div>
  );
}