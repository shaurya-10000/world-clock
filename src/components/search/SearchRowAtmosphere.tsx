"use client";

import { CloudSun, Moon, Sun } from "lucide-react";
import { useMemo } from "react";

import {
  getAtmosphere,
  getAtmosphereVisual,
  type AtmosphereIcon,
} from "@/lib/atmosphere";
import { getDecimalHour } from "@/lib/time";
import { useNow } from "@/lib/useNow";

/**
 * Maps the string icon keys from `lib/atmosphere` to Lucide
 * components. Kept local to this file so both consumers share
 * one mapping.
 *
 * Not exported. The mapping is a three-entry lookup table whose
 * correctness is already asserted indirectly by the rendered
 * `lucide-*` class names in the component tests.
 */
const ATMOSPHERE_ICONS: Record<
  AtmosphereIcon,
  React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    "aria-hidden"?: boolean;
  }>
> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  moon: Moon,
};

interface AtmosphereVisualResult {
  atmosphere: ReturnType<typeof getAtmosphere>;
  visual: ReturnType<typeof getAtmosphereVisual>;
}

/* -------------------------------------------------------------------------- */
/* Atmosphere hook                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How often the atmosphere is recomputed.
 *
 * One hour. The atmosphere is a categorical classification of
 * the local hour — it can only change at the categorical
 * boundaries (dawn at 05:00, day at 07:00, dusk at 17:00,
 * night at 20:00). A one-minute cadence, which the previous
 * version of this hook used, was thirty times more work than
 * the answer required: for 59 out of every 60 ticks, the
 * recomputed atmosphere is identical to the previous one.
 *
 * With ~260 rows potentially mounted at once (cities drawer
 * plus search dropdown), a one-minute cadence meant 260
 * component re-renders per minute on the shared ticker. One
 * hour reduces that by a factor of 60 with no visible change
 * to the UI, because the atmosphere genuinely does not change
 * more often than that.
 *
 * The one exception is the boundary itself: a row whose local
 * hour is 04:59:59 will keep showing `night` for up to a
 * minute past the 05:00 boundary before the ticker fires. That
 * is imperceptible — the change is a palette shift, not an
 * event — and the cost of eliminating it would be returning to
 * the one-minute cadence this constant exists to avoid.
 */
const ATMOSPHERE_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Computes the visual atmosphere for a time zone.
 *
 * Subscribes to the shared ticker at a slow cadence (once per
 * hour) because atmosphere changes only at hour boundaries.
 * Used by both search surfaces so they derive their palette
 * from the same source of truth.
 *
 * The result is memoized on `(now, timezone)`. Two rows sharing
 * a time zone but rendering at different tick values will compute
 * independently; two rows sharing both will receive the same
 * object by reference for the duration of that tick.
 *
 * @param timezone - IANA time zone name (e.g. `"Asia/Tokyo"`).
 * @param updateIntervalMs - Ticker cadence. Defaults to one
 *   hour. Pass a shorter value in tests that need to observe
 *   the atmosphere changing.
 */
export function useAtmosphereVisual(
  timezone: string,
  updateIntervalMs = ATMOSPHERE_UPDATE_INTERVAL_MS,
): AtmosphereVisualResult {
  const now = useNow(updateIntervalMs);

  return useMemo(() => {
    const instant = now ? new Date(now) : new Date();
    const decimalHour = getDecimalHour(instant, timezone);
    const atmosphere = getAtmosphere(decimalHour);

    return {
      atmosphere,
      visual: getAtmosphereVisual(atmosphere),
    };
  }, [now, timezone]);
}

/* -------------------------------------------------------------------------- */
/* Row atmosphere chrome                                                      */
/* -------------------------------------------------------------------------- */

export interface SearchRowAtmosphereProps {
  /**
   * The location's IANA time zone. Used to derive the current
   * atmosphere.
   */
  timezone: string;

  /**
   * When `true`, the ambient background becomes slightly brighter
   * on hover of the parent `group`. Both consumers wrap their row
   * in a `group` class.
   */
  hoverHighlight?: boolean;

  /**
   * The icon size. The drawer uses `size-14`, the Time Zones
   * dropdown uses `size-12`. Both are visually similar; the
   * parameter exists so neither has to compromise.
   */
  iconSize?: string;
}

/**
 * The atmospheric background chrome shared by `CityRow` (in the
 * cities drawer) and `ResultRow` (in the Time Zones search
 * dropdown).
 *
 * Renders three absolutely-positioned layers that sit behind the
 * row's content:
 *
 * 1. The atmosphere's `ambient.background` — the full-row
 *    gradient wash that gives each city its characteristic color.
 * 2. The atmosphere's `ambient.glow` — a tighter radial highlight
 *    layered on top.
 * 3. The atmospheric icon, faded and positioned near the right
 *    edge.
 *
 * Everything else — the border, the interactive element, the
 * specific content (heart vs. checkmark), the text — stays in the
 * consumer. This component exists because the three layers above
 * are byte-identical between the two surfaces.
 *
 * Must be rendered inside a `group` class. The parent is
 * responsible for `relative` positioning and `overflow-hidden`
 * clipping.
 *
 * ## Icon anchoring
 *
 * The icon is anchored with `right-22` (5.5rem from the right
 * edge of the row), not to the row's content padding. That is a
 * deliberate choice: it keeps the icon at a consistent physical
 * distance from the row's right edge regardless of the padding
 * each consumer uses (`px-6` in `CityRow`, `px-4` in
 * `ResultRow`). The result is a stable visual rhythm when a
 * user scrolls between the two surfaces.
 *
 * `right-22` requires Tailwind ≥ 3.3, which added the `22`
 * step to the default spacing scale. If the project ever
 * downgrades below that, replace with `right-[5.5rem]`.
 *
 * ## Accessibility
 *
 * Every layer is `aria-hidden="true"` and `pointer-events-none`.
 * The component contributes nothing to the accessibility tree —
 * it is chrome. The accessible name of the row belongs to
 * whichever consumer wraps it.
 *
 * @example
 * ```tsx
 * <div className="group relative overflow-hidden">
 *   <SearchRowAtmosphere timezone={location.timezone} hoverHighlight />
 *   {/* row content *\/}
 * </div>
 * ```
 */
export default function SearchRowAtmosphere({
  timezone,
  hoverHighlight = false,
  iconSize = "size-14",
}: SearchRowAtmosphereProps) {
  const { visual } = useAtmosphereVisual(timezone);
  const ZoneIcon = ATMOSPHERE_ICONS[visual.icon];

  return (
    <>
      <div
        aria-hidden="true"
        className={`
          pointer-events-none absolute inset-0
          ${visual.ambient.background}
          opacity-80
          ${
            hoverHighlight
              ? "transition-opacity duration-500 group-hover:opacity-100"
              : ""
          }
        `}
      />

      <div
        aria-hidden="true"
        className={`
          pointer-events-none absolute inset-0
          ${visual.ambient.glow}
          opacity-80
        `}
      />

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute right-22 top-1/2
          hidden -translate-y-1/2 sm:block
        "
      >
        <ZoneIcon
          className={`
            ${iconSize}
            ${visual.iconClass}
            opacity-25
          `}
          strokeWidth={0.9}
          aria-hidden
        />
      </div>
    </>
  );
}