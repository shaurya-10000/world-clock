import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import WorldClockSection from "@/components/WorldClockSection";
import type { WorldLocation } from "@/lib/locations";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/clock/AnalogClock", () => ({
  default: ({ time }: { time: { time12: string } }) => (
    <div data-testid="analog-clock" data-time={time.time12} />
  ),
}));

vi.mock("@/components/clock/DigitalClock", () => ({
  default: ({
    format,
    atmosphere,
  }: {
    format: string;
    atmosphere: string;
  }) => (
    <div
      data-testid="digital-clock"
      data-format={format}
      data-atmosphere={atmosphere}
    />
  ),
}));

vi.mock("@/components/clock/SkyAtmosphere", () => ({
  default: ({ time }: { time: { decimalHour: number } }) => (
    <div
      data-testid="sky-atmosphere"
      data-hour={String(time.decimalHour)}
    />
  ),
}));

vi.mock("@/components/clock/ControlBar", () => ({
  default: ({
    mode,
    format,
  }: {
    mode: string;
    format: string;
  }) => (
    <div
      data-testid="control-bar"
      data-mode={mode}
      data-format={format}
    />
  ),
}));

vi.mock("@/components/search/SearchableLocationInput", () => ({
  default: ({
    selectedLocation,
  }: {
    selectedLocation: WorldLocation | null;
  }) => (
    <div
      data-testid="search"
      data-selected={selectedLocation?.id ?? ""}
    />
  ),
}));

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

