"use client";

import dynamic from "next/dynamic";
import { Compass } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { Atmosphere } from "@/lib/atmosphere";
import {
  getLocationsByGlobeTier,
  type GlobeTier,
  type WorldLocation,
} from "@/lib/locations";
import { logDebug } from "@/lib/logger";
import { useVisualMode } from "@/lib/useVisualMode";
import type { SolarState } from "@/lib/useSolarState";

import AstronomicalEventPicker from "./globe/AstronomicalEventPicker";
import GlobeCanvasBoundary from "./globe/GlobeCanvasBoundary";
import GlobeSizeToggle from "./globe/GlobeSizeToggle";
import TimeOverrideBanner from "./globe/TimeOverrideBanner";
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  CAMERA_DISTANCE_STEPS,
  DESKTOP_INITIAL_CAMERA_STEP_INDEX,
  MAX_CAMERA_STEP_INDEX,
  MIN_CAMERA_STEP_INDEX,
  MOBILE_BREAKPOINT_PX,
  MOBILE_INITIAL_CAMERA_STEP_INDEX,
  getCameraDistanceForStep,
  getCameraDistanceLabel,
} from "./globe/constants";
import {
  globeAtmosphereRef,
  SAMPLE_INTERVAL_MS,
} from "./globe/globeAtmosphereContext";
import { useAstronomicalEventPicker } from "./globe/useAstronomicalEventPicker";
import VisualModeToggle, {
  VISUAL_MODES,
} from "./globe/VisualModeToggle";
import SearchableLocationInput from "./search/SearchableLocationInput";

/* -------------------------------------------------------------------------- */
/* Dynamic canvas                                                             */
/* -------------------------------------------------------------------------- */

const GlobeCanvas = dynamic(
  () => import("./GlobeCanvas"),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden="true" className="absolute inset-0" />
    ),
  },
);

/* -------------------------------------------------------------------------- */
/* Tier modes                                                                 */
/* -------------------------------------------------------------------------- */

interface GlobeMode {
  readonly value: GlobeTier;
  readonly label: string;
  readonly shortLabel: string;
}

/**
 * The two globe display tiers, in render order.
 *
 * The order matters for the radiogroup keyboard handler:
 * `ArrowRight` advances to the next entry, `ArrowLeft` retreats
 * to the previous. Reordering this array reorders the arrow
 * navigation.
 */
