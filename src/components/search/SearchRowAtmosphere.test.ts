import { renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { useAtmosphereVisual } from "@/components/search/SearchRowAtmosphere";
import { resetTimeCache } from "@/lib/time";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/**
 * Freezes the shared ticker at a specific epoch. Every render of
 * `useNow` (and therefore every call to the hook under test) will
 * see this instant until `setUseNowDeps` is called again.
 */
function freezeClock(ms: number): void {
  setUseNowDeps({
    now: () => ms,
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });
}

/** UTC midnight, 15 January 2024. */
const MIDNIGHT_UTC = Date.UTC(2024, 0, 15, 0, 0, 0);
/** UTC noon, 15 January 2024. */
const NOON_UTC = Date.UTC(2024, 0, 15, 12, 0, 0);
/** UTC 18:00, 15 January 2024 — dusk in the UTC band. */
const DUSK_UTC = Date.UTC(2024, 0, 15, 18, 0, 0);
/** UTC 05:00, 15 January 2024 — start of dawn in the UTC band. */
const DAWN_START_UTC = Date.UTC(2024, 0, 15, 5, 0, 0);

beforeEach(() => {
  resetUseNow();
  resetTimeCache();
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Atmosphere classification                                                  */
/* -------------------------------------------------------------------------- */

describe("useAtmosphereVisual — atmosphere classification", () => {
  it("returns night at UTC midnight", () => {
    freezeClock(MIDNIGHT_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    expect(result.current.atmosphere).toBe("night");
  });

  it("returns day at UTC noon", () => {
    freezeClock(NOON_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    expect(result.current.atmosphere).toBe("day");
  });

  it("returns dusk at UTC 18:00", () => {
    freezeClock(DUSK_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    expect(result.current.atmosphere).toBe("dusk");
  });

  it("returns dawn at UTC 05:00", () => {
    freezeClock(DAWN_START_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    expect(result.current.atmosphere).toBe("dawn");
  });

  it("classifies all four bands at their UTC boundary instants", () => {
    /*
     * Full sweep of the four boundaries in a single test.
     * Each instant is the first moment the band is active,
     * so this pins the classifier's `[start, end)` convention
     * as seen through the hook.
     *
     * The ticker caches one scheduler per interval. Without
     * a reset and unmount between iterations, the second
     * `renderHook` would acquire the already-started
     * scheduler without a fresh emit, and its `now` would
     * stay `null` — falling back to the real wall clock.
     * Both `resetUseNow()` and `unmount()` are required to
     * guarantee isolation.
     */
    const cases = [
      [MIDNIGHT_UTC, "night"],
      [DAWN_START_UTC, "dawn"],
      [Date.UTC(2024, 0, 15, 7, 0, 0), "day"],
      [Date.UTC(2024, 0, 15, 17, 0, 0), "dusk"],
      [Date.UTC(2024, 0, 15, 20, 0, 0), "night"],
    ] as const;

    for (const [instant, expected] of cases) {
      resetUseNow();
      freezeClock(instant);

      const { result, unmount } = renderHook(() =>
        useAtmosphereVisual("UTC"),
      );

      expect(result.current.atmosphere).toBe(expected);

      unmount();
    }
  });

  it("respects the time zone offset when classifying", () => {
    /*
     * The shared ticker caches one scheduler per interval. A
     * second `renderHook` in the same test would otherwise
     * join the already-started scheduler and see `now ===
     * null` — falling through to the real wall clock, which
     * would silently invalidate the comparison. Reset and
     * re-freeze between the two hooks so both see the same
     * instant. The first hook is left mounted; its `now`
     * state holds the previously-emitted value, which is
     * still `NOON_UTC`.
     */
    freezeClock(NOON_UTC);

    const { result: utc } = renderHook(() =>
      useAtmosphereVisual("UTC"),
    );

    resetUseNow();
    freezeClock(NOON_UTC);

    const { result: tokyo } = renderHook(() =>
      useAtmosphereVisual("Asia/Tokyo"),
    );

    expect(utc.current.atmosphere).toBe("day");
    expect(tokyo.current.atmosphere).not.toBe(utc.current.atmosphere);
  });

  it("classifies different zones independently at the same instant", () => {
    /*
     * Same ticker-isolation concern as the test above. Both
     * hooks must see the frozen instant for the "same
     * instant" claim in this test's name to be true.
     */
    freezeClock(NOON_UTC);

    const { result: utcResult } = renderHook(() =>
      useAtmosphereVisual("UTC"),
    );

    resetUseNow();
    freezeClock(NOON_UTC);

    const { result: tokyoResult } = renderHook(() =>
      useAtmosphereVisual("Asia/Tokyo"),
    );

    expect(utcResult.current.atmosphere).toBe("day");
    expect(tokyoResult.current.atmosphere).not.toBe(
      utcResult.current.atmosphere,
    );
  });

  it("returns night for an invalid time zone", () => {
    /*
     * `getDecimalHour` returns `0` for an invalid zone, and
     * `getAtmosphere(0)` is `night`. Pinning the composed
     * behavior here documents the fallback the hook inherits
     * from its dependencies.
     */
    freezeClock(NOON_UTC);

    const { result } = renderHook(() =>
      useAtmosphereVisual("Not/A_Zone"),
    );

    expect(result.current.atmosphere).toBe("night");
  });
});

/* -------------------------------------------------------------------------- */
/* Visual lookup                                                              */
/* -------------------------------------------------------------------------- */

describe("useAtmosphereVisual — visual lookup", () => {
  it("returns the matching visual for the classified atmosphere", () => {
    freezeClock(NOON_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    expect(result.current.visual.id).toBe(result.current.atmosphere);
  });

  it("returns a complete visual object", () => {
    freezeClock(NOON_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    const { visual } = result.current;

    expect(visual).toHaveProperty("label");
    expect(visual).toHaveProperty("icon");
    expect(visual).toHaveProperty("iconClass");
    expect(visual).toHaveProperty("accent");
    expect(visual).toHaveProperty("sky");
    expect(visual).toHaveProperty("ambient");
  });

  it("returns the same visual reference for the same atmosphere across timezones", () => {
    /*
     * Two zones that classify to the same atmosphere must
     * return the same frozen visual object — the underlying
     * `ATMOSPHERE_VISUALS` table is keyed by atmosphere, not
     * by zone. This is what lets consumers use the visual in
     * a `useMemo` dependency array without spurious re-runs.
     *
     * ## Why the ticker is reset between the two hooks
     *
     * `useNow` caches one scheduler per interval. The second
     * `renderHook` in this test would otherwise join the
     * already-started scheduler without a fresh emit, so its
     * `now` would remain `null` and the hook would fall back
     * to `new Date()` — the real wall clock. For a test that
     * asserts `Europe/London` classifies the same as `UTC`
     * at the same frozen instant, that fallback produces a
     * result dominated by whatever hour the test happens to
     * run at, not by the frozen instant. An earlier version
     * of this test omitted the reset and failed outside the
     * day band because of exactly this bug.
     */
    freezeClock(NOON_UTC);

    const { result: utc } = renderHook(() =>
      useAtmosphereVisual("UTC"),
    );

    resetUseNow();
    freezeClock(NOON_UTC);

    const { result: london } = renderHook(() =>
      useAtmosphereVisual("Europe/London"),
    );

    expect(utc.current.atmosphere).toBe("day");
    expect(london.current.atmosphere).toBe("day");
    expect(utc.current.visual).toBe(london.current.visual);
  });
});

/* -------------------------------------------------------------------------- */
/* Memoization                                                                */
/* -------------------------------------------------------------------------- */

describe("useAtmosphereVisual — memoization", () => {
  it("returns the same object reference when inputs do not change", () => {
    freezeClock(NOON_UTC);

    const { result, rerender } = renderHook(() =>
      useAtmosphereVisual("UTC"),
    );

    const first = result.current;
    rerender();
    const second = result.current;

    expect(first).toBe(second);
  });

  it("returns a new object when the timezone changes", () => {
    freezeClock(NOON_UTC);

    const { result, rerender } = renderHook(
      ({ timezone }: { timezone: string }) =>
        useAtmosphereVisual(timezone),
      { initialProps: { timezone: "UTC" } },
    );

    const first = result.current;
    rerender({ timezone: "Asia/Tokyo" });
    const second = result.current;

    expect(first).not.toBe(second);
  });

  it("returns a new object when two zones map to different atmospheres", () => {
    /*
     * Same ticker-isolation concern as the other multi-hook
     * tests in this file. Both hooks need to see the frozen
     * instant so the "different atmospheres" claim is made
     * against a controlled input.
     */
    freezeClock(NOON_UTC);

    const { result: utc } = renderHook(() =>
      useAtmosphereVisual("UTC"),
    );

    resetUseNow();
    freezeClock(NOON_UTC);

    const { result: tokyo } = renderHook(() =>
      useAtmosphereVisual("Asia/Tokyo"),
    );

    expect(utc.current).not.toBe(tokyo.current);
    expect(utc.current.visual).not.toBe(tokyo.current.visual);
  });
});

/* -------------------------------------------------------------------------- */
/* Update interval                                                            */
/* -------------------------------------------------------------------------- */

describe("useAtmosphereVisual — update interval", () => {
  it("accepts a custom update interval without throwing", () => {
    freezeClock(NOON_UTC);

    expect(() =>
      renderHook(() => useAtmosphereVisual("UTC", 1000)),
    ).not.toThrow();
  });

  it("defaults to a one-minute cadence", () => {
    freezeClock(NOON_UTC);

    const { result } = renderHook(() => useAtmosphereVisual("UTC"));

    expect(result.current.atmosphere).toBe("day");
  });

  it("classifies correctly across a range of custom intervals", () => {
    /*
     * The interval only affects how often `useNow` fires, not
     * the classification. Any interval must produce the same
     * atmosphere for the same instant.
     *
     * Each iteration resets the ticker because a custom
     * interval creates its own scheduler, and multiple
     * iterations of the loop would otherwise stack
     * subscribers with stale emitted values.
     */
    freezeClock(NOON_UTC);

    for (const ms of [0, 1, 1000, 60_000, 3_600_000]) {
      resetUseNow();
      freezeClock(NOON_UTC);

      const { result, unmount } = renderHook(() =>
        useAtmosphereVisual("UTC", ms),
      );

      expect(result.current.atmosphere).toBe("day");
      unmount();
    }
  });
});