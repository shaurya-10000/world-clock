import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="html-portal">{children}</div>
  ),
}));

vi.mock("@/components/globe/GlobeMarker", () => ({
  pickCardOffsetClasses: () => "",
}));

import CityArrivalCard from "@/components/globe/CityArrivalCard";
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

function installFixedClock(now: number): void {
  setUseNowDeps({
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });
}

function renderCard(location: WorldLocation) {
  return render(
    <CityArrivalCard location={location} onClose={vi.fn()} />,
  );
}

beforeEach(() => {
  resetUseNow();
  resetTimeCache();
  installFixedClock(Date.UTC(2024, 0, 15, 12, 0, 0));
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Location propagation                                                       */
/* -------------------------------------------------------------------------- */

describe("CityArrivalCard — location propagation", () => {
  it("renders the passed location's city and country", () => {
    renderCard(TOKYO);

    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
  });

  it("renders a different city correctly", () => {
    renderCard(NEW_YORK);

    expect(screen.getByText("New York")).toBeInTheDocument();
    expect(
      screen.getByText("United States"),
    ).toBeInTheDocument();
  });

  it("updates the city when the location prop changes", () => {
    const { rerender } = renderCard(TOKYO);

    expect(screen.getByText("Tokyo")).toBeInTheDocument();

    rerender(
      <CityArrivalCard location={NEW_YORK} onClose={vi.fn()} />,
    );

    expect(screen.queryByText("Tokyo")).not.toBeInTheDocument();
    expect(screen.getByText("New York")).toBeInTheDocument();
  });

  it("updates the local time when the location changes zones", () => {
    const { rerender } = renderCard(TOKYO);

    // Tokyo at 12:00 UTC = 21:00 local.
    expect(screen.getByText("9:00:00 PM")).toBeInTheDocument();

    rerender(
      <CityArrivalCard location={NEW_YORK} onClose={vi.fn()} />,
    );

    // New York at 12:00 UTC = 07:00 local.
    expect(screen.getByText("7:00:00 AM")).toBeInTheDocument();
  });

  it("updates the coordinates when the location changes", () => {
    const { rerender } = renderCard(TOKYO);

    expect(
      screen.getByText(/35\.6762.*139\.6503/),
    ).toBeInTheDocument();

    rerender(
      <CityArrivalCard location={NEW_YORK} onClose={vi.fn()} />,
    );

    expect(
      screen.getByText(/40\.7128.*-74\.006/),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Clock propagation                                                          */
/* -------------------------------------------------------------------------- */

describe("CityArrivalCard — clock propagation", () => {
  it("reflects a change in the ticker value on remount", () => {
    /*
     * `useNow`'s effect subscribes to the shared scheduler
     * once, at mount, and reads `deps.now` per tick. Changing
     * `setUseNowDeps` while the hook is mounted does not
     * re-run the effect, so a rerender still sees the old
     * scheduler. The card is unmounted and remounted to force
     * a fresh acquisition against the new clock.
     *
     * This is the honest way to test "the card reads from
     * the shared ticker": replace the ticker's source and
     * mount the card again.
     */
    const { unmount } = renderCard(TOKYO);

    expect(screen.getByText("9:00:00 PM")).toBeInTheDocument();

    unmount();

    installFixedClock(Date.UTC(2024, 0, 15, 13, 0, 0));

    renderCard(TOKYO);

    // Tokyo at 13:00 UTC = 22:00 local.
    expect(screen.getByText("10:00:00 PM")).toBeInTheDocument();
  });

  it("crosses a date boundary correctly", () => {
    /*
     * Tokyo is UTC+9. A UTC midnight is 09:00 local the same
     * day. A UTC 18:00 is 03:00 local the next day.
     */
    installFixedClock(Date.UTC(2024, 0, 15, 18, 0, 0));

    renderCard(TOKYO);

    expect(screen.getByText("3:00:00 AM")).toBeInTheDocument();
    expect(
      screen.getByText(/January 16, 2024/),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Maps URL generation                                                        */
/* -------------------------------------------------------------------------- */

describe("CityArrivalCard — Maps URL generation", () => {
  it("builds the URL from the current location's coordinates", () => {
    renderCard(TOKYO);

    const link = screen.getByRole("link", {
      name: /Open Tokyo in Google Maps/,
    });

    expect(link.getAttribute("href")).toBe(
      "https://www.google.com/maps?q=35.6762,139.6503",
    );
  });

  it("rebuilds the URL when the location changes", () => {
    const { rerender } = renderCard(TOKYO);

    expect(
      screen
        .getByRole("link", { name: /Open Tokyo in Google Maps/ })
        .getAttribute("href"),
    ).toBe("https://www.google.com/maps?q=35.6762,139.6503");

    rerender(
      <CityArrivalCard location={NEW_YORK} onClose={vi.fn()} />,
    );

    expect(
      screen
        .getByRole("link", {
          name: /Open New York in Google Maps/,
        })
        .getAttribute("href"),
    ).toBe("https://www.google.com/maps?q=40.7128,-74.006");
  });

  it("does not include the city name in the URL", () => {
    renderCard(TOKYO);

    const link = screen.getByRole("link", {
      name: /Open Tokyo in Google Maps/,
    });

    expect(link.getAttribute("href")).not.toContain("Tokyo");
  });
});

/* -------------------------------------------------------------------------- */
/* Close flow                                                                 */
/* -------------------------------------------------------------------------- */

describe("CityArrivalCard — close flow", () => {
  it("calls the current onClose handler after a rerender", () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    const { rerender } = render(
      <CityArrivalCard location={TOKYO} onClose={firstClose} />,
    );

    rerender(
      <CityArrivalCard location={TOKYO} onClose={secondClose} />,
    );

    const closeButton = screen.getByRole("button", {
      name: /Close Tokyo detail card/,
    });

    closeButton.click();

    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Composite behaviors                                                        */
/* -------------------------------------------------------------------------- */

describe("CityArrivalCard — composite", () => {
  it("renders every visual element for a fully-featured location", () => {
    renderCard(TOKYO);

    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByText("9:00:00 PM")).toBeInTheDocument();
    expect(screen.getByText(/January 15, 2024/)).toBeInTheDocument();
    expect(screen.getByText("Coordinates")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open Tokyo in Google Maps/ }),
    ).toBeInTheDocument();
  });

  it("does not crash when the ticker has not produced a value", () => {
    /*
     * Simulate the pre-effect state by resetting the ticker.
     * Note that under RTL the effect commits synchronously, so
     * this test cannot observe the placeholder text — it
     * asserts only that the render does not throw, which is
     * the contract that matters for the reset path.
     */
    resetUseNow();

    expect(() =>
      render(
        <CityArrivalCard location={TOKYO} onClose={vi.fn()} />,
      ),
    ).not.toThrow();
  });
});