const GLOBE_MODES: readonly GlobeMode[] = [
  {
    value: "major",
    label: "Major Cities",
    shortLabel: "Major",
  },
  {
    value: "all",
    label: "All Cities",
    shortLabel: "All",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Breakpoint media query                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The mobile breakpoint query as a module-level constant so
 * the `useSyncExternalStore` subscribe/snapshot callbacks
 * below can be stable across renders.
 */
const MOBILE_MEDIA_QUERY = `(max-width: ${
  MOBILE_BREAKPOINT_PX - 1
}px)`;

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

function subscribeMobile(
  onChange: () => void,
): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getMobileSnapshot(): boolean {
  if (!hasMatchMedia()) return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getMobileServerSnapshot(): boolean {
  return false;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface GlobeProps {
  selectedLocationId: string | null;
  onLocationSelect: (location: WorldLocation) => void;
  solarState: SolarState | null;
  onSolarChange: (solarState: SolarState) => void;

  /**
   * Called whenever the visible hemisphere's sampled atmosphere
   * changes.
   *
   * The parent forwards this to `GlobeAtmosphere` to drive the
   * background crossfade. Optional so the component still works
   * if a caller does not care about the atmosphere — e.g. in
   * older tests.
   *
   * The argument is `Atmosphere | null`:
   *
   *   - **A real `Atmosphere`** — the sampler has produced a
   *     value, and it has changed since the last call.
   *
   *   - **`null`** — reserved for a future consumer that wants
   *     to observe the "back to no sample" transition. Today
   *     the poller does *not* call `onAtmosphereChange(null)`:
   *     the ref's initial value is `null` ("no sample yet"),
   *     and the poller skips the callback in that state rather
   *     than publishing a spurious first-value. The type is
   *     widened anyway so a consumer can rely on the union
   *     without a cast if a future change ever wants to emit
   *     `null` — for instance, if the sampler were reset on a
   *     scene remount.
   */
  onAtmosphereChange?: (atmosphere: Atmosphere | null) => void;
}

export default function Globe({
  selectedLocationId,
  onLocationSelect,
  solarState,
  onSolarChange,
  onAtmosphereChange,
}: GlobeProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [globeTier, setGlobeTier] = useState<GlobeTier>("major");

  /*
   * The camera-distance step index. `null` until the mount
   * effect picks the desktop or mobile initial index.
   *
   * `null` is meaningful here: `effectiveStepIndex` below
   * substitutes the desktop default, so a render before the
   * effect fires still produces a valid camera distance. The
   * effect then replaces the placeholder with the
   * breakpoint-specific value.
   */
  const [cameraStepIndex, setCameraStepIndex] = useState<
    number | null
  >(null);

  const { visualMode, setVisualMode } = useVisualMode();

  const tierButtonRefs = useRef<
    Array<HTMLButtonElement | null>
  >([]);

  const visualModeButtonRefs = useRef<
    Array<HTMLButtonElement | null>
  >([]);

  /*
   * The imperative `resetNorth` handle published by
   * `GlobeScene`. Stored in a ref because updating it does not
   * need to trigger a render — the compass button reads it at
   * click time.
   */
  const resetNorthRef = useRef<(() => void) | null>(null);

  const visibleLocations = useMemo(
    () => getLocationsByGlobeTier(globeTier),
    [globeTier],
  );

  /*
   * The selected location, resolved against the *visible*
   * tier. A selection made while `all` is active disappears
   * when the user switches back to `major` if the location is
   * not in the major tier — that is intentional, and the same
   * logic that `SearchableLocationInput` uses to decide
   * whether to show a checkmark.
   */
  const selectedLocation = useMemo(() => {
    if (selectedLocationId === null) return null;

    return (
      visibleLocations.find(
        (location) => location.id === selectedLocationId,
      ) ?? null
    );
  }, [visibleLocations, selectedLocationId]);

  /* ---------------------------------------------------------------------- */
  /* Initial camera step                                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * Whether the viewport is currently below the mobile
   * breakpoint. Read via `useSyncExternalStore` rather than a
   * mount-only effect so the value is available on the first
   * client render (matching the server's `false`) and updates
   * if the user resizes across the breakpoint.
   */
  const isMobileViewport = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );

  /*
   * On the first client render where the viewport is known,
   * seed the camera step index from the breakpoint. `null`
   * means "not yet seeded"; `effectiveStepIndex` below
   * substitutes the desktop default in that state.
   *
   * This is a render-time adjustment (React's documented
   * "storing information from previous renders" pattern), not
   * an effect: it fires synchronously in the same render pass
   * that observes the breakpoint, and React re-renders
   * immediately with the new state — no cascading commit.
   */
  if (cameraStepIndex === null) {
    setCameraStepIndex(
      isMobileViewport
        ? MOBILE_INITIAL_CAMERA_STEP_INDEX
        : DESKTOP_INITIAL_CAMERA_STEP_INDEX,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Zoom in on selection                                                   */
  /* ---------------------------------------------------------------------- */

  /*
   * The arrival card only renders once the camera is inside
   * `ARRIVAL_DISTANCE_THRESHOLD`. Selecting a city rotates the
   * globe but does not move the camera, so at the default
   * distance (3.6 > 3.2) the card would never appear. When the
   * selection changes, step the camera in to the farthest
   * ladder step that satisfies the threshold. If the camera is
   * already close enough, leave it alone. This runs only on
   * selection change, so the user can still zoom out
   * afterwards.
   *
   * Implemented as a render-time adjustment keyed off the
   * previous selection id, mirroring React's "storing
   * information from previous renders" pattern rather than a
   * `setState`-in-effect, which would produce a cascading
   * render.
   */
  const [
    prevSelectedLocationId,
    setPrevSelectedLocationId,
  ] = useState<string | null>(selectedLocationId);

  if (selectedLocationId !== prevSelectedLocationId) {
    setPrevSelectedLocationId(selectedLocationId);

    if (selectedLocationId !== null) {
      setCameraStepIndex((current) => {
        const base =
          current ?? DESKTOP_INITIAL_CAMERA_STEP_INDEX;

        if (
          getCameraDistanceForStep(base) <=
          ARRIVAL_DISTANCE_THRESHOLD
        ) {
          return base;
        }

        for (let i = base - 1; i >= MIN_CAMERA_STEP_INDEX; i--) {
          if (
            getCameraDistanceForStep(i) <=
            ARRIVAL_DISTANCE_THRESHOLD
          ) {
            return i;
          }
        }

        return MIN_CAMERA_STEP_INDEX;
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Reduced motion                                                         */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const mql = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const update = (): void => {
      setReducedMotion(mql.matches);
    };

    update();
    mql.addEventListener("change", update);

    return () => {
      mql.removeEventListener("change", update);
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Sampled atmosphere polling                                             */
  /* ---------------------------------------------------------------------- */

  /*
   * Poll the shared `globeAtmosphereRef` at `SAMPLE_INTERVAL_MS`.
   *
   * The ref is written by `GlobeAtmosphereSampler` inside the
   * canvas; it is intentionally not reactive. A short-interval
   * poll here is the bridge between the two React trees —
   * R3F's reconciler on one side, `page.tsx` on the other.
   *
   * The interval is imported from the same module that exports
   * it for the sampler, so a future retuning of one cannot
   * drift out of sync with the other.
   *
   * `useNow(SAMPLE_INTERVAL_MS)` would give us a visibility
   * pause for free, but the shared ticker emits the current
   * epoch time, not a "tick happened" signal — we'd have to
   * thread it through a `useEffect` and a state update just to
   * read the ref on each tick. A raw `setInterval` is simpler
   * here and the sampler inside the canvas pauses on its own
   * when the tab is hidden, so a backgrounded tab produces no
   * new values to poll anyway.
   *
   * We only fire the callback when the value actually changes,
   * so a stationary globe does not spam the parent with
   * identical renders. The ref's `null` state — "no sample
   * yet" — is treated as *no value to report*: the callback is
   * skipped rather than called with `null`. See the
   * `onAtmosphereChange` prop's docstring for why.
   */
  const lastReportedAtmosphereRef = useRef<Atmosphere | null>(
    null,
  );

  useEffect(() => {
    if (!onAtmosphereChange) return;

    const tick = (): void => {
      const next = globeAtmosphereRef.current;

      /*
       * No sample yet. Do not publish — the ref's `null` is
       * an initialization sentinel, not a value the parent
       * should react to.
       */
      if (next === null) return;

      if (next !== lastReportedAtmosphereRef.current) {
        lastReportedAtmosphereRef.current = next;
        onAtmosphereChange(next);
      }
    };

    /* Report the current value immediately on mount. */
    tick();

    const id = window.setInterval(tick, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [onAtmosphereChange]);

  /* ---------------------------------------------------------------------- */
  /* Solar debug logging                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!solarState) return;

    /*
     * The debug log allocates a fresh object and four strings
     * on every solar-state change (≈4 Hz). `logDebug` drops
     * the message before printing when the resolved level is
     * above `debug`, but the argument object is constructed at
     * the call site and therefore allocated regardless. Gating
     * the whole call on the build environment skips that
     * allocation in production entirely.
     */
    if (process.env.NODE_ENV === "production") return;

    logDebug("solar", {
      atmosphere: solarState.dominantAtmosphere,
      elevation:
        solarState.averageSolarElevation.toFixed(1),
      daylight:
        (solarState.daylightFraction * 100).toFixed(0) + "%",
      sun: solarState.subsolarScreenPosition
        ? `${(
            solarState.subsolarScreenPosition.x * 100
          ).toFixed(0)}%, ${(
            solarState.subsolarScreenPosition.y * 100
          ).toFixed(0)}%`
        : "behind globe",
    });
  }, [solarState]);

  /* ---------------------------------------------------------------------- */
  /* Astronomical event picker                                              */
  /* ---------------------------------------------------------------------- */

  /*
   * The picker's state machine lives in a hook so its behavior
   * is testable without rendering the globe. The hook exposes
   * the list of available events, the ID of the currently
   * active one, and a `dispatch` function that activates a
   * preset.
   *
   * `onTravelTo` is the same callback the search field uses for
   * its own selections — a city-scoped preset (sunrise, sunset,
   * solar noon) needs to move the camera, and it moves it
   * through the same path a search selection would take.
   */
  const picker = useAstronomicalEventPicker({
    selectedLocation,
    onTravelTo: onLocationSelect,
  });

  /*
   * The label of the currently active preset, or `null` when
   * live time is in effect. Looked up from the picker's own
   * `events` array so the mapping from ID to human string
   * lives in exactly one place — the hook, which already owns
   * that mapping for the dropdown. Duplicating it here would
   * create a second source of truth for labels.
   */
  const activeEventLabel = useMemo(() => {
    if (picker.activeEventId === null) return null;

    const match = picker.events.find(
      (event) => event.id === picker.activeEventId,
    );

    return match?.label ?? null;
  }, [picker.activeEventId, picker.events]);

  /* ---------------------------------------------------------------------- */
  /* Radiogroup keyboard navigation                                         */
  /* ---------------------------------------------------------------------- */

  const handleTierKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = GLOBE_MODES.findIndex(
        (mode) => mode.value === globeTier,
      );
      if (currentIndex < 0) return;

      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex =
            (currentIndex + 1) % GLOBE_MODES.length;
          break;

        case "ArrowLeft":
        case "ArrowUp":
          nextIndex =
            (currentIndex - 1 + GLOBE_MODES.length) %
            GLOBE_MODES.length;
          break;

        case "Home":
          nextIndex = 0;
          break;

        case "End":
          nextIndex = GLOBE_MODES.length - 1;
          break;

        default:
          return;
      }

      event.preventDefault();

      const nextMode = GLOBE_MODES[nextIndex];
      if (!nextMode) return;

      setGlobeTier(nextMode.value);

      requestAnimationFrame(() => {
        tierButtonRefs.current[nextIndex]?.focus();
      });
    },
    [globeTier],
  );

  const handleVisualModeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = VISUAL_MODES.findIndex(
        (mode) => mode.value === visualMode,
      );
      if (currentIndex < 0) return;

      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex =
            (currentIndex + 1) % VISUAL_MODES.length;
          break;

        case "ArrowLeft":
        case "ArrowUp":
          nextIndex =
            (currentIndex - 1 + VISUAL_MODES.length) %
            VISUAL_MODES.length;
          break;

        case "Home":
          nextIndex = 0;
          break;

        case "End":
          nextIndex = VISUAL_MODES.length - 1;
          break;

        default:
          return;
      }

      event.preventDefault();

      const nextMode = VISUAL_MODES[nextIndex];
      if (!nextMode) return;

      setVisualMode(nextMode.value);

      requestAnimationFrame(() => {
        visualModeButtonRefs.current[nextIndex]?.focus();
      });
    },
    [visualMode, setVisualMode],
  );

  /* ---------------------------------------------------------------------- */
  /* Camera-distance stepper                                                */
  /* ---------------------------------------------------------------------- */

  /*
   * The zoom handlers use functional updates and empty
   * dependency arrays.
   *
   * The functional form is load-bearing: it reads the current
   * `cameraStepIndex` at update time rather than closing over
   * a stale value. If the handlers closed over the current
   * state directly, two rapid clicks before React commits
   * would collapse into a single step — the classic
   * stale-closure bug. The empty dependency array is correct
   * because the handler body has no external reads.
   */
  const handleZoomIn = useCallback(() => {
    setCameraStepIndex((current) => {
      const base =
        current ?? DESKTOP_INITIAL_CAMERA_STEP_INDEX;
      return Math.max(base - 1, MIN_CAMERA_STEP_INDEX);
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setCameraStepIndex((current) => {
      const base =
        current ?? DESKTOP_INITIAL_CAMERA_STEP_INDEX;
      return Math.min(base + 1, MAX_CAMERA_STEP_INDEX);
    });
  }, []);

  /**
   * Wheel/pinch step dispatcher. `direction` comes from
   * `GlobeControls` — `-1` zooms in, `+1` zooms out.
   */
  const handleStepCamera = useCallback(
    (direction: -1 | 1) => {
      if (direction < 0) handleZoomIn();
      else handleZoomOut();
    },
    [handleZoomIn, handleZoomOut],
  );

  /* ---------------------------------------------------------------------- */
  /* Reset north                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * Stores the `resetNorth` callback published by `GlobeScene`.
   * `GlobeScene` fires this once with a stable function and once
   * with `null` on unmount.
   */
  const handleResetNorthReady = useCallback(
    (resetNorth: (() => void) | null) => {
      resetNorthRef.current = resetNorth;
    },
    [],
  );

  const handleResetNorthClick = useCallback(() => {
    resetNorthRef.current?.();
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Derived values                                                         */
  /* ---------------------------------------------------------------------- */

  /*
   * The placeholder used before the mount effect has chosen a
   * breakpoint-specific step. The desktop default is the
   * safer placeholder — on mobile it is immediately replaced,
   * and on desktop it is the correct value.
   */
  const effectiveStepIndex =
    cameraStepIndex ?? DESKTOP_INITIAL_CAMERA_STEP_INDEX;

  const cameraDistance = useMemo(
    () => getCameraDistanceForStep(effectiveStepIndex),
    [effectiveStepIndex],
  );

  /*
   * The region's accessible name describes the current zoom
   * level via `getCameraDistanceLabel`. That is what a screen
   * reader hears when the user tabs into the region, and it
   * updates as the zoom changes.
   */
  const regionLabel = useMemo(
    () =>
      `Interactive 3D world globe (${getCameraDistanceLabel(
        effectiveStepIndex,
      )})`,
    [effectiveStepIndex],
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div
      role="region"
      aria-label={regionLabel}
      className="
        relative
        h-full
        w-full
        overflow-hidden
      "
    >
      {/*
       * The canvas layer. `GlobeCanvasBoundary` catches errors
       * thrown by the dynamic import or by the R3F tree so a
       * WebGL initialization failure does not take down the
       * whole page.
       */}
      <div className="absolute inset-0">
        <GlobeCanvasBoundary>
          <GlobeCanvas
            reducedMotion={reducedMotion}
            selectedLocationId={selectedLocationId}
            globeTier={globeTier}
            visualMode={visualMode}
            cameraDistance={cameraDistance}
            onLocationSelect={onLocationSelect}
            onSolarChange={onSolarChange}
            onResetNorthReady={handleResetNorthReady}
            onStepCamera={handleStepCamera}
          />
        </GlobeCanvasBoundary>
      </div>

      {/*
       * The chrome bar. `pointer-events-none` on the outer
       * wrapper lets clicks pass through to the canvas in the
       * gaps between interactive controls, and each control
       * re-enables pointer events on itself.
       */}
      <div
        className="
          pointer-events-none
          absolute inset-x-0 top-0 z-30
          flex flex-row items-center justify-between gap-3
          px-3 py-3
          sm:px-4 sm:py-4
          lg:px-6 lg:py-6
        "
      >
        <div
          className="
            pointer-events-auto
            shrink-0
            w-auto
            max-w-[220px]
            sm:min-w-0
            sm:shrink
            sm:w-full
            sm:max-w-[260px]
            lg:max-w-[320px]
          "
        >
          <SearchableLocationInput
            selectedLocation={selectedLocation}
            onSelect={onLocationSelect}
            reducedMotion={reducedMotion}
            placeholder="Jump to a city"
            ariaLabel="Search for a city to select on the globe"
            fullWidth
            maxWidthClassName="max-w-none"
          />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div
            role="radiogroup"
            aria-label="Globe display mode"
            onKeyDown={handleTierKeyDown}
            className="
              flex w-fit shrink-0 items-center rounded-full
              border border-white/[0.09] bg-black/35 p-1
              shadow-[0_20px_60px_rgba(0,0,0,0.18)]
              backdrop-blur-xl
            "
          >
            {GLOBE_MODES.map((mode, index) => {
              const active = globeTier === mode.value;

              const count = active
                ? visibleLocations.length
                : null;

              return (
                <button
                  key={mode.value}
                  ref={(el) => {
                    tierButtonRefs.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setGlobeTier(mode.value)}
                  className={[
                    "shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-medium",
                    "tracking-[-0.01em] transition-all duration-300",
                    "sm:px-4 sm:py-2 sm:text-[11px]",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-white/40 focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-black/50",
                    active
                      ? "bg-white/[0.11] text-white shadow-[0_0_24px_rgba(255,255,255,0.05)]"
                      : "text-white/65 hover:bg-white/[0.045] hover:text-white/72",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-1 sm:gap-2">
                    <span className="sm:hidden">
                      {mode.shortLabel}
                    </span>
                    <span className="hidden sm:inline">
                      {mode.label}
                    </span>

                    {count !== null && (
                      <span
                        aria-hidden="true"
                        className="font-mono text-[8px] tabular-nums text-white/55"
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <VisualModeToggle
            value={visualMode}
            onChange={setVisualMode}
            onKeyDown={handleVisualModeKeyDown}
            optionRef={(index) => (el) => {
              visualModeButtonRefs.current[index] = el;
            }}
          />

          <AstronomicalEventPicker
            events={picker.events}
            activeEventId={picker.activeEventId}
            onSelect={picker.dispatch}
            reducedMotion={reducedMotion}
          />

          <button
            type="button"
            onClick={handleResetNorthClick}
            aria-label="Reset globe to north-up orientation"
            title="Reset north"
            className="
              flex size-9 shrink-0 items-center justify-center
              rounded-full border border-white/[0.14] bg-black/50
              text-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.32)]
              backdrop-blur-xl
              transition-colors duration-200
              hover:bg-white/[0.10] hover:text-white
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-white/50
              sm:size-10
            "
          >
            <Compass
              aria-hidden="true"
              className="size-4 sm:size-[18px]"
              strokeWidth={1.7}
            />
          </button>
        </div>
      </div>

      {/*
       * The zoom (+/-) control lives in its own bottom-right
       * wrapper, a sibling of the chrome bar. Same
       * `pointer-events-none` outer / `pointer-events-auto`
       * inner pattern as the chrome bar, so clicks in the
       * gaps still reach the canvas.
       */}
      <div
        className="
          pointer-events-none
          absolute bottom-4 right-3 z-30
          sm:bottom-6 sm:right-4
          lg:bottom-8 lg:right-6
        "
      >
        <div className="pointer-events-auto">
          <GlobeSizeToggle
            stepIndex={effectiveStepIndex}
            stepCount={CAMERA_DISTANCE_STEPS.length}
            onDecrement={handleZoomOut}
            onIncrement={handleZoomIn}
          />
        </div>
      </div>

      {/*
       * The time-override banner is a *sibling* of the chrome
       * bar, not a child, and this is load-bearing.
       *
       * The chrome bar has `pointer-events-none` on its outer
       * wrapper so clicks pass through to the canvas in the
       * gaps between controls. The banner contains an
       * interactive "back to now" button. If the banner lived
       * inside the chrome bar, its button would be unclickable
       * — the parent's `pointer-events-none` would swallow
       * every pointer event before it reached the button.
       *
       * As a sibling, the banner's own `pointer-events-auto`
       * wrapper (inside the banner component) is sufficient.
       * Do not "simplify" by moving this into the chrome div.
       */}
      <div
        className="
          pointer-events-none
          absolute inset-x-0 top-[68px] z-30
          flex justify-center px-3
          sm:top-[84px] sm:px-4
          lg:top-[100px] lg:px-6
        "
      >
        <TimeOverrideBanner
          label={activeEventLabel}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}