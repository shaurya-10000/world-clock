import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  DesktopLayout,
  MobileLayout,
  type LayoutProps,
} from "@/app/page";
import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/Globe", () => ({
  default: ({
    selectedLocationId,
    solarState,
  }: {
    selectedLocationId: string | null;
    solarState: unknown;
  }) => (
    <div
      data-testid="globe"
      data-selected={String(selectedLocationId)}
      data-solar={String(solarState)}
    />
  ),
}));

vi.mock("@/components/GlobeAtmosphere", () => ({
  default: ({ solarState }: { solarState: unknown }) => (
    <div
      data-testid="globe-atmosphere"
      data-solar={String(solarState)}
    />
  ),
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

function layoutProps(
  overrides: Partial<LayoutProps> = {},
): LayoutProps {
  return {
    selectedLocationId: null,
    clockLocation: null,
    onLocationSelect: vi.fn(),
    solarState: null,
    onSolarChange: vi.fn(),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* DesktopLayout — structure                                                  */
/* -------------------------------------------------------------------------- */

describe("DesktopLayout — structure", () => {
  it("renders a section with id explore", () => {
    const { container } = render(
      <DesktopLayout {...layoutProps()} />,
    );

    expect(
      container.querySelector("section#explore"),
    ).not.toBeNull();
  });

  it("renders the globe atmosphere behind the globe", () => {
    render(<DesktopLayout {...layoutProps()} />);

    expect(
      screen.getByTestId("globe-atmosphere"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("globe")).toBeInTheDocument();
  });

  it("renders the world clock section", () => {
    render(<DesktopLayout {...layoutProps()} />);

    expect(screen.getByTestId("world-clock")).toBeInTheDocument();
  });

  it("renders exactly one atmosphere layer", () => {
    render(<DesktopLayout {...layoutProps()} />);

    expect(
      screen.getAllByTestId("globe-atmosphere"),
    ).toHaveLength(1);
  });

  it("renders exactly one globe", () => {
    render(<DesktopLayout {...layoutProps()} />);

    expect(screen.getAllByTestId("globe")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* DesktopLayout — prop propagation                                           */
/* -------------------------------------------------------------------------- */

describe("DesktopLayout — prop propagation", () => {
  it("passes the clock location to the world clock", () => {
    render(
      <DesktopLayout
        {...layoutProps({ clockLocation: TOKYO })}
      />,
    );

    expect(screen.getByTestId("world-clock")).toHaveAttribute(
      "data-city",
      "Tokyo",
    );
  });

  it("passes the selected location id to the globe", () => {
    render(
      <DesktopLayout
        {...layoutProps({ selectedLocationId: "tokyo" })}
      />,
    );

    expect(screen.getByTestId("globe")).toHaveAttribute(
      "data-selected",
      "tokyo",
    );
  });

  it("passes solar state to both the globe and the atmosphere", () => {
    const solarState = { phase: "day", altitude: 45 };

    render(
      <DesktopLayout
        {...layoutProps({ solarState: solarState as never })}
      />,
    );

    expect(screen.getByTestId("globe")).toHaveAttribute(
      "data-solar",
      String(solarState),
    );
    expect(screen.getByTestId("globe-atmosphere")).toHaveAttribute(
      "data-solar",
      String(solarState),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* DesktopLayout — accessibility                                              */
/* -------------------------------------------------------------------------- */

describe("DesktopLayout — accessibility", () => {
  it("hides the atmosphere layer from assistive technology", () => {
    const { container } = render(
      <DesktopLayout {...layoutProps()} />,
    );

    const hidden = container.querySelector(
      'div[aria-hidden="true"]',
    );
    expect(hidden).not.toBeNull();
  });

  it("does not label the atmosphere layer", () => {
    /*
     * `aria-hidden="true"` is the correct signal for a purely
     * decorative layer; adding `aria-label` alongside would be
     * contradictory.
     */
    const { container } = render(
      <DesktopLayout {...layoutProps()} />,
    );

    const hidden = container.querySelector(
      'div[aria-hidden="true"]',
    );
    expect(hidden?.getAttribute("aria-label")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* MobileLayout — globe view                                                  */
/* -------------------------------------------------------------------------- */

describe("MobileLayout — globe view", () => {
  it("renders the globe", () => {
    render(<MobileLayout {...layoutProps()} view="globe" />);

    expect(screen.getByTestId("globe")).toBeInTheDocument();
  });

  it("does not render the world clock", () => {
    render(<MobileLayout {...layoutProps()} view="globe" />);

    expect(
      screen.queryByTestId("world-clock"),
    ).not.toBeInTheDocument();
  });

  it("renders a section with id explore", () => {
    const { container } = render(
      <MobileLayout {...layoutProps()} view="globe" />,
    );

    expect(
      container.querySelector("section#explore"),
    ).not.toBeNull();
  });

  it("renders the atmosphere layer", () => {
    render(<MobileLayout {...layoutProps()} view="globe" />);

    expect(
      screen.getByTestId("globe-atmosphere"),
    ).toBeInTheDocument();
  });

  it("passes the selected location id to the globe", () => {
    render(
      <MobileLayout
        {...layoutProps({ selectedLocationId: "tokyo" })}
        view="globe"
      />,
    );

    expect(screen.getByTestId("globe")).toHaveAttribute(
      "data-selected",
      "tokyo",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* MobileLayout — zones view                                                  */
/* -------------------------------------------------------------------------- */

describe("MobileLayout — zones view", () => {
  it("renders the world clock", () => {
    render(<MobileLayout {...layoutProps()} view="zones" />);

    expect(screen.getByTestId("world-clock")).toBeInTheDocument();
  });

  it("does not render the globe", () => {
    render(<MobileLayout {...layoutProps()} view="zones" />);

    expect(screen.queryByTestId("globe")).not.toBeInTheDocument();
  });

  it("does not render the atmosphere layer", () => {
    render(<MobileLayout {...layoutProps()} view="zones" />);

    expect(
      screen.queryByTestId("globe-atmosphere"),
    ).not.toBeInTheDocument();
  });

  it("passes the clock location to the world clock", () => {
    render(
      <MobileLayout
        {...layoutProps({ clockLocation: TOKYO })}
        view="zones"
      />,
    );

    expect(screen.getByTestId("world-clock")).toHaveAttribute(
      "data-city",
      "Tokyo",
    );
  });

  it("does not render the explore section id", () => {
    /*
     * The explore anchor only exists in globe view; leaving a
     * stale anchor in zones view would make the header's
     * "explore" nav link scroll to nothing.
     */
    const { container } = render(
      <MobileLayout {...layoutProps()} view="zones" />,
    );

    expect(
      container.querySelector("section#explore"),
    ).toBeNull();
  });

  it("labels the scroll container for assistive technology", () => {
    render(<MobileLayout {...layoutProps()} view="zones" />);

    expect(
      screen.getByLabelText("World clocks"),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-layout invariants                                                    */
/* -------------------------------------------------------------------------- */

describe("layout invariants", () => {
  it("both layouts render exactly one globe in globe mode", () => {
    const desktop = render(<DesktopLayout {...layoutProps()} />);
    expect(desktop.queryAllByTestId("globe")).toHaveLength(1);
    desktop.unmount();

    const mobile = render(
      <MobileLayout {...layoutProps()} view="globe" />,
    );
    expect(mobile.queryAllByTestId("globe")).toHaveLength(1);
  });

  it("both layouts render exactly one atmosphere in globe mode", () => {
    const desktop = render(<DesktopLayout {...layoutProps()} />);
    expect(
      desktop.queryAllByTestId("globe-atmosphere"),
    ).toHaveLength(1);
    desktop.unmount();

    const mobile = render(
      <MobileLayout {...layoutProps()} view="globe" />,
    );
    expect(
      mobile.queryAllByTestId("globe-atmosphere"),
    ).toHaveLength(1);
  });

  it("zones view unmounts the globe entirely", () => {
    /*
     * The globe holds a WebGL context; leaving it mounted
     * while the user is on the zones view would leak GPU
     * resources. This asserts the conditional actually
     * unmounts rather than hides.
     */
    const { rerender } = render(
      <MobileLayout {...layoutProps()} view="globe" />,
    );
    expect(screen.getByTestId("globe")).toBeInTheDocument();

    rerender(<MobileLayout {...layoutProps()} view="zones" />);
    expect(screen.queryByTestId("globe")).not.toBeInTheDocument();
  });
});