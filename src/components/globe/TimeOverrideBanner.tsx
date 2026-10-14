"use client";

/**
 * The time-override banner.
 *
 * Shown across the top of the globe section whenever an
 * astronomical event preset is active. Its job is to answer
 * two questions the user will inevitably have:
 *
 *   1. **What moment am I looking at?** Every clock in the app
 *      is frozen at the override instant. Without a label, the
 *      user might think the app is broken.
 *
 *   2. **How do I get back to now?** The answer must be one
 *      click away, always visible, never buried in a menu.
 *
 * ## What it renders
 *
 * A thin, translucent strip pinned to the top of its parent
 * container. It contains:
 *
 *   - A small pulse dot in the accent color, indicating
 *     "something is different from normal".
 *   - The label of the active event — "Next solstice",
 *     "Sunrise in Tokyo", etc. — passed in as a prop, because
 *     the mapping from override timestamp to human label lives
 *     in the picker's hook, not here.
 *   - The formatted UTC date and time of the override, so the
 *     user knows exactly what moment they are viewing.
 *   - A "Back to now" button.
 *
 * ## Why a prop for the label
 *
 * This component reads `lib/time-override.ts` directly to get
 * the override *value* — that is the whole point of a
 * self-subscribing banner, it should react to the override
 * changing without a prop drilling chain. But the *label* is a
 * different concern: it is the picker's knowledge, mapped from
 * an event ID to a human-readable string. Duplicating that
 * mapping here would violate single-source-of-truth. So the
 * label comes in as a prop, and the value comes from the
 * override.
 *
 * ## Formatting
 *
 * The moment is formatted with `Intl.DateTimeFormat` using
 * UTC. Time-zone-aware formatting would require a selected
 * city, and the picker supports city-agnostic events
 * (solstices, equinoxes) that have no city. UTC is the only
 * time zone that applies to every possible override.
 *
 * The date is rendered in a medium-length human format —
 * "June 20, 2024 at 20:51 UTC" — rather than an ISO string,
 * because an ISO string reads as machine output to most
 * users. The exact joining word between date and time
 * ("at" vs a comma) is locale- and ICU-dependent, and this
 * component does not normalize it.
 *
 * ## ICU variance on midnight
 *
 * Some ICU builds — Ubuntu's, notably — render midnight as
 * `"24:00"` under `hour12: false` instead of `"00:00"`. That
 * is the same discrepancy that `lib/time.ts` normalizes for
 * its own outputs. The banner uses its own formatter for
 * historical reasons, so it needs its own normalization. If
 * the formatter ever moves to a shared module, this
 * normalization should move with it.
 *
 * ## Why `useSyncExternalStore`
 *
 * The override is a module-level primitive owned by
 * `lib/time-override.ts`, with a subscribe/getSnapshot pair.
 * That is exactly the shape `useSyncExternalStore` is
 * designed for, and it handles the SSR-correct initial read
 * (the server has no override) and the subscription lifecycle
 * (cleared on unmount) without any manual bookkeeping.
 *
 * A `useState` + `useEffect(subscribe)` version would have
 * the same behavior in production but would trip React's
 * hydration warnings: the server renders with `null`, the
 * first client render would also produce `null`, and then the
 * effect would fire and set the value — producing a mismatch
 * between the two renders of the same commit. The
 * `useSyncExternalStore` third argument (`getServerSnapshot`)
 * is what tells React "this is what the server saw" so it can
 * reconcile correctly.
 *
 * ## Reduced motion
 *
 * The pulse animation on the dot is disabled when the caller
 * passes `reducedMotion={true}`. The dot itself remains
 * visible (it is a state indicator, not a decoration), but it
 * does not breathe.
 */

import { ArrowLeft } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  clearTimeOverride,
  getTimeOverride,
  subscribeToTimeOverride,
} from "@/lib/time-override";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TimeOverrideBannerProps {
  /**
   * The label of the currently active preset, or `null` when
   * no override is active. Provided by the picker's hook.
   *
   * When this is `null` and an override is somehow active
   * (a developer error, or a direct `setTimeOverride` call
   * from another module), the banner still renders with a
   * generic label. This is defensive — the banner's job is
   * to tell the user "you are not looking at now", and that
   * is more important than the specific label.
   */
  readonly label: string | null;

  /**
   * When `true`, the pulse animation on the indicator dot is
   * disabled. The dot stays visible.
   */
  readonly reducedMotion: boolean;
}

