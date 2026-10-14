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

import Globe from "@/components/Globe";
import type { Atmosphere } from "@/lib/atmosphere";
import {
  globeAtmosphereRef,
  resetGlobeAtmosphereContext,
} from "@/components/globe/globeAtmosphereContext";

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/globe/GlobeCanvasBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="canvas-boundary">{children}</div>
  ),
}));

vi.mock("@/components/GlobeCanvas", () => ({
  default: ({
    reducedMotion,
    globeTier,
  }: {
    reducedMotion: boolean;
    globeTier: string;
  }) => (
    <div
      data-testid="globe-canvas"
      data-reduced-motion={String(reducedMotion)}
      data-tier={globeTier}
    />
  ),
}));

vi.mock("@/components/search/SearchableLocationInput", () => ({
  default: () => <div data-testid="search" />,
}));

vi.mock("@/components/globe/VisualModeToggle", () => ({
  default: () => <div data-testid="visual-mode-toggle" />,
  VISUAL_MODES: [
    { value: "minimal", label: "Minimal" },
    { value: "realistic", label: "Realistic" },
  ],
}));

vi.mock("@/components/globe/AstronomicalEventPicker", () => ({
  default: () => <div data-testid="astronomical-picker" />,
}));

vi.mock("@/components/globe/TimeOverrideBanner", () => ({
  default: () => <div data-testid="time-override-banner" />,
}));

vi.mock("@/components/globe/GlobeSizeToggle", () => ({
  default: ({
    stepIndex,
    stepCount,
  }: {
    stepIndex: number;
    stepCount: number;
  }) => (
    <div
      data-testid="globe-size-toggle"
      data-step={stepIndex}
      data-count={stepCount}
    />
  ),
}));

vi.mock("@/lib/useVisualMode", () => ({
  useVisualMode: () => ({
    visualMode: "minimal",
    setVisualMode: vi.fn(),
  }),
}));

vi.mock("@/components/globe/useAstronomicalEventPicker", () => ({
  useAstronomicalEventPicker: () => ({
    events: [],
    activeEventId: null,
    dispatch: vi.fn(),
  }),
}));

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  });

  resetGlobeAtmosphereContext();
});

