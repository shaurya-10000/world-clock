"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import type {
  ClockMode,
  TimeFormat,
} from "@/lib/time";

import { EASE } from "./constants";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  reducedMotion: boolean;
  /**
   * When `true`, the indicator uses a filled, high-contrast
   * style (used by the Analog/Digital switch). When `false`,
   * it uses a subtle tinted style (used by the 12H/24H
   * switch).
   */
  strong: boolean;
  className?: string;
}

export interface ControlBarProps {
  mode: ClockMode;
  format: TimeFormat;
  onModeChange: (mode: ClockMode) => void;
  onFormatChange: (format: TimeFormat) => void;
  reducedMotion: boolean;
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Compute the horizontal offset of the active indicator.
 *
 * The indicator is half the container width; the second option
 * sits at `100%` of that width plus the `2px` gap between the
 * buttons. That `2px` matches the container's `p-1` padding
 * scheme and the two-button layout — it is not a magic number,
 * it is the gap.
 *
 * Extracted as a pure function so the offset logic can be
 * tested in isolation, and so the return type can be the
 * literal union of the two possible values rather than a
 * general string. A caller that wants to branch on the exact
 * offset (e.g. to attach a data attribute) can do so without
 * a runtime comparison.
 *
 * @param activeIndex - The index of the active option. A
 *   value `<= 0` — including the `-1` returned by `findIndex`
 *   when the value is not in the options list — maps to the
 *   first position.
 */
export function computeIndicatorOffset(
  activeIndex: number,
): "0%" | "calc(100% + 2px)" {
  return activeIndex <= 0 ? "0%" : "calc(100% + 2px)";
}

/**
 * A two-option segmented control.
 *
 * The visual indicator slides between options with Framer
 * Motion. The buttons themselves are `<button aria-pressed>`
 * rather than a radiogroup — this is a toggle-style control
 * where the two options are independent state values, not a
 * single selection with an "other" state.
 *
 * ## Variants
 *
 * `strong` toggles between two visual treatments:
 *
 *   - **Strong** — the indicator is filled with the foreground
 *     color and the active label inverts to the background
 *     color. Used by the Analog/Digital switch, which is the
 *     primary control and needs the higher contrast.
 *
 *   - **Weak** — the indicator is a subtle foreground tint and
 *     the active label stays in the foreground color. Used by
 *     the 12H/24H switch, which is secondary and should not
 *     compete with the mode control for attention.
 *
 * Both variants render identical DOM structure; only the
 * indicator's background and the active label's color differ.
 */
function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  reducedMotion,
  strong,
  className,
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex(
    (option) => option.value === value,
  );

  const indicatorX = computeIndicatorOffset(activeIndex);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        "relative inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm backdrop-blur-xl",
        className ?? "",
      ].join(" ")}
    >
      <motion.span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full",
          strong
            ? "bg-[var(--foreground)] shadow-[0_3px_12px_rgba(0,0,0,0.12)]"
            : "bg-[var(--foreground)]/[0.08]",
        ].join(" ")}
        animate={{ x: indicatorX }}
        transition={{
          duration: reducedMotion ? 0 : 0.36,
          ease: EASE,
        }}
      />

      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              "relative z-10 rounded-full text-[9px] font-semibold uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/25",
              strong
                ? "min-w-[78px] px-4 py-2 text-[10px] tracking-[0.13em]"
                : "px-3 py-2",
            ].join(" ")}
          >
            <span
              className={
                active
                  ? strong
                    ? "text-[var(--background)]"
                    : "text-[var(--foreground)]"
                  : "text-[var(--muted)] transition-colors duration-300 hover:text-[var(--foreground)]"
              }
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Option tables                                                              */
/* -------------------------------------------------------------------------- */

const MODE_OPTIONS: readonly SegmentedOption<ClockMode>[] = [
  { value: "analog", label: "Analog" },
  { value: "digital", label: "Digital" },
];

const FORMAT_OPTIONS: readonly SegmentedOption<TimeFormat>[] = [
  { value: "12h", label: "12H" },
  { value: "24h", label: "24H" },
];

/* -------------------------------------------------------------------------- */
/* Control bar                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The clock controls.
 *
 * Two segmented controls:
 *
 *   1. **Mode** (Analog / Digital) — always visible. Uses the
 *      `strong` visual variant.
 *   2. **Format** (12H / 24H) — visible only when the mode is
 *      `"digital"`. Uses the `weak` variant.
 *
 * The format control animates in and out with a width
 * transition. `AnimatePresence mode="wait"` defers mounting
 * the incoming child until the outgoing child finishes its
 * exit animation — under test this requires the framer-motion
 * mock to make `AnimatePresence` synchronous, or the format
 * bar never appears when switching from analog to digital.
 *
 * ## Why aria-pressed rather than a radiogroup
 *
 * These are toggle-style controls where the two options are
 * independent state values, not a single selection with an
 * "other" state. `aria-pressed` accurately describes the
 * relationship between the button and its state; a
 * `role="radiogroup"` would imply a mode where neither is
 * selected, which is not possible here.
 *
 * ## Reduced motion
 *
 * Every transition duration is `0` when `reducedMotion` is
 * `true`. The indicator and the format bar still appear and
 * disappear — the state changes are visible — but the
 * interpolation between states is skipped.
 */
export default function ControlBar({
  mode,
  format,
  onModeChange,
  onFormatChange,
  reducedMotion,
}: ControlBarProps) {
  return (
    <div className="flex items-center gap-3">
      <SegmentedControl
        ariaLabel="Clock display"
        options={MODE_OPTIONS}
        value={mode}
        onChange={onModeChange}
        reducedMotion={reducedMotion}
        strong
      />

      <AnimatePresence initial={false} mode="wait">
        {mode === "digital" && (
          <motion.div
            key="format"
            initial={{
              opacity: 0,
              width: reducedMotion ? "auto" : 0,
            }}
            animate={{
              opacity: 1,
              width: "auto",
            }}
            exit={{
              opacity: 0,
              width: reducedMotion ? "auto" : 0,
            }}
            transition={{
              duration: reducedMotion ? 0 : 0.3,
              ease: EASE,
            }}
            className="overflow-hidden"
          >
            <SegmentedControl
              ariaLabel="Digital time format"
              options={FORMAT_OPTIONS}
              value={format}
              onChange={onFormatChange}
              reducedMotion={reducedMotion}
              strong={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}