/* -------------------------------------------------------------------------- */
/* Date formatting                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A shared `Intl.DateTimeFormat` for the banner's timestamp.
 *
 * Constructed once at module load. Building a new one on every
 * render would cost 10–40µs, and this banner re-renders on
 * every override change and on every parent re-render — a
 * shared instance is the correct pattern.
 *
 * Uses `medium` date and `short` time, in UTC. The choice of
 * UTC is deliberate: the banner describes an astronomical
 * moment, and astronomical moments are conventionally quoted
 * in UTC. It also means the banner works for events that
 * have no associated city.
 */
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Format an override timestamp for display.
 *
 * Renders as "June 20, 2024 at 20:51 UTC" or
 * "June 20, 2024, 20:51 UTC" — the exact separator depends
 * on the ICU build, which is why this function does not
 * attempt to normalize the joining pattern. What it does
 * normalize is the hour.
 *
 * ## The midnight substitution
 *
 * Some ICU builds render midnight under `hour12: false` as
 * `"24:00"` rather than `"00:00"`. The standard astronomical
 * convention — and the format every other surface in this
 * app uses — is `"00:00"`.
 *
 * The regex uses `\b` word boundaries rather than `^` and `$`
 * anchors. The time is embedded inside a longer string
 * ("January 1, 2024 at 24:00 UTC") whose leading text differs
 * across ICU builds, so an anchored match would silently fail
 * on the builds that insert a word before the time. The word
 * boundary matches `24:00` wherever it appears as a standalone
 * token, which is exactly the region of interest.
 *
 * A date like "June 24, 2024" is left alone — its `24` is not
 * followed by a colon. A minute like "12:24" is left alone —
 * its `24` is preceded by a digit, and `\b` requires a
 * word-to-non-word transition.
 *
 * Exported for testing.
 */
export function formatOverrideTimestamp(ms: number): string {
  const formatted = TIMESTAMP_FORMATTER.format(new Date(ms));
  return `${formatted.replace(/\b24:00\b/, "00:00")} UTC`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function TimeOverrideBanner({
  label,
  reducedMotion,
}: TimeOverrideBannerProps) {
  /*
   * Subscribe to the override value so the banner unmounts
   * automatically when the override is cleared — including
   * when the clear comes from somewhere other than this
   * banner's own button (the "now" preset in the picker, or a
   * direct `clearTimeOverride` call from another module).
   *
   * `useSyncExternalStore` handles the SSR-correct initial
   * read and the subscription lifecycle. The value is a
   * primitive, so referential-equality concerns do not apply.
   */
  const override = useSyncExternalStore(
    subscribeToTimeOverride,
    getTimeOverride,
    () => null,
  );

  /*
   * No override means no banner. Returning `null` rather than
   * rendering an empty shell keeps the DOM clean and lets
   * consumers place the banner without a wrapper condition.
   */
  if (override === null) return null;

  const timestamp = formatOverrideTimestamp(override);
  const displayLabel = label ?? "Frozen moment";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="
        pointer-events-auto
        flex items-center gap-3
        rounded-full border border-white/[0.09]
        bg-black/50 px-3 py-1.5
        shadow-[0_20px_60px_rgba(0,0,0,0.32)]
        backdrop-blur-xl
        sm:gap-4 sm:px-4 sm:py-2
      "
    >
      {/* Status dot */}
      <span
        aria-hidden="true"
        className="relative flex size-1.5 shrink-0"
      >
        <span
          className={[
            "absolute inset-0 rounded-full bg-[var(--accent)]",
            "shadow-[0_0_10px_var(--accent-glow)]",
            /*
             * The pulse animation is what visually signals
             * "something is different from the default".
             * When reduced motion is requested, the dot
             * renders at full opacity with no animation —
             * still visible, just static.
             */
            reducedMotion ? "" : "animate-pulse",
          ].join(" ")}
        />
      </span>

      {/* Label + timestamp */}
      <span className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <span
          className="
            truncate text-[11px] font-semibold tracking-[-0.01em]
            text-white sm:text-[12px]
          "
        >
          {displayLabel}
        </span>

        <span
          className="
            truncate font-mono text-[9px] tabular-nums
            tracking-[0.02em] text-white/50
            sm:text-[10px]
          "
        >
          {timestamp}
        </span>
      </span>

      {/* Back to now */}
      <button
        type="button"
        onClick={clearTimeOverride}
        aria-label="Return to live time"
        className="
          ml-1 flex shrink-0 items-center gap-1
          rounded-full border border-white/[0.10]
          bg-white/[0.04] px-2.5 py-1
          text-[10px] font-medium tracking-[-0.01em]
          text-white/85
          transition-colors duration-200
          hover:bg-white/[0.10] hover:text-white
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-white/40
          sm:ml-2 sm:px-3 sm:py-1.5 sm:text-[11px]
        "
      >
        <ArrowLeft
          aria-hidden="true"
          className="size-3 shrink-0"
          strokeWidth={1.8}
        />
        <span>Back to now</span>
      </button>
    </div>
  );
}