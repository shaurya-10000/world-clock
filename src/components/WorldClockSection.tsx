"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useState } from "react";

import { getAtmosphere } from "@/lib/atmosphere";
import {
  getWorldLocationByTimezone,
  type WorldLocation,
} from "@/lib/locations";
import {
  getLocalTime,
  getLocalTimeZone,
  type ClockMode,
  type LocalTime,
  type TimeFormat,
} from "@/lib/time";
import { useNow } from "@/lib/useNow";

import SearchableLocationInput from "./search/SearchableLocationInput";

import AnalogClock from "./clock/AnalogClock";
import ControlBar from "./clock/ControlBar";
import DigitalClock from "./clock/DigitalClock";
import SkyAtmosphere from "./clock/SkyAtmosphere";

/* -------------------------------------------------------------------------- */
/* Shared easing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The shared soft ease-out curve used across every clock
 * animation. Matches the curve used by `AnalogClock`,
 * `DigitalClock`, and the other sections of the app so their
 * transitions feel consistent.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

/* -------------------------------------------------------------------------- */
/* Local time resolution                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort match between the browser's resolved time zone
 * and a location in the catalog.
 *
 * Returns `null` on the server — `getLocalTimeZone` itself
 * guards on `typeof window`, so the outer guard here is a
 * belt-and-suspenders check for callers running outside a
 * DOM environment.
 *
 * The zone identifier is normalized by `getLocalTimeZone`
 * before it reaches `getWorldLocationByTimezone`, so a
 * legacy alias like `Asia/Calcutta` matches the canonical
 * `Asia/Kolkata` entry without any special handling here.
 *
 * When multiple catalogued cities share a time zone, the
 * first one in editorial order wins — that is the behavior
 * `getWorldLocationByTimezone` implements, and it is what
 * keeps the "local city" default stable across releases.
 *
 * Returns `null` when the local zone has no catalogued city.
 * That is a valid outcome, not an error — the caller is
 * expected to fall back to `"Your local time"`.
 *
 * Exported so the `.test.ts` file can exercise it directly
 * without rendering the component.
 */