afterEach(() => {
  resetGlobeAtmosphereContext();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderGlobe(
  overrides: Partial<React.ComponentProps<typeof Globe>> = {},
) {
  const props: React.ComponentProps<typeof Globe> = {
    selectedLocationId: null,
    onLocationSelect: vi.fn(),
    solarState: null,
    onSolarChange: vi.fn(),
    ...overrides,
  };
  render(<Globe {...props} />);
  return props;
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("Globe — structure", () => {
  it("renders a region landmark", () => {
    renderGlobe();

    expect(
      screen.getByRole("region", {
        name: /Interactive 3D world globe/,
      }),
    ).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderGlobe();

    expect(screen.getByTestId("search")).toBeInTheDocument();
  });

  it("renders the tier selector", () => {
    renderGlobe();

    expect(
      screen.getByRole("radiogroup", { name: "Globe display mode" }),
    ).toBeInTheDocument();
  });

  it("renders the canvas inside the boundary", () => {
    renderGlobe();

    expect(
      screen.getByTestId("canvas-boundary"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("globe-canvas"),
    ).toBeInTheDocument();
  });

  it("renders the visual mode toggle", () => {
    renderGlobe();

    expect(
      screen.getByTestId("visual-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("renders the astronomical event picker", () => {
    renderGlobe();

    expect(
      screen.getByTestId("astronomical-picker"),
    ).toBeInTheDocument();
  });

  it("renders the size toggle", () => {
    renderGlobe();

    expect(
      screen.getByTestId("globe-size-toggle"),
    ).toBeInTheDocument();
  });

  it("renders the time-override banner", () => {
    renderGlobe();

    expect(
      screen.getByTestId("time-override-banner"),
    ).toBeInTheDocument();
  });

  it("renders the reset-north button", () => {
    renderGlobe();

    expect(
      screen.getByRole("button", {
        name: "Reset globe to north-up orientation",
      }),
    ).toBeInTheDocument();
  });

  it("wraps everything in a single root element", () => {
    const { container } = render(
      <Globe
        selectedLocationId={null}
        onLocationSelect={vi.fn()}
        solarState={null}
        onSolarChange={vi.fn()}
      />,
    );

    expect(container.children).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Tier options                                                               */
/* -------------------------------------------------------------------------- */

describe("Globe — tier options", () => {
  it("renders both tier options", () => {
    renderGlobe();

    expect(
      screen.getByRole("radio", { name: /Major Cities/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /All Cities/ }),
    ).toBeInTheDocument();
  });

  it("renders the active tier's count", () => {
    renderGlobe();

    const majorOption = screen.getByRole("radio", {
      name: /Major Cities/,
    });
    expect(majorOption.textContent).toMatch(/\d+/);
  });

  it("marks the active option with aria-checked=true", () => {
    renderGlobe();

    expect(
      screen.getByRole("radio", { name: /Major Cities/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("marks the inactive option with aria-checked=false", () => {
    renderGlobe();

    expect(
      screen.getByRole("radio", { name: /All Cities/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("only the active option is in the tab order", () => {
    renderGlobe();

    expect(
      screen.getByRole("radio", { name: /Major Cities/ }),
    ).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByRole("radio", { name: /All Cities/ }),
    ).toHaveAttribute("tabindex", "-1");
  });
});

/* -------------------------------------------------------------------------- */
/* User interaction                                                           */
/* -------------------------------------------------------------------------- */

describe("Globe — user interaction", () => {
  it("switches tier on click", () => {
    renderGlobe();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
      "data-tier",
      "all",
    );
  });

  it("switches back to Major on the second click", () => {
    renderGlobe();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Major Cities/ }),
    );

    expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
      "data-tier",
      "major",
    );
  });

  it("updates aria-checked when switching tiers", () => {
    renderGlobe();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    expect(
      screen.getByRole("radio", { name: /All Cities/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /Major Cities/ }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

/* -------------------------------------------------------------------------- */
/* Canvas props                                                               */
/* -------------------------------------------------------------------------- */

describe("Globe — canvas props", () => {
  it("passes reducedMotion=false by default", () => {
    renderGlobe();

    expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
      "data-reduced-motion",
      "false",
    );
  });

  it("passes the active tier to the canvas", () => {
    renderGlobe();

    expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
      "data-tier",
      "major",
    );
  });

  it("passes reducedMotion=true when the media query matches", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList,
    });

    renderGlobe();

    expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* onAtmosphereChange polling                                                 */
/* -------------------------------------------------------------------------- */

/*
 * ## Why this block exists
 *
 * `Globe.tsx` polls `globeAtmosphereRef` at `SAMPLE_INTERVAL_MS`
 * and calls `onAtmosphereChange` whenever the value changes.
 * The ref's initial value is `null` ("no sample yet"), and the
 * poller must not publish that — a spurious first publish
 * would flash a default atmosphere (historically `"night"`) in
 * the background for one render, before the sampler had
 * emitted anything.
 *
 * The tests below drive the poll with fake timers. They set
 * the ref directly to simulate the sampler's writes, advance
 * time, and assert on the callback.
 *
 * ## Why `vi.useFakeTimers` and `act`
 *
 * The `tick` function calls `onAtmosphereChange`, which
 * typically updates the parent's React state. React requires
 * state updates driven by timers to be wrapped in `act()`, and
 * fake timers are how we control when the interval fires. Both
 * together give a deterministic test that does not depend on
 * real wall-clock time.
 */

describe("Globe — onAtmosphereChange polling", () => {
  it("does not call onAtmosphereChange when the ref is null on mount", () => {
    /*
     * The ref is initialized to `null` by
     * `resetGlobeAtmosphereContext` (called in `beforeEach`).
     * The mount-time `tick()` must not publish `null`.
     */
    vi.useFakeTimers();

    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    expect(onAtmosphereChange).not.toHaveBeenCalled();

    /* A few poll cycles with the ref still null. */
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onAtmosphereChange).not.toHaveBeenCalled();
  });

  it("calls onAtmosphereChange once the ref is populated", () => {
    vi.useFakeTimers();

    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    /* Simulate the sampler writing a value. */
    globeAtmosphereRef.current = "day";

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onAtmosphereChange).toHaveBeenCalledTimes(1);
    expect(onAtmosphereChange).toHaveBeenCalledWith("day");
  });

  it("picks up a value written before the first poll tick", () => {
    /*
     * The mount-time `tick()` runs synchronously inside the
     * effect. If the ref is already populated by the time the
     * effect runs (which can happen if the sampler is mounted
     * first), the callback fires immediately.
     */
    vi.useFakeTimers();

    globeAtmosphereRef.current = "dusk";

    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    expect(onAtmosphereChange).toHaveBeenCalledTimes(1);
    expect(onAtmosphereChange).toHaveBeenCalledWith("dusk");
  });

  it("does not call onAtmosphereChange twice for the same value", () => {
    vi.useFakeTimers();

    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    globeAtmosphereRef.current = "day";

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    /* Still only one call — the ref has not changed since. */
    expect(onAtmosphereChange).toHaveBeenCalledTimes(1);
  });

  it("calls onAtmosphereChange once per distinct value change", () => {
    vi.useFakeTimers();

    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    globeAtmosphereRef.current = "day";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    globeAtmosphereRef.current = "dusk";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    globeAtmosphereRef.current = "dusk";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    globeAtmosphereRef.current = "night";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onAtmosphereChange.mock.calls).toEqual([
      ["day"],
      ["dusk"],
      ["night"],
    ]);
  });

  it("does not poll when onAtmosphereChange is not provided", () => {
    /*
     * The effect short-circuits on `!onAtmosphereChange`. No
     * interval should be created; the ref can change freely
     * without any observable effect.
     */
    vi.useFakeTimers();

    renderGlobe();

    expect(() => {
      globeAtmosphereRef.current = "day";
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }).not.toThrow();
  });

  it("cleans up the polling interval on unmount", () => {
    /*
     * A leaked interval would keep firing after unmount. The
     * observable consequence is that the parent callback would
     * be called after unmount, which in a real app means a
     * "setState on unmounted component" warning. This test
     * pins the cleanup.
     */
    vi.useFakeTimers();

    const onAtmosphereChange = vi.fn();
    const { unmount } = render(
      <Globe
        selectedLocationId={null}
        onLocationSelect={vi.fn()}
        solarState={null}
        onSolarChange={vi.fn()}
        onAtmosphereChange={onAtmosphereChange}
      />,
    );

    unmount();

    globeAtmosphereRef.current = "day";

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onAtmosphereChange).not.toHaveBeenCalled();
  });

  it("preserves the exact value type through the callback", () => {
    /*
     * The callback is typed `(atmosphere: Atmosphere | null) =>
     * void`. The poller only ever calls it with a real
     * `Atmosphere` today, but the type says `| null` for future
     * consumers. This test pins that the value passed today is
     * a valid `Atmosphere`.
     */
    vi.useFakeTimers();

    const received: Atmosphere[] = [];
    renderGlobe({
      onAtmosphereChange: (a) => {
        if (a !== null) received.push(a);
      },
    });

    globeAtmosphereRef.current = "dawn";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(received).toEqual(["dawn"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("Globe — accessibility", () => {
  it("region has an accessible name", () => {
    renderGlobe();

    expect(
      screen.getByRole("region", {
        name: /Interactive 3D world globe/,
      }),
    ).toBeInTheDocument();
  });

  it("tier selector exposes a radiogroup", () => {
    renderGlobe();

    expect(
      screen.getByRole("radiogroup", { name: "Globe display mode" }),
    ).toBeInTheDocument();
  });

  it("every radio has an accessible name", () => {
    renderGlobe();

    const radios = screen.getAllByRole("radio");

    for (const radio of radios) {
      expect(
        radio.textContent?.trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it("reset-north button has an accessible name", () => {
    renderGlobe();

    expect(
      screen.getByRole("button", {
        name: "Reset globe to north-up orientation",
      }),
    ).toHaveAccessibleName();
  });
});