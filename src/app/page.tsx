"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import CitiesSection from "@/components/CitiesSection";
import DayNightFavicon from "@/components/DayNightFavicon";
import Globe from "@/components/Globe";
import GlobeAtmosphere from "@/components/GlobeAtmosphere";
import Header from "@/components/Header";
import WorldClockSection from "@/components/WorldClockSection";

import {
  getWorldLocationByTimezone,
  type WorldLocation,
} from "@/lib/locations";
import { getLocalTimeZone } from "@/lib/time";
import type { SolarState } from "@/lib/useSolarState";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const HEADER_HEIGHT_PX = 76;
const CONTENT_HEIGHT = `calc(100dvh - ${HEADER_HEIGHT_PX}px)`;
const MOBILE_QUERY = "(max-width: 767px)";
const DEFAULT_TITLE = "World Clock";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type MobileView = "globe" | "zones";

export interface LayoutProps {
  selectedLocationId: string | null;
  clockLocation: WorldLocation | null;
  onLocationSelect: (location: WorldLocation) => void;
  solarState: SolarState | null;
  onSolarChange: (solarState: SolarState) => void;
}

/* -------------------------------------------------------------------------- */
/* Media query                                                                */
/* -------------------------------------------------------------------------- */

/**
 * True when `window.matchMedia` is callable. jsdom and some
 * embedded webviews do not implement it, so every access must
 * be guarded rather than assumed.
 */
