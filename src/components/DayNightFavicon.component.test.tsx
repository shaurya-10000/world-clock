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

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetUseNow();
  installFixedClock(Date.UTC(2024, 0, 15, 12, 0, 0));

  // Wipe any favicon link the test environment installed.
  for (const link of Array.from(
    document.head.querySelectorAll('link[rel~="icon"]'),
  )) {
    link.remove();
  }
});

afterEach(() => {
  resetUseNow();
  for (const link of Array.from(
    document.head.querySelectorAll('link[rel~="icon"]'),
  )) {
    link.remove();
  }
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

describe("DayNightFavicon — rendering", () => {
  it("renders nothing into the DOM", () => {
    const { container } = render(
      <DayNightFavicon location={TOKYO} />,
    );

    expect(container.children).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("does not introduce focusable elements", () => {
    render(<DayNightFavicon location={TOKYO} />);

    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not throw when location is null", () => {
    expect(() =>
      render(<DayNightFavicon location={null} />),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Favicon swap                                                               */
/* -------------------------------------------------------------------------- */

describe("DayNightFavicon — favicon swap", () => {
  it("installs a favicon link on mount when a location is given", () => {
    render(<DayNightFavicon location={TOKYO} />);

    expect(getFaviconHref()).toMatch(/^data:image\/png;base64,/);
  });

  it("installs a PNG favicon", () => {
    render(<DayNightFavicon location={TOKYO} />);

    const link = document.head.querySelector<HTMLLinkElement>(
      'link[rel~="icon"]',
    );

    expect(link?.getAttribute("type")).toBe("image/png");
  });

  it("clears the favicon link on unmount", () => {
    const { unmount } = render(
      <DayNightFavicon location={TOKYO} />,
    );

    expect(getFaviconHref()).toMatch(/^data:image\/png;base64,/);

    unmount();

    // After unmount, the href is restored to the fallback.
    expect(getFaviconHref()).toBe("/icon");
  });

  it("restores the build-time icon when location is null", () => {
    render(<DayNightFavicon location={null} />);

    // `applyIcon(null)` sets the href to the fallback.
    expect(getFaviconHref()).toBe("/icon");
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism across re-renders                                              */
/* -------------------------------------------------------------------------- */

describe("DayNightFavicon — determinism", () => {
  it("produces the same favicon for two consecutive renders at the same instant", () => {
    const { unmount } = render(
      <DayNightFavicon location={TOKYO} />,
    );
    const first = getFaviconHref();
    unmount();

    // Clear the head so the second render starts fresh.
    for (const link of Array.from(
      document.head.querySelectorAll('link[rel~="icon"]'),
    )) {
      link.remove();
    }

    const { unmount: unmount2 } = render(
      <DayNightFavicon location={TOKYO} />,
    );
    const second = getFaviconHref();
    unmount2();

    expect(first).toBe(second);
  });
});