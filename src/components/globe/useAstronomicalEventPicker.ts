"use client";

/**
 * State machine for the astronomical event picker.
 *
 * Encapsulates everything the picker needs to know that isn't
 * rendering: what events are available, which one is currently
 * active, what happens when the user picks one, and how the
 * time override interacts with the camera travel API.
 *
 * Extracted from the component so it can be tested without
 * rendering a dropdown — and so the interaction between two
 * asynchronous operations (setting the time override, then
 * animating the camera) has exactly one home.
 *
 * ## What "picking an event" actually does
 *
 * A pick is a two-step operation:
 *
 *   1. **Set the time override** to the event's instant. This
 *      is synchronous — a single call to `setTimeOverride`.
 *      Every clock, every row, every atmosphere in the app
 *      responds on the next render.
 *
 *   2. **Move the camera** to the event's location, if the
 *      event has one. Solstices and equinoxes don't (they're
 *      global moments, not places); sunrises, sunsets, and
 *      solar noons are city-scoped and do have a location.
 *
 * The order matters: setting the override **before** starting
 * the camera travel means the atmosphere behind the globe is
 * already correct for the new instant by the time the
 * animation finishes.
 *
 * ## Availability
 *
 * The picker offers seven presets. Three of them are
 * **city-scoped** — sunrise, sunset, and solar noon at the
 * currently selected location — and are unavailable when no
 * city is selected. Availability is computed once per render
 * from `selectedLocation` and `now` and returned as data. The
 * component renders disabled buttons; the hook does not
 * hide them.
 *
 * ## Sunrise and sunset can legitimately return `null`
 *
 * Above the Arctic and Antarctic circles, the sun may not
 * rise or set for weeks or months. `lib/solar-events.ts`
 * returns `null` in that case rather than a garbage
 * timestamp. When a city is selected and its sunrise or
 * sunset is null, the corresponding preset is marked
 * unavailable with a specific reason rather than the generic
 * "select a city first".
 *
 * ## Active-event identification
 *
 * The active preset is identified by storing the preset ID
 * at activation time, then *verifying* on read that the
 * override value still matches the timestamp that preset
 * produces. If they diverge — because another module set the
 * override directly, or because the preset's calculation is
 * no longer valid — the hook reports no active preset rather
 * than a stale one.
 *
 * ## Determinism
 *
 * Every function this hook calls — `getNextSolstice`,
 * `findSunrise`, `setTimeOverride` — is pure or has
 * well-defined side effects. Nothing reads `Date.now()`
 * except `getEffectiveNow()`, and nothing mutates shared
 * state except `setTimeOverride` / `clearTimeOverride`,
 * which are documented to notify subscribers synchronously.
 */