export function resolveLocalLocation(): WorldLocation | null {
  if (typeof window === "undefined") {
    return null;
  }

  return getWorldLocationByTimezone(getLocalTimeZone()) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

interface WorldClockSectionProps {
  /**
   * The location currently selected by the parent (globe or
   * cities drawer). When `null`, the section falls back to the
   * browser's local time zone — once — so the clock always
   * has something to show.
   */
  location: WorldLocation | null;

  /** Called when the user picks a location inside the section. */
  onLocationSelect: (location: WorldLocation) => void;
}

/**
 * The Time Zones section.
 *
 * Renders the sky, the clock, and the search field. Owns the
 * clock mode (analog / digital) and time format (12H / 24H).
 *
 * ## Active location
 *
 * The active location has two possible sources, in priority
 * order:
 *
 *   1. **The `location` prop.** Authoritative. The globe and
 *      the cities drawer both push selections through the
 *      parent, and the section reflects them.
 *
 *   2. **The browser's local time zone.** Resolved exactly
 *      once, after mount, when the parent has no location.
 *      The result — including the "no match" result — is
 *      cached in `fallback` so the lookup never runs again.
 *
 * ## Why the fallback is resolved in an effect, not during render
 *
 * `resolveLocalLocation` reads `window` and `Intl`, both of
 * which behave differently on the server and the client:
 *
 *   - On the server, `window` is undefined and the function
 *     returns `null`. The server-rendered HTML shows
 *     `"Your local time"`.
 *   - On the client, `window` is defined and the function
 *     returns the browser's local city, e.g. `"New Delhi"`.
 *
 * If the lookup ran during render, the first client render
 * would produce a tree whose `<h2>` reads `"New Delhi"`
 * where the server-rendered HTML reads `"Your local time"`.
 * React would flag this as a hydration mismatch and rebuild
 * the affected subtree.
 *
 * Deferring the lookup to a `useEffect` runs it *after*
 * hydration completes, so the first client render matches
 * the server HTML exactly, and the resolved city applies on
 * the commit that follows.
 *
 * Selection inside the section (via the search field) is
 * forwarded to the parent, which becomes the new source of
 * truth. There is no separate "internal active" state to keep
 * in sync — the section derives its location from the prop
 * plus the one-shot fallback.
 *
 * ## Accessibility
 *
 * The section is a `section` landmark with `id="time-zones"`.
 * The heading is a `<h2>` whose text is either the city name
 * or the string `"Your local time"`. The clock itself owns
 * its own accessible name (`role="img"` for the analog face,
 * `role="timer"` for the digital one).
 *
 * ## Layout
 *
 * The section is `flex-1` and a vertical flex column with
 * `justify-center`. It expects its parent to be a flex column
 * with a minimum height (the page supplies
 * `minHeight: CONTENT_HEIGHT` on desktop and a fixed-height
 * scroll container on mobile). The section then fills that
 * space, which makes it as tall as the globe section, and
 * centres the content block within it.
 *
 * Padding is symmetric (`py-*`) so the centring is visually
 * true. Content is never given a fixed height, so it cannot be
 * clipped or stretched; on short viewports the section simply
 * grows past the minimum.
 *
 * ## Reduced motion
 *
 * The `useReducedMotion` hook is consulted once, and the
 * resulting boolean is passed down to every child that
 * animates. The section does not re-check per animation.
 */
export default function WorldClockSection({
  location,
  onLocationSelect,
}: WorldClockSectionProps) {
  const reducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion === true;

  const [mode, setMode] = useState<ClockMode>("analog");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("12h");

  /*
   * One-shot fallback state.
   *
   *   - `undefined` — have not decided yet.
   *   - `null` — decided; the local zone has no catalogued
   *     city.
   *   - `WorldLocation` — decided; this is the local city.
   *
   * The distinction lets us run the local-timezone lookup
   * exactly once and never again. The functional form of
   * `setFallback` reads the current value so this effect can
   * run on every `location` change without clobbering a
   * fallback the user has since overridden by picking a new
   * city.
   */
  const [fallback, setFallback] = useState<
    WorldLocation | null | undefined
  >(undefined);

  useEffect(() => {
    if (location !== null) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferred until after hydration to match the server-rendered HTML
    setFallback((current) => {
      if (current !== undefined) return current;
      return resolveLocalLocation();
    });
  }, [location]);

  /* The active location: parent's choice wins, else fallback. */
  const activeLocation = location ?? fallback ?? null;

  /*
   * The clock face subscribes to the shared ticker.
   *
   * The ticker respects the app-wide time override (see
   * `lib/useNow.ts`), so a solstice preview freezes every
   * clock on the page including this one.
   */
  const now = useNow(1000);

  const time: LocalTime | null =
    activeLocation && now !== null
      ? getLocalTime(activeLocation, new Date(now))
      : null;

  const atmosphere = time ? getAtmosphere(time.decimalHour) : null;

  return (
    <section
      id="time-zones"
      className="
        relative isolate flex flex-1 flex-col justify-center overflow-visible
        px-5 py-12
        sm:px-8 sm:py-16
        lg:px-10 lg:py-20
        xl:px-16
      "
    >
      {time && (
        <SkyAtmosphere
          time={time}
          reducedMotion={shouldReduceMotion}
        />
      )}

      <div
        id="cities"
        className="relative z-10 mx-auto w-full max-w-6xl"
      >
        <motion.div
          initial={{
            opacity: 0,
            y: shouldReduceMotion ? 0 : 18,
          }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.75,
            ease: EASE,
          }}
        >
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--subtle)]">
                  Local time
                </p>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-serif text-3xl tracking-[-0.045em] text-[var(--foreground)] sm:text-[2.7rem]">
                    {activeLocation?.city ?? "Your local time"}
                  </h2>

                  {activeLocation && (
                    <span className="text-sm text-[var(--muted)]">
                      {activeLocation.country}
                    </span>
                  )}
                </div>
              </div>

              <ControlBar
                mode={mode}
                format={timeFormat}
                onModeChange={setMode}
                onFormatChange={setTimeFormat}
                reducedMotion={shouldReduceMotion}
              />
            </div>

            <SearchableLocationInput
              selectedLocation={activeLocation}
              onSelect={onLocationSelect}
              reducedMotion={shouldReduceMotion}
              placeholder="Search city or country"
              ariaLabel="Search a city, country or timezone"
            />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {activeLocation && time && atmosphere ? (
            <motion.div
              key={activeLocation.id}
              initial={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : 16,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: shouldReduceMotion ? 0 : -10,
              }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.55,
                ease: EASE,
              }}
              className="mt-8 sm:mt-12 lg:mt-14"
            >
              <div className="mb-7 flex items-center justify-center gap-3 text-center">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                  {activeLocation.timezone}
                </span>

                <span
                  aria-hidden="true"
                  className="size-1 rounded-full bg-[var(--foreground)]/20"
                />

                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--subtle)]">
                  {time.utcOffset}
                </span>
              </div>

              <div className="flex justify-center">
                <AnimatePresence mode="wait">
                  {mode === "analog" ? (
                    <motion.div
                      key="analog-clock"
                      initial={{
                        opacity: 0,
                        scale: shouldReduceMotion ? 1 : 0.97,
                      }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: shouldReduceMotion ? 1 : 0.97,
                      }}
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.5,
                        ease: EASE,
                      }}
                    >
                      <AnalogClock time={time} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="digital-clock"
                      initial={{
                        opacity: 0,
                        scale: shouldReduceMotion ? 1 : 0.97,
                      }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: shouldReduceMotion ? 1 : 0.97,
                      }}
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.5,
                        ease: EASE,
                      }}
                    >
                      <DigitalClock
                        time={time}
                        format={timeFormat}
                        reducedMotion={shouldReduceMotion}
                        atmosphere={atmosphere}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-7 text-center">
                <p className="text-sm text-[var(--foreground)]/70">
                  {time.formattedDate}
                </p>

                <div className="mt-2 flex items-center justify-center gap-3">
                  <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--subtle)]">
                    {time.zoneName}
                  </span>

                  <span
                    aria-hidden="true"
                    className="size-1 rounded-full bg-emerald-400/60"
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-16 flex min-h-[280px] items-center justify-center"
            >
              <span className="text-sm text-[var(--muted)]">
                Preparing local time…
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}