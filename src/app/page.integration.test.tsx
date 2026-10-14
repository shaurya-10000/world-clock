import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import Home from "@/app/page";
import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/DayNightFavicon", () => ({
  default: ({ location }: { location: WorldLocation | null }) => (
    <div
      data-testid="favicon"
      data-city={location?.city ?? ""}
    />
  ),
}));

vi.mock("@/components/Header", () => ({
  default: ({
    mobileView,
    onMobileViewChange,
  }: {
    mobileView: string;
    onMobileViewChange: (v: "globe" | "zones") => void;
  }) => (
    <div data-testid="header" data-view={mobileView}>
      <button
        data-testid="set-zones"
        onClick={() => onMobileViewChange("zones")}
      >
        zones
      </button>
      <button
        data-testid="set-globe"
        onClick={() => onMobileViewChange("globe")}
      >
        globe
      </button>
    </div>
  ),
}));

vi.mock("@/components/Globe", () => ({
  default: ({
    selectedLocationId,
    onLocationSelect,
    solarState,
  }: {
    selectedLocationId: string | null;
    onLocationSelect: (l: WorldLocation) => void;
    solarState: unknown;
  }) => (
    <div
      data-testid="globe"
      data-selected={String(selectedLocationId)}
      data-solar={String(solarState)}
    >
      <button
        data-testid="select-tokyo"
        onClick={() =>
          onLocationSelect({
            id: "tokyo",
            city: "Tokyo",
            country: "Japan",
            timezone: "Asia/Tokyo",
            latitude: 35.6762,
            longitude: 139.6503,
            continent: "east-asia",
            globeTiers: ["main"],
          })
        }
      >
        tokyo
      </button>
    </div>
  ),
}));

vi.mock("@/components/GlobeAtmosphere", () => ({
  default: () => <div data-testid="globe-atmosphere" />,
}));

vi.mock("@/components/WorldClockSection", () => ({
  default: ({
    location,
  }: {
    location: WorldLocation | null;
  }) => (
    <div data-testid="world-clock" data-city={location?.city ?? ""} />
  ),
}));

vi.mock("@/components/CitiesSection", () => ({
  default: ({
    selectedLocationId,
  }: {
    selectedLocationId: string | null;
  }) => (
    <div
      data-testid="cities"
      data-selected={String(selectedLocationId)}
    />
  ),
}));

/* -------------------------------------------------------------------------- */
/* matchMedia                                                                 */
/* -------------------------------------------------------------------------- */

function installMatchMedia(matches: boolean): void {
  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia =
    () => ({
      matches,
      media: "",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    });
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  installMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.title = "";
});

/* -------------------------------------------------------------------------- */
/* Layout selection                                                           */
/* -------------------------------------------------------------------------- */

