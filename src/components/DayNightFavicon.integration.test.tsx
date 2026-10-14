import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import DayNightFavicon from "@/components/DayNightFavicon";
import type { WorldLocation } from "@/lib/locations";
import { resetTimeCache } from "@/lib/time";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const TOKYO: WorldLocation = {
  id: "tokyo",
  city: "Tokyo",
  country: "Japan",
  timezone: "Asia/Tokyo",
  latitude: 35.6762,
  longitude: 139.6503,
  continent: "east-asia",
  globeTiers: ["main"],
};

const NEW_YORK: WorldLocation = {
  id: "new-york",
  city: "New York",
  country: "United States",
  timezone: "America/New_York",
  latitude: 40.7128,
  longitude: -74.006,
  continent: "north-america",
  globeTiers: ["main"],
};

/**
 * `2024-01-15T00:00Z` — Tokyo is 09:00 (day), New York is
 * 19:00 (dusk). Used as the instant for the "different
 * favicons" test.
 */
const MIDNIGHT_UTC = Date.UTC(2024, 0, 15, 0, 0, 0);

/**
 * `2024-01-15T12:00Z` — Tokyo is 21:00 (night), New York is
 * 07:00 (day).
 */
const NOON_UTC = Date.UTC(2024, 0, 15, 12, 0, 0);

function installFixedClock(now: number): void {
  setUseNowDeps({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });
}

function getFaviconHref(): string | null {
  const link = document.head.querySelector<HTMLLinkElement>(
    'link[rel~="icon"]',
  );
  return link?.getAttribute("href") ?? null;
}

function clearFaviconLinks(): void {
  for (const link of Array.from(
    document.head.querySelectorAll('link[rel~="icon"]'),
  )) {
    link.remove();
  }
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetUseNow();
  resetTimeCache();
  clearFaviconLinks();
});

afterEach(() => {
  resetUseNow();
  clearFaviconLinks();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Atmosphere-to-icon mapping                                                 */
/* -------------------------------------------------------------------------- */

describe("DayNightFavicon — atmosphere to icon mapping", () => {
  it("uses the sun icon when the local hour is day", () => {
    installFixedClock(NOON_UTC);

    // New York at 12:00 UTC is 07:00 local → day.
    const { unmount } = render(
      <DayNightFavicon location={NEW_YORK} />,
    );

    const dayHref = getFaviconHref();
    unmount();

    clearFaviconLinks();

    // Tokyo at 12:00 UTC is 21:00 local → night.
    const { unmount: unmountNight } = render(
      <DayNightFavicon location={TOKYO} />,
    );
    const nightHref = getFaviconHref();
    unmountNight();

    expect(dayHref).not.toBe(nightHref);
  });

  it("uses a distinct favicon for dawn and dusk", () => {
    /*
     * Both dawn and dusk are twilight in `lib/atmosphere`, but
     * the favicon maps dawn → sun and dusk → moon. This test
     * confirms the split.
     *
     * At `2024-01-15T00:00Z` (midnight UTC):
     *   - Tokyo is 09:00 → day → sun
     *   - New York is 19:00 → dusk → moon
     */
    installFixedClock(MIDNIGHT_UTC);

    const { unmount: unmountTokyo } = render(
      <DayNightFavicon location={TOKYO} />,
    );
    const tokyoHref = getFaviconHref();
    unmountTokyo();

    clearFaviconLinks();

    const { unmount: unmountNY } = render(
      <DayNightFavicon location={NEW_YORK} />,
    );
    const nyHref = getFaviconHref();
    unmountNY();

    expect(tokyoHref).not.toBe(nyHref);
  });
});

/* -------------------------------------------------------------------------- */
/* Location changes                                                           */
/* -------------------------------------------------------------------------- */

describe("DayNightFavicon — location changes", () => {
  it("updates the favicon when the location prop changes", () => {
    installFixedClock(NOON_UTC);

    // New York: 07:00 → day → sun.
    const { rerender, unmount } = render(
      <DayNightFavicon location={NEW_YORK} />,
    );
    const newYorkHref = getFaviconHref();

    // Tokyo: 21:00 → night → moon.
    rerender(<DayNightFavicon location={TOKYO} />);
    const tokyoHref = getFaviconHref();

    unmount();

    expect(newYorkHref).not.toBe(tokyoHref);
  });

  it("restores the build-time icon when the location becomes null", () => {
    installFixedClock(NOON_UTC);

    const { rerender } = render(
      <DayNightFavicon location={TOKYO} />,
    );
    expect(getFaviconHref()).toMatch(/^data:image\/png;base64,/);

    rerender(<DayNightFavicon location={null} />);

    expect(getFaviconHref()).toBe("/icon");
  });
});

/* -------------------------------------------------------------------------- */
/* Time override interaction                                                  */
/* -------------------------------------------------------------------------- */

describe("DayNightFavicon — respects the time override", () => {
  it("picks the icon based on the ticker value, not the wall clock", () => {
    /*
     * The ticker is frozen at noon UTC. Regardless of when
     * the test actually runs, the favicon must reflect that
     * instant — this is what makes the component respect the
     * app-wide time override (`lib/time-override.ts`).
     */
    installFixedClock(NOON_UTC);

    const { unmount } = render(
      <DayNightFavicon location={TOKYO} />,
    );

    // Tokyo at 12:00 UTC = 21:00 local → night → moon.
    const href = getFaviconHref();
    unmount();

    clearFaviconLinks();

    // Freeze at 00:00 UTC. Tokyo = 09:00 local → day → sun.
    installFixedClock(MIDNIGHT_UTC);

    const { unmount: unmount2 } = render(
      <DayNightFavicon location={TOKYO} />,
    );
    const otherHref = getFaviconHref();
    unmount2();

    expect(href).not.toBe(otherHref);
  });
});