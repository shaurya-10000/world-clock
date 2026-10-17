"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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

const EASE = [0.16, 1, 0.3, 1] as const;

/* -------------------------------------------------------------------------- */
/* Local time resolution                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort match between the browser's resolved time zone
 * and a location in the catalog. Returns `null` on the server
 * or when the local zone has no catalogued city.
 *
 * Exported so the `.test.ts` file can exercise it directly.
 */
export function resolveLocalLocation(): WorldLocation | null {
  if (typeof window === "undefined") {
    return null;
  }

  return getWorldLocationByTimezone(getLocalTimeZone()) ?? null;
}

/* -------------------------------------------------------------------------- */
/* FitToHeight                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fills the space its flex parent gives it and scales its
 * children down (never up) so they always fit that height.
 *
 * The wrapper's height comes purely from flex (`flex-1
 * min-h-0`). The inner box keeps its natural size, which is
 * measured with `offsetHeight` (unaffected by transforms), and
 * a CSS scale is applied from the top-centre. This keeps the
 * clock section the same height as the globe section on every
 * viewport without touching the clock components themselves.
 */
function FitToHeight({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const available = outer.clientHeight;
      const natural = inner.offsetHeight;
      if (!available || !natural) return;
      const next = Math.min(1, available / natural);
      setScale((current) =>
        Math.abs(current - next) < 0.001 ? current : next,
      );
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="min-h-0 flex-1">
      <div
        ref={innerRef}
        className="flex justify-center"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

interface WorldClockSectionProps {
  /** The location currently selected by the parent. */
  location: WorldLocation | null;

  /** Called when the user picks a location inside the section. */
  onLocationSelect: (location: WorldLocation) => void;
}

/**
 * The Time Zones section.
 *
 * Fills exactly the height its parent gives it (the page gives
 * it the same height as the globe section). Heading, search,
 * clock and date are laid out in a flex column; the clock is
 * wrapped in `FitToHeight` so it shrinks to whatever room is
 * left instead of making the section taller.
 *
 * The browser-local fallback location is still resolved in an
 * effect, after hydration, so the first client render matches
 * the server HTML.
 */
export default function WorldClockSection({
  location,
  onLocationSelect,
}: WorldClockSectionProps) {
  const reducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion === true;

  const [mode, setMode] = useState<ClockMode>("analog");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("12h");

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

  const activeLocation = location ?? fallback ?? null;

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
        relative isolate flex min-h-0 flex-1 scroll-mt-[76px] flex-col overflow-visible
        px-5 py-4
        sm:px-8 sm:py-6
        lg:px-10 lg:py-8
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
        className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col"
      >
        <motion.div
          className="shrink-0"
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
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--subtle)]">
                  Local time
                </p>

                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
              className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-6"
            >
              <div className="mb-3 flex shrink-0 items-center justify-center gap-3 text-center">
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

              <FitToHeight>
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
              </FitToHeight>

              <div className="mt-3 shrink-0 text-center">
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
              className="flex min-h-0 flex-1 items-center justify-center"
            >
              <span className="text-sm text-[var(--muted)]">
                Preparing local time&hellip;
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}