describe("Home — layout selection", () => {
  it("renders the desktop layout on a wide viewport", () => {
    installMatchMedia(false);
    render(<Home />);

    expect(screen.getByTestId("globe")).toBeInTheDocument();
    expect(screen.getByTestId("world-clock")).toBeInTheDocument();
  });

  it("renders the mobile layout on a narrow viewport", () => {
    installMatchMedia(true);
    render(<Home />);

    expect(screen.getByTestId("globe")).toBeInTheDocument();
  });

  it("mounts exactly one Globe on desktop", () => {
    installMatchMedia(false);
    render(<Home />);

    expect(screen.getAllByTestId("globe")).toHaveLength(1);
  });

  it("mounts exactly one Globe on mobile", () => {
    installMatchMedia(true);
    render(<Home />);

    expect(screen.getAllByTestId("globe")).toHaveLength(1);
  });

  it("mounts exactly one atmosphere layer on desktop", () => {
    installMatchMedia(false);
    render(<Home />);

    expect(
      screen.getAllByTestId("globe-atmosphere"),
    ).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Mobile view toggle                                                         */
/* -------------------------------------------------------------------------- */

describe("Home — mobile view toggle", () => {
  it("passes the current view to the header", () => {
    installMatchMedia(true);
    render(<Home />);

    expect(screen.getByTestId("header")).toHaveAttribute(
      "data-view",
      "globe",
    );
  });

  it("switches to zones view when the header requests it", () => {
    installMatchMedia(true);
    render(<Home />);

    fireEvent.click(screen.getByTestId("set-zones"));

    expect(screen.getByTestId("header")).toHaveAttribute(
      "data-view",
      "zones",
    );
  });

  it("switches back to globe view", () => {
    installMatchMedia(true);
    render(<Home />);

    fireEvent.click(screen.getByTestId("set-zones"));
    fireEvent.click(screen.getByTestId("set-globe"));

    expect(screen.getByTestId("header")).toHaveAttribute(
      "data-view",
      "globe",
    );
  });

  it("in zones view, the world clock is present and the globe is not", () => {
    installMatchMedia(true);
    render(<Home />);

    fireEvent.click(screen.getByTestId("set-zones"));

    expect(screen.getByTestId("world-clock")).toBeInTheDocument();
    expect(screen.queryByTestId("globe")).not.toBeInTheDocument();
  });

  it("in globe view, the globe is present and the zones clock is not", () => {
    installMatchMedia(true);
    render(<Home />);

    expect(screen.getByTestId("globe")).toBeInTheDocument();
    expect(
      screen.queryByTestId("world-clock"),
    ).not.toBeInTheDocument();
  });

  it("unmounts and remounts the globe when toggling views", () => {
    /*
     * Toggling to zones then back to globe should produce a
     * fresh globe, not a hidden one. This is the same
     * WebGL-context concern as in the component suite.
     */
    installMatchMedia(true);
    render(<Home />);

    fireEvent.click(screen.getByTestId("set-zones"));
    expect(screen.queryByTestId("globe")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("set-globe"));
    expect(screen.getAllByTestId("globe")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Location selection data flow                                               */
/* -------------------------------------------------------------------------- */

describe("Home — location selection", () => {
  it("propagates the selected location to the globe, cities, and clock", () => {
    installMatchMedia(false);
    render(<Home />);

    fireEvent.click(screen.getByTestId("select-tokyo"));

    expect(screen.getByTestId("globe")).toHaveAttribute(
      "data-selected",
      "tokyo",
    );
    expect(screen.getByTestId("cities")).toHaveAttribute(
      "data-selected",
      "tokyo",
    );
    expect(screen.getByTestId("world-clock")).toHaveAttribute(
      "data-city",
      "Tokyo",
    );
  });

  it("propagates the selected location to the favicon", () => {
    installMatchMedia(false);
    render(<Home />);

    fireEvent.click(screen.getByTestId("select-tokyo"));

    expect(screen.getByTestId("favicon")).toHaveAttribute(
      "data-city",
      "Tokyo",
    );
  });

  it("updates the document title on selection", () => {
    installMatchMedia(false);
    render(<Home />);

    fireEvent.click(screen.getByTestId("select-tokyo"));

    expect(document.title).toBe("Tokyo — World Clock");
  });

  it("uses the brand title when no local city matches", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: "Mars/Olympus" }),
        }) as unknown as Intl.DateTimeFormat,
    );
    installMatchMedia(false);

    document.title = "leftover";
    render(<Home />);

    expect(document.title).toBe("World Clock");
  });

  it("uses the local city title when the browser zone matches the catalog", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
        }) as unknown as Intl.DateTimeFormat,
    );
    installMatchMedia(false);

    render(<Home />);

    expect(document.title).toBe("Tokyo — World Clock");
  });

  it("does not throw when resolveLocalLocation fails", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("Intl unavailable");
    });
    installMatchMedia(false);

    expect(() => render(<Home />)).not.toThrow();
    expect(document.title).toBe("World Clock");
  });
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("Home — structure", () => {
  it("renders a main element", () => {
    installMatchMedia(false);
    const { container } = render(<Home />);

    expect(container.querySelector("main")).not.toBeNull();
  });

  it("renders the cities section regardless of viewport", () => {
    installMatchMedia(true);
    render(<Home />);

    expect(screen.getByTestId("cities")).toBeInTheDocument();
  });

  it("renders the cities section in zones view too", () => {
    installMatchMedia(true);
    render(<Home />);

    fireEvent.click(screen.getByTestId("set-zones"));

    expect(screen.getByTestId("cities")).toBeInTheDocument();
  });

  it("does not render a heading from the page shell", () => {
    installMatchMedia(false);
    const { container } = render(<Home />);

    expect(container.querySelector("main h1")).toBeNull();
  });

  it("renders the header above the layout shell", () => {
    installMatchMedia(false);
    const { container } = render(<Home />);

    const main = container.querySelector("main");
    const header = screen.getByTestId("header");

    expect(main).toContainElement(header);
  });
});