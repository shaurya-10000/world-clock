import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  WORLD_LOCATIONS,
  type WorldLocation,
} from "@/lib/locations";
import {
  getTimeOverride,
  resetTimeOverride,
} from "@/lib/time-override";
import {
  activatePreset,
  buildEventOptions,
  resetActiveEventId,
  useAstronomicalEventPicker,
  type AstronomicalEventId,
} from "@/components/globe/useAstronomicalEventPicker";

/* -------------------------------------------------------------------------- */
/* Solar-events mock                                                          */
/* -------------------------------------------------------------------------- */

type LatLngFrom = (
  latitude: number,
  longitude: number,
  from: Date,
) => Date | null;

type FromOnly = (from: Date) => Date;

const SOLSTICE_MS = Date.UTC(2025, 5, 20, 20, 42);
const EQUINOX_MS = Date.UTC(2025, 8, 22, 18, 19);
const SUNRISE_MS = Date.UTC(2025, 0, 15, 6, 30);
const SUNSET_MS = Date.UTC(2025, 0, 15, 17, 45);
const SOLAR_NOON_MS = Date.UTC(2025, 0, 15, 12, 0);

const mockFindSunrise = vi.fn<LatLngFrom>(
  () => new Date(SUNRISE_MS),
);
const mockFindSunset = vi.fn<LatLngFrom>(
  () => new Date(SUNSET_MS),
);
const mockFindSolarNoon = vi.fn<LatLngFrom>(
  () => new Date(SOLAR_NOON_MS),
);
const mockGetNextSolstice = vi.fn<FromOnly>(
  () => new Date(SOLSTICE_MS),
);
const mockGetNextEquinox = vi.fn<FromOnly>(
  () => new Date(EQUINOX_MS),
);

vi.mock("@/lib/solar-events", () => ({
  findSunrise: (
    latitude: number,
    longitude: number,
    from: Date,
  ) => mockFindSunrise(latitude, longitude, from),
  findSunset: (
    latitude: number,
    longitude: number,
    from: Date,
  ) => mockFindSunset(latitude, longitude, from),
  findSolarNoon: (
    latitude: number,
    longitude: number,
    from: Date,
  ) => mockFindSolarNoon(latitude, longitude, from),
  getNextSolstice: (from: Date) => mockGetNextSolstice(from),
  getNextEquinox: (from: Date) => mockGetNextEquinox(from),
}));

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const TOKYO: WorldLocation = WORLD_LOCATIONS.find(
  (loc) => loc.id === "tokyo",
)!;

const REFERENCE_NOW = Date.UTC(2025, 0, 15, 12, 0);

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.clearAllMocks();
  resetTimeOverride();
  resetActiveEventId();

  mockFindSunrise.mockReturnValue(new Date(SUNRISE_MS));
  mockFindSunset.mockReturnValue(new Date(SUNSET_MS));
  mockFindSolarNoon.mockReturnValue(new Date(SOLAR_NOON_MS));
  mockGetNextSolstice.mockReturnValue(new Date(SOLSTICE_MS));
  mockGetNextEquinox.mockReturnValue(new Date(EQUINOX_MS));
});

afterEach(() => {
  resetTimeOverride();
  resetActiveEventId();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* buildEventOptions — shape                                                  */
/* -------------------------------------------------------------------------- */

describe("buildEventOptions — shape", () => {
  it("returns one option per static preset", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    expect(options).toHaveLength(7);
  });

  it("returns options in the documented display order", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    expect(options.map((o) => o.id)).toEqual([
      "now",
      "next-solstice",
      "next-equinox",
      "subsolar-now",
      "sunrise",
      "sunset",
      "solar-noon",
    ]);
  });

  it("gives every option a non-empty label and description", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    for (const option of options) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it("is pure — two calls with identical inputs return equal values", () => {
    const a = buildEventOptions(null, REFERENCE_NOW);
    const b = buildEventOptions(null, REFERENCE_NOW);
    expect(a).toEqual(b);
  });
});

/* -------------------------------------------------------------------------- */
/* buildEventOptions — availability                                           */
/* -------------------------------------------------------------------------- */

describe("buildEventOptions — availability, no selection", () => {
  it("marks `now` available", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    expect(options.find((o) => o.id === "now")?.available).toBe(true);
  });

  it("marks global presets available without a selection", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    for (const id of [
      "next-solstice",
      "next-equinox",
      "subsolar-now",
    ] as const) {
      expect(options.find((o) => o.id === id)?.available).toBe(true);
    }
  });

  it("marks every city-scoped preset unavailable without a selection", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    for (const id of ["sunrise", "sunset", "solar-noon"] as const) {
      expect(options.find((o) => o.id === id)?.available).toBe(false);
    }
  });

  it("uses the same reason for every city-scoped unavailability", () => {
    const options = buildEventOptions(null, REFERENCE_NOW);
    for (const id of ["sunrise", "sunset", "solar-noon"] as const) {
      expect(
        options.find((o) => o.id === id)?.unavailableReason,
      ).toBe("Select a city first");
    }
  });

  it("sets unavailableReason to null on every available option", () => {
    const options = buildEventOptions(TOKYO, REFERENCE_NOW);
    for (const option of options) {
      if (option.available) {
        expect(option.unavailableReason).toBeNull();
      }
    }
  });
});