beforeEach(() => {
  resetUseNow();
  installFixedClock(Date.UTC(2024, 0, 15, 12, 0, 0));
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

function renderSection(location: WorldLocation | null = TOKYO) {
  return render(
    <WorldClockSection
      location={location}
      onLocationSelect={vi.fn()}
    />,
  );
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — structure", () => {
  it("renders a section with id time-zones", () => {
    const { container } = renderSection();

    expect(container.querySelector("section#time-zones")).not.toBeNull();
  });

  it("renders the cities anchor", () => {
    const { container } = renderSection();

    expect(container.querySelector("#cities")).not.toBeNull();
  });

  it("section is a landmark with an accessible name from its heading", () => {
    renderSection();

    // The section landmark is labelled by its heading, so the
    // heading text must be discoverable.
    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();
  });

  it("renders the location heading", () => {
    renderSection();

    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();
  });

  it("renders the country alongside the city", () => {
    renderSection();

    expect(screen.getByText("Japan")).toBeInTheDocument();
  });

  it("renders the sky atmosphere", () => {
    renderSection();

    expect(screen.getByTestId("sky-atmosphere")).toBeInTheDocument();
  });

  it("renders the control bar", () => {
    renderSection();

    expect(screen.getByTestId("control-bar")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderSection();

    expect(screen.getByTestId("search")).toBeInTheDocument();
  });

  it("renders the analog clock by default", () => {
    renderSection();

    expect(screen.getByTestId("analog-clock")).toBeInTheDocument();
  });

  it("defaults the control bar to analog mode", () => {
    renderSection();

    expect(screen.getByTestId("control-bar")).toHaveAttribute(
      "data-mode",
      "analog",
    );
  });

  it("defaults the control bar to 12h format", () => {
    renderSection();

    expect(screen.getByTestId("control-bar")).toHaveAttribute(
      "data-format",
      "12h",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — content", () => {
  it("renders the timezone identifier", () => {
    renderSection();

    expect(screen.getByText("Asia/Tokyo")).toBeInTheDocument();
  });

  it("renders the UTC offset", () => {
    renderSection();

    // The lib formats "UTC+09:00" for Asia/Tokyo. This string
    // is derived from arithmetic, not from ICU abbreviation
    // data, so it is stable across ICU builds.
    expect(screen.getByText(/UTC\+09:00/)).toBeInTheDocument();
  });

  it("renders the formatted date", () => {
    renderSection();

    // The reference instant is Jan 15, 2024.
    expect(screen.getByText(/January/)).toBeInTheDocument();
  });

  it("renders the zone name returned by the lib", () => {
    /*
     * The specific string is ICU-dependent: full-ICU Node
     * reports `"JST"` for Asia/Tokyo, small-ICU Node reports
     * `"GMT+9"`. Both are correct. This test asserts the
     * integration contract — the `zoneName` field computed by
     * `getLocalTime` reaches the DOM — not the ICU-specific
     * value.
     *
     * The exact value is asserted in `lib/time.test.ts`,
     * which runs under the same runtime and pins the format
     * of whatever ICU data is available.
     *
     * The zone name is rendered inside the `<div>` that
     * appears after the formatted date. Locate it by
     * structure rather than by value.
     */
    const { container } = renderSection();

    const zoneNameSpans = container.querySelectorAll(
      ".mt-2 span:not([aria-hidden])",
    );

    expect(zoneNameSpans.length).toBeGreaterThan(0);

    const zoneName = zoneNameSpans[0];
    expect(zoneName?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("passes the fixed clock time to the analog clock", () => {
    renderSection();

    // The fixed clock is 2024-01-15T12:00Z, which is
    // 21:00 in Tokyo. The time12 string is "9:00:00 PM".
    expect(screen.getByTestId("analog-clock")).toHaveAttribute(
      "data-time",
      "9:00:00 PM",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — accessibility", () => {
  it("section is a landmark with an id", () => {
    const { container } = renderSection();

    const section = container.querySelector("section#time-zones");
    expect(section).not.toBeNull();
  });

  it("location is a level-2 heading", () => {
    renderSection();

    expect(
      screen.getByRole("heading", { level: 2, name: "Tokyo" }),
    ).toBeInTheDocument();
  });

  it("decorative separators are aria-hidden", () => {
    const { container } = renderSection();

    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("does not introduce a navigation landmark", () => {
    // The section is not navigation; a nav landmark here
    // would compete with the header's navigation.
    renderSection();

    expect(
      screen.queryByRole("navigation"),
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Placeholder state                                                          */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — no location", () => {
  it("renders the placeholder when the parent passes null and no fallback resolves", () => {
    // Mock Intl to a zone with no catalogued city.
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return {
          resolvedOptions: () => ({ timeZone: "Pacific/Marquesas" }),
        } as unknown as Intl.DateTimeFormat;
      } as unknown as typeof Intl.DateTimeFormat,
    );

    renderSection(null);

    expect(
      screen.getByText("Preparing local time…"),
    ).toBeInTheDocument();
  });

  it("renders 'Your local time' as the heading when no location resolves", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return {
          resolvedOptions: () => ({ timeZone: "Pacific/Marquesas" }),
        } as unknown as Intl.DateTimeFormat;
      } as unknown as typeof Intl.DateTimeFormat,
    );

    renderSection(null);

    expect(
      screen.getByRole("heading", { name: "Your local time" }),
    ).toBeInTheDocument();
  });

  it("does not render the analog clock when no location resolves", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return {
          resolvedOptions: () => ({ timeZone: "Pacific/Marquesas" }),
        } as unknown as Intl.DateTimeFormat;
      } as unknown as typeof Intl.DateTimeFormat,
    );

    renderSection(null);

    expect(
      screen.queryByTestId("analog-clock"),
    ).not.toBeInTheDocument();
  });

  it("does not render the sky atmosphere when no location resolves", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      function (this: Intl.DateTimeFormat) {
        return {
          resolvedOptions: () => ({ timeZone: "Pacific/Marquesas" }),
        } as unknown as Intl.DateTimeFormat;
      } as unknown as typeof Intl.DateTimeFormat,
    );

    renderSection(null);

    expect(
      screen.queryByTestId("sky-atmosphere"),
    ).not.toBeInTheDocument();
  });
});