import {
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { WorldLocation } from "@/lib/locations";
import {
  findSolarNoon,
  findSunrise,
  findSunset,
  getNextEquinox,
  getNextSolstice,
} from "@/lib/solar-events";
import {
  clearTimeOverride,
  getEffectiveNow,
  getTimeOverride,
  setTimeOverride,
  subscribeToTimeOverride,
} from "@/lib/time-override";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The identifier of a preset. A closed union so the component
 * can switch on it exhaustively and so a typo in a dispatch
 * call site is a compile error.
 */
export type AstronomicalEventId =
  | "now"
  | "next-solstice"
  | "next-equinox"
  | "subsolar-now"
  | "sunrise"
  | "sunset"
  | "solar-noon";

/**
 * A preset, as returned by the hook.
 *
 * `available` distinguishes "shown in the list" from
 * "clickable right now". A preset is always returned; the
 * caller renders it and disables it when `!available`.
 *
 * `unavailableReason` is set when `available` is false. It is
 * phrased for a user — "Select a city first", "The sun does
 * not rise there today" — not for a developer.
 */
export interface AstronomicalEventOption {
  readonly id: AstronomicalEventId;
  readonly label: string;
  readonly description: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
}

/**
 * What the hook returns to its consumer.
 */
export interface AstronomicalEventPickerApi {
  readonly events: readonly AstronomicalEventOption[];
  readonly activeEventId: AstronomicalEventId | null;
  readonly dispatch: (id: AstronomicalEventId) => void;
}

/**
 * The dependencies the hook needs from its caller.
 *
 * `selectedLocation` is the currently selected city, or `null`.
 * `onTravelTo` is the camera animation API — the hook calls it
 * when a city-scoped event should move the globe.
 */
export interface UseAstronomicalEventPickerOptions {
  readonly selectedLocation: WorldLocation | null;
  readonly onTravelTo: (location: WorldLocation) => void;

  /**
   * The instant to compute "the next X from" against.
   * Defaults to the app's effective now.
   */
  readonly now?: number;
}

/**
 * The result of attempting to activate a preset.
 *
 * `activated` is `true` when the override was changed (or
 * cleared) as a result. `reason` is set when it was not.
 */
export interface ActivationResult {
  readonly activated: boolean;
  readonly reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Preset definitions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Static preset metadata. The label and description never
 * change; only availability does.
 */
const STATIC_PRESETS: readonly {
  readonly id: AstronomicalEventId;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    id: "now",
    label: "Right now",
    description: "Return to live time",
  },
  {
    id: "next-solstice",
    label: "Next solstice",
    description: "The next June or December solstice",
  },
  {
    id: "next-equinox",
    label: "Next equinox",
    description: "The next March or September equinox",
  },
  {
    id: "subsolar-now",
    label: "Show the sun's current location",
    description: "Point the camera at the subsolar point",
  },
  {
    id: "sunrise",
    label: "Sunrise",
    description: "Next sunrise at the selected city",
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Next sunset at the selected city",
  },
  {
    id: "solar-noon",
    label: "Solar noon",
    description: "Next local noon at the selected city",
  },
];

/* -------------------------------------------------------------------------- */
/* Active-event tracking                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The last preset that produced the current override, or
 * `null`.
 *
 * ## Verified on read
 *
 * The ID is stored at activation time, but it is not trusted
 * blindly. `verifyActiveEventId` re-computes what the stored
 * ID would produce right now and checks that it matches the
 * current override. If the two diverge the hook reports no
 * active preset rather than a stale one.
 */
let activeEventIdRef: AstronomicalEventId | null = null;

/* -------------------------------------------------------------------------- */
/* Availability computation                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The day-of-year for a given epoch milliseconds, in UTC.
 *
 * Used as the memo key for sunrise/sunset availability. The
 * calculation is deterministic per (latitude, longitude,
 * day), so two calls within the same UTC day reuse the same
 * answer.
 */
function dayKey(nowMs: number): number {
  return Math.floor(nowMs / MS_PER_DAY);
}

/**
 * Compute availability for a single preset.
 *
 * The "now" preset is always available. The seasonal events
 * are always available. The subsolar-now preset is always
 * available. The three city-scoped presets require a
 * selected city and, for sunrise and sunset, a non-null
 * result from the calculation.
 */
function evaluatePreset(
  preset: (typeof STATIC_PRESETS)[number],
  selectedLocation: WorldLocation | null,
  now: number,
): AstronomicalEventOption {
  /* The reset action is always available, even mid-override. */
  if (preset.id === "now") {
    return {
      ...preset,
      available: true,
      unavailableReason: null,
    };
  }

  /* Seasonal and subsolar presets are global. */
  if (
    preset.id === "next-solstice" ||
    preset.id === "next-equinox" ||
    preset.id === "subsolar-now"
  ) {
    return {
      ...preset,
      available: true,
      unavailableReason: null,
    };
  }

  /* From here down, the preset is city-scoped. */
  if (!selectedLocation) {
    return {
      ...preset,
      available: false,
      unavailableReason: "Select a city first",
    };
  }

  const { latitude, longitude } = selectedLocation;

  if (preset.id === "sunrise") {
    const sunrise = findSunrise(
      latitude,
      longitude,
      new Date(now),
    );
    return sunrise === null
      ? {
          ...preset,
          available: false,
          unavailableReason: `The sun does not rise in ${selectedLocation.city} today`,
        }
      : { ...preset, available: true, unavailableReason: null };
  }

  if (preset.id === "sunset") {
    const sunset = findSunset(
      latitude,
      longitude,
      new Date(now),
    );
    return sunset === null
      ? {
          ...preset,
          available: false,
          unavailableReason: `The sun does not set in ${selectedLocation.city} today`,
        }
      : { ...preset, available: true, unavailableReason: null };
  }

  /*
   * `solar-noon` never returns null — the sun always has a
   * highest point, even in polar day or polar night.
   */
  return { ...preset, available: true, unavailableReason: null };
}

/**
 * Build the full list of presets with availability computed.
 *
 * Pure. Exported for testing.
 */
export function buildEventOptions(
  selectedLocation: WorldLocation | null,
  now: number,
): readonly AstronomicalEventOption[] {
  return STATIC_PRESETS.map((preset) =>
    evaluatePreset(preset, selectedLocation, now),
  );
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Verify that a stored active-event ID still matches the
 * current override.
 *
 * Returns the ID when it does, or `null` when it does not.
 */
function verifyActiveEventId(
  id: AstronomicalEventId,
  selectedLocation: WorldLocation | null,
  now: number,
): AstronomicalEventId | null {
  const override = getTimeOverride();

  if (id === "now" || id === "subsolar-now") {
    return override === null ? id : null;
  }

  if (override === null) return null;

  if (id === "next-solstice") {
    const next = getNextSolstice(new Date(now)).getTime();
    return next === override ? id : null;
  }

  if (id === "next-equinox") {
    const next = getNextEquinox(new Date(now)).getTime();
    return next === override ? id : null;
  }

  if (!selectedLocation) return null;

  const { latitude, longitude } = selectedLocation;

  if (id === "sunrise") {
    const sunrise = findSunrise(
      latitude,
      longitude,
      new Date(now),
    );
    return sunrise?.getTime() === override ? id : null;
  }

  if (id === "sunset") {
    const sunset = findSunset(
      latitude,
      longitude,
      new Date(now),
    );
    return sunset?.getTime() === override ? id : null;
  }

  if (id === "solar-noon") {
    const noon = findSolarNoon(
      latitude,
      longitude,
      new Date(now),
    );
    return noon.getTime() === override ? id : null;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useAstronomicalEventPicker(
  options: UseAstronomicalEventPickerOptions,
): AstronomicalEventPickerApi {
  const {
    selectedLocation,
    onTravelTo,
    now = getEffectiveNow(),
  } = options;

  const activeOverride = useSyncExternalStore(
    subscribeToTimeOverride,
    getTimeOverride,
    () => null,
  );

  const activeEventId = useMemo(() => {
    if (activeOverride === null) return null;
    if (activeEventIdRef === null) return null;

    return verifyActiveEventId(
      activeEventIdRef,
      selectedLocation,
      now,
    );
  }, [activeOverride, selectedLocation, now]);

  const day = dayKey(now);

  const events = useMemo<readonly AstronomicalEventOption[]>(
    () => buildEventOptions(selectedLocation, now),
    // `now` is deliberately not a dependency — the day key
    // is what matters for sunrise/sunset availability, and
    // using `now` directly would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedLocation, day],
  );

  const dispatch = useCallback(
    (id: AstronomicalEventId) => {
      activatePreset({
        id,
        selectedLocation,
        now,
        onTravelTo,
      });
    },
    [selectedLocation, now, onTravelTo],
  );

  return { events, activeEventId, dispatch };
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Apply a preset.
 *
 * Sets the time override to the preset's instant and, for
 * city-scoped presets, moves the camera to the city.
 *
 * ## Why the override is set before the camera moves
 *
 * Setting the override is synchronous and instant. Moving the
 * camera is asynchronous and takes ~1 second.
 *
 * ## Return value
 *
 * Returns `{ activated: true }` when the override was
 * changed (or cleared) as a result. Returns `{ activated:
 * false, reason }` when the call was a no-op.
 *
 * Exported for testing.
 */
export function activatePreset(options: {
  readonly id: AstronomicalEventId;
  readonly selectedLocation: WorldLocation | null;
  readonly now: number;
  readonly onTravelTo: (location: WorldLocation) => void;
}): ActivationResult {
  const { id, selectedLocation, now, onTravelTo } = options;

  /* ------------ Reset to live time --------------------------------- */

  if (id === "now") {
    activeEventIdRef = null;
    clearTimeOverride();
    return { activated: true };
  }

  /* ------------ Seasonal events ----------------------------------- */

  if (id === "next-solstice") {
    const solstice = getNextSolstice(new Date(now));
    activeEventIdRef = id;
    setTimeOverride(solstice.getTime());
    return { activated: true };
  }

  if (id === "next-equinox") {
    const equinox = getNextEquinox(new Date(now));
    activeEventIdRef = id;
    setTimeOverride(equinox.getTime());
    return { activated: true };
  }

  /* ------------ Sun's current location ----------------------------- */

  if (id === "subsolar-now") {
    activeEventIdRef = null;
    clearTimeOverride();

    if (selectedLocation) {
      onTravelTo(selectedLocation);
    }
    return { activated: true };
  }

  /* ------------ City-scoped events -------------------------------- */

  if (!selectedLocation) {
    return {
      activated: false,
      reason: "Select a city first",
    };
  }

  const { latitude, longitude } = selectedLocation;

  if (id === "sunrise") {
    const sunrise = findSunrise(
      latitude,
      longitude,
      new Date(now),
    );

    if (sunrise === null) {
      return {
        activated: false,
        reason: `The sun does not rise in ${selectedLocation.city} today`,
      };
    }

    activeEventIdRef = id;
    setTimeOverride(sunrise.getTime());
    onTravelTo(selectedLocation);
    return { activated: true };
  }

  if (id === "sunset") {
    const sunset = findSunset(
      latitude,
      longitude,
      new Date(now),
    );

    if (sunset === null) {
      return {
        activated: false,
        reason: `The sun does not set in ${selectedLocation.city} today`,
      };
    }

    activeEventIdRef = id;
    setTimeOverride(sunset.getTime());
    onTravelTo(selectedLocation);
    return { activated: true };
  }

  if (id === "solar-noon") {
    const noon = findSolarNoon(
      latitude,
      longitude,
      new Date(now),
    );

    activeEventIdRef = id;
    setTimeOverride(noon.getTime());
    onTravelTo(selectedLocation);
    return { activated: true };
  }

  return { activated: false };
}

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reset the module-level active-event ID.
 *
 * Test-only. Must be called alongside `resetTimeOverride` in
 * an `afterEach`, or the next test will see a stale active ID
 * that does not match its own override state.
 */
export function resetActiveEventId(): void {
  activeEventIdRef = null;
}