describe("buildEventOptions — availability, with selection", () => {
  it("marks sunrise available when the calculation succeeds", () => {
    const options = buildEventOptions(TOKYO, REFERENCE_NOW);
    expect(options.find((o) => o.id === "sunrise")?.available).toBe(
      true,
    );
  });

  it("marks sunset available when the calculation succeeds", () => {
    const options = buildEventOptions(TOKYO, REFERENCE_NOW);
    expect(options.find((o) => o.id === "sunset")?.available).toBe(
      true,
    );
  });

  it("marks solar-noon available unconditionally", () => {
    const options = buildEventOptions(TOKYO, REFERENCE_NOW);
    expect(
      options.find((o) => o.id === "solar-noon")?.available,
    ).toBe(true);
  });

  it("marks sunrise unavailable with a city-specific reason when null", () => {
    mockFindSunrise.mockReturnValueOnce(null);
    const options = buildEventOptions(TOKYO, REFERENCE_NOW);
    const sunrise = options.find((o) => o.id === "sunrise");
    expect(sunrise?.available).toBe(false);
    expect(sunrise?.unavailableReason).toBe(
      `The sun does not rise in ${TOKYO.city} today`,
    );
  });

  it("marks sunset unavailable with a city-specific reason when null", () => {
    mockFindSunset.mockReturnValueOnce(null);
    const options = buildEventOptions(TOKYO, REFERENCE_NOW);
    const sunset = options.find((o) => o.id === "sunset");
    expect(sunset?.available).toBe(false);
    expect(sunset?.unavailableReason).toBe(
      `The sun does not set in ${TOKYO.city} today`,
    );
  });

  it("passes the selected city's coordinates to the solar-event functions", () => {
    buildEventOptions(TOKYO, REFERENCE_NOW);

    expect(mockFindSunrise).toHaveBeenCalledWith(
      TOKYO.latitude,
      TOKYO.longitude,
      expect.any(Date),
    );
    expect(mockFindSunset).toHaveBeenCalledWith(
      TOKYO.latitude,
      TOKYO.longitude,
      expect.any(Date),
    );
  });

  it("passes the reference instant to the solar-event functions", () => {
    buildEventOptions(TOKYO, REFERENCE_NOW);
    expect(mockFindSunrise).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      new Date(REFERENCE_NOW),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* activatePreset — activation result                                         */
/* -------------------------------------------------------------------------- */

/*
 * The fix to `activatePreset` added a return value of type
 * `ActivationResult`, so a caller can distinguish a successful
 * activation from a no-op. The two tests below document that
 * contract. Every other `activatePreset` test in this file
 * asserts on side effects (the override value, the mock calls)
 * and is unaffected by the return type.
 */

describe("activatePreset — activation result", () => {
  it("returns { activated: true } when the override changes", () => {
    const result = activatePreset({
      id: "next-solstice",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(result).toEqual({ activated: true });
  });

  it("returns { activated: false, reason } for a city-scoped preset with no selection", () => {
    const result = activatePreset({
      id: "sunrise",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(result.activated).toBe(false);
    expect(result.reason).toBe("Select a city first");
  });

  it("returns { activated: false, reason } when the calculation returns null", () => {
    mockFindSunrise.mockReturnValueOnce(null);

    const result = activatePreset({
      id: "sunrise",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(result.activated).toBe(false);
    expect(result.reason).toBe(
      `The sun does not rise in ${TOKYO.city} today`,
    );
  });

  it("returns { activated: true } for `now` even when no override was active", () => {
    /*
     * `now` clears the override. Clearing an already-null
     * override is a no-op in `clearTimeOverride`, but the
     * `activatePreset` contract reports it as activated —
     * the user's intent was fulfilled.
     */
    const result = activatePreset({
      id: "now",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(result).toEqual({ activated: true });
  });
});

/* -------------------------------------------------------------------------- */
/* activatePreset — `now`                                                     */
/* -------------------------------------------------------------------------- */

describe("activatePreset — `now`", () => {
  it("clears any existing override", () => {
    activatePreset({
      id: "next-solstice",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });
    expect(getTimeOverride()).not.toBeNull();

    activatePreset({
      id: "now",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });
    expect(getTimeOverride()).toBeNull();
  });

  it("does not call onTravelTo", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "now",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).not.toHaveBeenCalled();
  });

  it("does not call any solar-event calculation", () => {
    activatePreset({
      id: "now",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });
    expect(mockGetNextSolstice).not.toHaveBeenCalled();
    expect(mockFindSunrise).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* activatePreset — seasonal events                                           */
/* -------------------------------------------------------------------------- */

describe("activatePreset — seasonal events", () => {
  it("sets the override to the next solstice's timestamp", () => {
    activatePreset({
      id: "next-solstice",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(mockGetNextSolstice).toHaveBeenCalledWith(
      new Date(REFERENCE_NOW),
    );
    expect(getTimeOverride()).toBe(SOLSTICE_MS);
  });

  it("sets the override to the next equinox's timestamp", () => {
    activatePreset({
      id: "next-equinox",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(mockGetNextEquinox).toHaveBeenCalledWith(
      new Date(REFERENCE_NOW),
    );
    expect(getTimeOverride()).toBe(EQUINOX_MS);
  });

  it("does not call onTravelTo — seasonal events are global", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "next-solstice",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* activatePreset — subsolar-now                                              */
/* -------------------------------------------------------------------------- */

describe("activatePreset — subsolar-now", () => {
  it("clears any existing override", () => {
    activatePreset({
      id: "next-solstice",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });
    expect(getTimeOverride()).not.toBeNull();

    activatePreset({
      id: "subsolar-now",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });
    expect(getTimeOverride()).toBeNull();
  });

  it("moves the camera to the selected city", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "subsolar-now",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).toHaveBeenCalledTimes(1);
    expect(onTravelTo).toHaveBeenCalledWith(TOKYO);
  });

  it("does nothing camera-side when no city is selected", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "subsolar-now",
      selectedLocation: null,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* activatePreset — city-scoped events                                        */
/* -------------------------------------------------------------------------- */

describe("activatePreset — city-scoped events, no selection", () => {
  const cityScoped: AstronomicalEventId[] = [
    "sunrise",
    "sunset",
    "solar-noon",
  ];

  for (const id of cityScoped) {
    it(`does nothing for \`${id}\` when no city is selected`, () => {
      const onTravelTo = vi.fn();
      activatePreset({
        id,
        selectedLocation: null,
        now: REFERENCE_NOW,
        onTravelTo,
      });
      expect(onTravelTo).not.toHaveBeenCalled();
      expect(getTimeOverride()).toBeNull();
    });
  }
});

describe("activatePreset — sunrise", () => {
  it("sets the override to the sunrise timestamp", () => {
    activatePreset({
      id: "sunrise",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(mockFindSunrise).toHaveBeenCalledWith(
      TOKYO.latitude,
      TOKYO.longitude,
      new Date(REFERENCE_NOW),
    );
    expect(getTimeOverride()).toBe(SUNRISE_MS);
  });

  it("moves the camera to the selected city", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "sunrise",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).toHaveBeenCalledWith(TOKYO);
  });

  it("does nothing when the calculation returns null (polar night)", () => {
    mockFindSunrise.mockReturnValueOnce(null);

    const onTravelTo = vi.fn();
    activatePreset({
      id: "sunrise",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });

    expect(onTravelTo).not.toHaveBeenCalled();
    expect(getTimeOverride()).toBeNull();
  });
});

describe("activatePreset — sunset", () => {
  it("sets the override to the sunset timestamp", () => {
    activatePreset({
      id: "sunset",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(mockFindSunset).toHaveBeenCalledWith(
      TOKYO.latitude,
      TOKYO.longitude,
      new Date(REFERENCE_NOW),
    );
    expect(getTimeOverride()).toBe(SUNSET_MS);
  });

  it("moves the camera to the selected city", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "sunset",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).toHaveBeenCalledWith(TOKYO);
  });

  it("does nothing when the calculation returns null (polar day)", () => {
    mockFindSunset.mockReturnValueOnce(null);

    const onTravelTo = vi.fn();
    activatePreset({
      id: "sunset",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });

    expect(onTravelTo).not.toHaveBeenCalled();
    expect(getTimeOverride()).toBeNull();
  });
});

describe("activatePreset — solar-noon", () => {
  it("sets the override to the solar-noon timestamp", () => {
    activatePreset({
      id: "solar-noon",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo: vi.fn(),
    });

    expect(mockFindSolarNoon).toHaveBeenCalledWith(
      TOKYO.latitude,
      TOKYO.longitude,
      new Date(REFERENCE_NOW),
    );
    expect(getTimeOverride()).toBe(SOLAR_NOON_MS);
  });

  it("moves the camera to the selected city", () => {
    const onTravelTo = vi.fn();
    activatePreset({
      id: "solar-noon",
      selectedLocation: TOKYO,
      now: REFERENCE_NOW,
      onTravelTo,
    });
    expect(onTravelTo).toHaveBeenCalledWith(TOKYO);
  });
});

/* -------------------------------------------------------------------------- */
/* useAstronomicalEventPicker — hook shape                                    */
/* -------------------------------------------------------------------------- */

describe("useAstronomicalEventPicker — return shape", () => {
  it("returns events, activeEventId, and dispatch", () => {
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: null,
        onTravelTo: vi.fn(),
        now: REFERENCE_NOW,
      }),
    );

    expect(result.current.events).toBeDefined();
    expect(result.current.activeEventId).toBeNull();
    expect(typeof result.current.dispatch).toBe("function");
  });

  it("exposes the full list of presets via events", () => {
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: null,
        onTravelTo: vi.fn(),
        now: REFERENCE_NOW,
      }),
    );

    expect(result.current.events).toHaveLength(7);
  });
});

describe("useAstronomicalEventPicker — activeEventId", () => {
  it("is null when no override is active", () => {
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: null,
        onTravelTo: vi.fn(),
        now: REFERENCE_NOW,
      }),
    );

    expect(result.current.activeEventId).toBeNull();
  });

  it("reflects the preset that produced the current override", () => {
    const onTravelTo = vi.fn();
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: null,
        onTravelTo,
        now: REFERENCE_NOW,
      }),
    );

    act(() => {
      result.current.dispatch("next-solstice");
    });

    expect(result.current.activeEventId).toBe("next-solstice");
  });

  it("returns to null after dispatching `now`", () => {
    const onTravelTo = vi.fn();
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: null,
        onTravelTo,
        now: REFERENCE_NOW,
      }),
    );

    act(() => {
      result.current.dispatch("next-solstice");
    });
    expect(result.current.activeEventId).toBe("next-solstice");

    act(() => {
      result.current.dispatch("now");
    });
    expect(result.current.activeEventId).toBeNull();
  });
});

describe("useAstronomicalEventPicker — dispatch", () => {
  it("dispatches seasonal events without touching the camera", () => {
    const onTravelTo = vi.fn();
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: TOKYO,
        onTravelTo,
        now: REFERENCE_NOW,
      }),
    );

    act(() => {
      result.current.dispatch("next-equinox");
    });

    expect(mockGetNextEquinox).toHaveBeenCalled();
    expect(onTravelTo).not.toHaveBeenCalled();
  });

  it("dispatches city-scoped events and moves the camera", () => {
    const onTravelTo = vi.fn();
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: TOKYO,
        onTravelTo,
        now: REFERENCE_NOW,
      }),
    );

    act(() => {
      result.current.dispatch("sunrise");
    });

    expect(mockFindSunrise).toHaveBeenCalled();
    expect(onTravelTo).toHaveBeenCalledWith(TOKYO);
  });

  it("does not move the camera for a city-scoped event when no city is selected", () => {
    const onTravelTo = vi.fn();
    const { result } = renderHook(() =>
      useAstronomicalEventPicker({
        selectedLocation: null,
        onTravelTo,
        now: REFERENCE_NOW,
      }),
    );

    act(() => {
      result.current.dispatch("sunrise");
    });

    expect(onTravelTo).not.toHaveBeenCalled();
  });

  it("recomputes availability when the selection changes", () => {
    const onTravelTo = vi.fn();
    const { result, rerender } = renderHook(
      ({ location }: { location: WorldLocation | null }) =>
        useAstronomicalEventPicker({
          selectedLocation: location,
          onTravelTo,
          now: REFERENCE_NOW,
        }),
      { initialProps: { location: null as WorldLocation | null } },
    );

    expect(
      result.current.events.find((o) => o.id === "sunrise")?.available,
    ).toBe(false);

    rerender({ location: TOKYO });

    expect(
      result.current.events.find((o) => o.id === "sunrise")?.available,
    ).toBe(true);
  });
});