function hasMatchMedia(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  );
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      if (!hasMatchMedia()) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback((): boolean => {
    if (!hasMatchMedia()) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback((): boolean => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* -------------------------------------------------------------------------- */
/* Mounted flag                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `false` during SSR and the first client render, `true`
 * thereafter.
 *
 * Implemented with `useSyncExternalStore` rather than a
 * `useEffect` + `setState` because the snapshot has to differ
 * between the server pass and the client pass without
 * producing a hydration mismatch. `getServerSnapshot` returns
 * `false`; on the client, React uses that same value for the
 * hydration render and only switches to `getSnapshot` (which
 * returns `true`) once the subscription has been established,
 * which happens after hydration has completed.
 *
 * A `useEffect(() => setMounted(true), [])` produces the same
 * end state, but it is flagged by
 * `react-hooks/set-state-in-effect` and it costs an extra
 * commit. This hook gets there without either.
 *
 * The subscribe callback intentionally returns a no-op: the
 * snapshot changes once, at hydration time, and never again.
 */
const subscribeMounted = (): (() => void) => () => {};
const getMountedSnapshot = (): boolean => true;
const getMountedServerSnapshot = (): boolean => false;

function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );
}

/* -------------------------------------------------------------------------- */
/* Local location resolution                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort match between the browser's resolved time zone
 * and a location in the catalog.
 *
 * Returns `null` on the server — `getLocalTimeZone` itself
 * guards on `typeof window`. The outer guard here is a
 * belt-and-suspenders check for callers running outside a
 * DOM environment.
 *
 * Exported so tests can exercise it directly without
 * rendering the page.
 */
export function resolveLocalLocation(): WorldLocation | null {
  if (typeof window === "undefined") return null;

  try {
    return getWorldLocationByTimezone(getLocalTimeZone()) ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const [selectedLocationId, setSelectedLocationId] = useState<
    string | null
  >(null);

  /*
   * The clock's active location. `null` on the server and on
   * the first client render; populated by the effect below on
   * the commit that follows hydration.
   *
   * ## Why `null` and not a lazy initializer
   *
   * A lazy `useState(() => resolveLocalLocation())` reads
   * `window` during the first client render, which produces a
   * tree that does not match the server-rendered HTML: the
   * server renders `"Your local time"` (window undefined →
   * null), the client renders the visitor's city. React flags
   * that as a hydration mismatch and rebuilds the affected
   * subtree.
   *
   * Keeping the initial value `null` means the first client
   * render matches the server exactly. The effect then reads
   * the browser's local zone after hydration and applies it
   * on the next commit.
   */
  const [clockLocation, setClockLocation] =
    useState<WorldLocation | null>(null);

  const [mobileView, setMobileView] =
    useState<MobileView>("globe");
  const [solarState, setSolarState] = useState<SolarState | null>(
    null,
  );

  /*
   * `mounted` gates the responsive branch. On the server and
   * the first client render, `mounted` is `false` and we
   * render the desktop layout. That matches the server HTML
   * and lets hydration complete. Immediately after the first
   * commit, `mounted` flips to `true` and the correct layout
   * for the current viewport is rendered.
   *
   * The alternative — branching on `useMediaQuery` directly —
   * produced a different tree on server and client, which
   * cascaded into `useId` mismatches in descendants and a
   * hydration error. This pattern is the standard fix.
   */
  const mounted = useMounted();

  const isMobile = useMediaQuery(MOBILE_QUERY);

  useEffect(() => {
    const local = resolveLocalLocation();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferred until after hydration to match the server-rendered HTML
    if (local) setClockLocation(local);
  }, []);

  useEffect(() => {
    document.title = clockLocation
      ? `${clockLocation.city} — ${DEFAULT_TITLE}`
      : DEFAULT_TITLE;
  }, [clockLocation]);

  const handleLocationSelect = useCallback(
    (location: WorldLocation): void => {
      setSelectedLocationId(location.id);
      setClockLocation(location);
    },
    [],
  );

  const layoutProps: LayoutProps = useMemo(
    () => ({
      selectedLocationId,
      clockLocation,
      onLocationSelect: handleLocationSelect,
      solarState,
      onSolarChange: setSolarState,
    }),
    [
      selectedLocationId,
      clockLocation,
      handleLocationSelect,
      solarState,
    ],
  );

  return (
    <>
      {/*
       * <main> is the page shell.
       *
       * On mobile it is locked to exactly one visible screen
       * (`h-dvh` + `overflow-hidden`). The header (76px + 1px
       * border) and the content area (`100dvh - 76px`) add up
       * to slightly more than one screen, and the old
       * `min-h-screen` (100vh, the *large* viewport) was taller
       * than the visible area while the browser's address bar
       * was showing. Together those let the page scroll and
       * exposed a strip of the main background. From `md` up
       * the page stacks the globe and clock sections and
       * scrolls normally.
       * CitiesSection must NOT live
       * inside it: the drawer sets `inert` on the first <main>
       * in the document while it is open, which would disable
       * the drawer itself (its own ancestor) and make every
       * button and the scroll area unresponsive.
       */}
      <main
        className="
          flex h-dvh flex-col overflow-hidden bg-(--background) text-(--foreground)
          md:block md:h-auto md:min-h-dvh md:overflow-visible
        "
      >
        <DayNightFavicon location={clockLocation} />

        <Header
          mobileView={mobileView}
          onMobileViewChange={setMobileView}
        />

        {!mounted || !isMobile ? (
          <DesktopLayout {...layoutProps} />
        ) : (
          <MobileLayout view={mobileView} {...layoutProps} />
        )}
      </main>

      <CitiesSection
        selectedLocationId={selectedLocationId}
        onLocationSelect={handleLocationSelect}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop layout                                                             */
/* -------------------------------------------------------------------------- */

export function DesktopLayout({
  selectedLocationId,
  clockLocation,
  onLocationSelect,
  solarState,
  onSolarChange,
}: LayoutProps) {
  return (
    <>
      <section
        id="explore"
        className="relative w-full scroll-mt-[76px] overflow-hidden"
        style={{ height: CONTENT_HEIGHT }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <GlobeAtmosphere solarState={solarState} />
        </div>

        <div className="relative h-full w-full">
          <Globe
            selectedLocationId={selectedLocationId}
            onLocationSelect={onLocationSelect}
            solarState={solarState}
            onSolarChange={onSolarChange}
          />
        </div>
      </section>

      {/*
       * `minHeight`, not `height`: the Time Zones section is at
       * least as tall as the globe section, so the two read as
       * equal on any normal viewport, but it can still grow if
       * the content needs more room (short landscape windows,
       * large text sizes). Nothing is ever clipped.
       *
       * The wrapper is a flex column so `WorldClockSection`
       * (which is `flex-1`) stretches to fill it and centres its
       * own content vertically.
       */}
      <div
        className="flex w-full flex-col"
        style={{ height: CONTENT_HEIGHT }}
      >
        <WorldClockSection
          location={clockLocation}
          onLocationSelect={onLocationSelect}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile layout                                                              */
/* -------------------------------------------------------------------------- */

export interface MobileLayoutProps extends LayoutProps {
  view: MobileView;
}

export function MobileLayout({
  view,
  selectedLocationId,
  clockLocation,
  onLocationSelect,
  solarState,
  onSolarChange,
}: MobileLayoutProps) {
  if (view === "zones") {
    return (
      <div
        className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain"
        aria-label="World clocks"
      >
        <WorldClockSection
          location={clockLocation}
          onLocationSelect={onLocationSelect}
        />
      </div>
    );
  }

  return (
    <section
      id="explore"
      className="relative flex min-h-0 w-full flex-1 justify-center overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <GlobeAtmosphere solarState={solarState} />
      </div>

      <div className="relative h-full w-full">
        <Globe
          selectedLocationId={selectedLocationId}
          onLocationSelect={onLocationSelect}
          solarState={solarState}
          onSolarChange={onSolarChange}
        />
      </div>
    </section>
  );
}