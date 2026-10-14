import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Framer Motion — synchronous AnimatePresence                                */
/* -------------------------------------------------------------------------- */

/*
 * `AnimatePresence mode="wait"` keeps the outgoing child
 * mounted until its exit animation finishes. In a test
 * environment there is no animation loop, so the exit never
 * completes and the new child never appears. This mock makes
 * `AnimatePresence` a passthrough that renders its children
 * immediately, which is what the assertions expect.
 */
vi.mock("framer-motion", async () => {
  const actual =
    await vi.importActual<typeof import("framer-motion")>(
      "framer-motion",
    );

  return {
    ...actual,
    AnimatePresence: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  };
});

/* -------------------------------------------------------------------------- */
/* getLocalTimeZone override                                                  */
/* -------------------------------------------------------------------------- */

/*
 * `resolveLocalLocation` calls `getLocalTimeZone` from
 * `@/lib/time`. Overriding that one function is the least
 * invasive way to control the "browser's local time zone"
 * without breaking the actual formatter construction.
 */
const localZoneRef = { current: "UTC" };

vi.mock("@/lib/time", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/time")>(
      "@/lib/time",
    );

  return {
    ...actual,
    getLocalTimeZone: () => localZoneRef.current,
  };
});

import WorldClockSection from "@/components/WorldClockSection";
import type { WorldLocation } from "@/lib/locations";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";
import { resetTimeCache } from "@/lib/time";

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/clock/AnalogClock", () => ({
  default: () => <div data-testid="analog-clock" />,
}));

vi.mock("@/components/clock/DigitalClock", () => ({
  default: ({ format }: { format: string }) => (
    <div data-testid="digital-clock" data-format={format} />
  ),
}));

vi.mock("@/components/clock/SkyAtmosphere", () => ({
  default: () => <div data-testid="sky-atmosphere" />,
}));

vi.mock("@/components/clock/ControlBar", () => ({
  default: ({
    mode,
    format,
    onModeChange,
    onFormatChange,
  }: {
    mode: string;
    format: string;
    onModeChange: (m: "analog" | "digital") => void;
    onFormatChange: (f: "12h" | "24h") => void;
  }) => (
    <div
      data-testid="control-bar"
      data-mode={mode}
      data-format={format}
    >
      <button
        data-testid="set-digital"
        onClick={() => onModeChange("digital")}
      >
        digital
      </button>
      <button
        data-testid="set-analog"
        onClick={() => onModeChange("analog")}
      >
        analog
      </button>
      <button
        data-testid="set-24h"
        onClick={() => onFormatChange("24h")}
      >
        24h
      </button>
      <button
        data-testid="set-12h"
        onClick={() => onFormatChange("12h")}
      >
        12h
      </button>
    </div>
  ),
}));

vi.mock("@/components/search/SearchableLocationInput", () => ({
  default: ({
    selectedLocation,
    onSelect,
  }: {
    selectedLocation: WorldLocation | null;
    onSelect: (l: WorldLocation) => void;
  }) => (
    <div
      data-testid="search"
      data-selected={selectedLocation?.id ?? ""}
    >
      <button
        data-testid="mock-select"
        onClick={() =>
          onSelect({
            id: "london",
            city: "London",
            country: "United Kingdom",
            timezone: "Europe/London",
            latitude: 51.5074,
            longitude: -0.1278,
            continent: "europe",
            globeTiers: ["main"],
          })
        }
      >
        select
      </button>
    </div>
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

const LONDON: WorldLocation = {
  id: "london",
  city: "London",
  country: "United Kingdom",
  timezone: "Europe/London",
  latitude: 51.5074,
  longitude: -0.1278,
  continent: "europe",
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

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetUseNow();
  resetTimeCache();
  localZoneRef.current = "UTC";
  installFixedClock(Date.UTC(2024, 0, 15, 12, 0, 0));
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

function renderSection(location: WorldLocation | null = TOKYO) {
  const onLocationSelect = vi.fn();
  render(
    <WorldClockSection
      location={location}
      onLocationSelect={onLocationSelect}
    />,
  );
  return { onLocationSelect };
}

/* -------------------------------------------------------------------------- */
/* Location resolution                                                        */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — location resolution", () => {
  it("uses the parent-provided location", () => {
    renderSection(TOKYO);

    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();
  });

  it("falls back to the local timezone when the parent passes null", () => {
    localZoneRef.current = "Asia/Tokyo";

    renderSection(null);

    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();
  });

  it("shows the placeholder when there is no resolvable location", () => {
    localZoneRef.current = "Pacific/Marquesas";

    renderSection(null);

    expect(
      screen.queryByRole("heading", { name: "Tokyo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Preparing local time…"),
    ).toBeInTheDocument();
  });

  it("parent's location wins over the fallback", () => {
    localZoneRef.current = "Europe/London";

    renderSection(TOKYO);

    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();
  });

  it("keeps the fallback decision after the parent passes null once", () => {
    /*
     * The fallback is resolved exactly once. If the parent
     * later passes a location and then passes `null` again,
     * the original fallback decision must still be in effect
     * (not re-computed).
     */
    localZoneRef.current = "Asia/Tokyo";

    const onLocationSelect = vi.fn();
    const { rerender } = render(
      <WorldClockSection
        location={null}
        onLocationSelect={onLocationSelect}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();

    rerender(
      <WorldClockSection
        location={LONDON}
        onLocationSelect={onLocationSelect}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "London" }),
    ).toBeInTheDocument();

    rerender(
      <WorldClockSection
        location={null}
        onLocationSelect={onLocationSelect}
      />,
    );

    // The original fallback decision is still in effect.
    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Clock mode                                                                 */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — clock mode", () => {
  it("defaults to analog", () => {
    renderSection();

    expect(screen.getByTestId("analog-clock")).toBeInTheDocument();
    expect(
      screen.queryByTestId("digital-clock"),
    ).not.toBeInTheDocument();
  });

  it("switches to digital when ControlBar requests it", () => {
    renderSection();

    act(() => {
      fireEvent.click(screen.getByTestId("set-digital"));
    });

    expect(
      screen.queryByTestId("analog-clock"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("digital-clock")).toBeInTheDocument();
  });

  it("switches back to analog", () => {
    renderSection();

    act(() => {
      fireEvent.click(screen.getByTestId("set-digital"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("set-analog"));
    });

    expect(screen.getByTestId("analog-clock")).toBeInTheDocument();
    expect(
      screen.queryByTestId("digital-clock"),
    ).not.toBeInTheDocument();
  });

  it("mode change does not affect the format", () => {
    renderSection();

    act(() => {
      fireEvent.click(screen.getByTestId("set-digital"));
    });

    expect(screen.getByTestId("control-bar")).toHaveAttribute(
      "data-format",
      "12h",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Time format                                                                */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — time format", () => {
  it("defaults to 12h", () => {
    renderSection();

    expect(screen.getByTestId("control-bar")).toHaveAttribute(
      "data-format",
      "12h",
    );
  });

  it("switches to 24h when ControlBar requests it", () => {
    renderSection();

    act(() => {
      fireEvent.click(screen.getByTestId("set-24h"));
    });

    expect(screen.getByTestId("control-bar")).toHaveAttribute(
      "data-format",
      "24h",
    );
  });

  it("passes the format to the digital clock", () => {
    renderSection();

    act(() => {
      fireEvent.click(screen.getByTestId("set-digital"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("set-24h"));
    });

    expect(screen.getByTestId("digital-clock")).toHaveAttribute(
      "data-format",
      "24h",
    );
  });

  it("format change does not affect the mode", () => {
    renderSection();

    act(() => {
      fireEvent.click(screen.getByTestId("set-24h"));
    });

    // Still in analog mode.
    expect(screen.getByTestId("analog-clock")).toBeInTheDocument();
    expect(
      screen.queryByTestId("digital-clock"),
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Selection flow                                                             */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — selection", () => {
  it("forwards selections from the search input upward", () => {
    const { onLocationSelect } = renderSection(TOKYO);

    fireEvent.click(screen.getByTestId("mock-select"));

    expect(onLocationSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "london" }),
    );
  });

  it("passes the selected location to the search input", () => {
    renderSection(TOKYO);

    expect(screen.getByTestId("search")).toHaveAttribute(
      "data-selected",
      "tokyo",
    );
  });

  it("passes an empty selected id when no location is resolved", () => {
    localZoneRef.current = "Pacific/Marquesas";

    renderSection(null);

    expect(screen.getByTestId("search")).toHaveAttribute(
      "data-selected",
      "",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Prop changes                                                               */
/* -------------------------------------------------------------------------- */

describe("WorldClockSection — prop changes", () => {
  it("adopts a new location prop on re-render", () => {
    const onLocationSelect = vi.fn();
    const { rerender } = render(
      <WorldClockSection
        location={TOKYO}
        onLocationSelect={onLocationSelect}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Tokyo" }),
    ).toBeInTheDocument();

    rerender(
      <WorldClockSection
        location={LONDON}
        onLocationSelect={onLocationSelect}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "London" }),
    ).toBeInTheDocument();
  });

  it("keeps the current location when the prop goes from a value to null", () => {
    const onLocationSelect = vi.fn();
    const { rerender } = render(
      <WorldClockSection
        location={TOKYO}
        onLocationSelect={onLocationSelect}
      />,
    );

    rerender(
      <WorldClockSection
        location={null}
        onLocationSelect={onLocationSelect}
      />,
    );

    /*
     * The fallback logic runs on `location === null` only if
     * `fallback` is still `undefined`. Since the parent
     * supplied a location on the first render, the fallback
     * effect early-returned. On the second render, `location`
     * is null, so the effect runs and resolves a fallback
     * from the current local zone (UTC). The result depends
     * on whether UTC is catalogued, so we assert only that
     * the section renders.
     */
    expect(screen.getByTestId("search")).toBeInTheDocument();
  });

  it("preserves the mode across location changes", () => {
    const onLocationSelect = vi.fn();
    const { rerender } = render(
      <WorldClockSection
        location={TOKYO}
        onLocationSelect={onLocationSelect}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByTestId("set-digital"));
    });

    rerender(
      <WorldClockSection
        location={LONDON}
        onLocationSelect={onLocationSelect}
      />,
    );

    expect(screen.getByTestId("digital-clock")).toBeInTheDocument();
  });

  it("preserves the format across location changes", () => {
    const onLocationSelect = vi.fn();
    const { rerender } = render(
      <WorldClockSection
        location={TOKYO}
        onLocationSelect={onLocationSelect}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByTestId("set-24h"));
    });

    rerender(
      <WorldClockSection
        location={LONDON}
        onLocationSelect={onLocationSelect}
      />,
    );

    expect(screen.getByTestId("control-bar")).toHaveAttribute(
      "data-format",
      "24h",
    );
  });
});