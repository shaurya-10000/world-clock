import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import GlobeAtmosphere from "@/components/GlobeAtmosphere";
import { resetTimeCache } from "@/lib/time";
import type { SolarState } from "@/lib/useSolarState";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function solarState(
  overrides: Partial<SolarState> = {},
): SolarState {
  return {
    dominantAtmosphere: "day",
    averageSolarElevation: 45,
    daylightFraction: 0.9,
    subsolarScreenPosition: { x: 0.5, y: 0.5 },
    ...overrides,
  };
}

function installMatchMedia(reducedMotion = false): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion")
          ? reducedMotion
          : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  });
}

function countStars(container: HTMLElement): number {
  return container.querySelectorAll(
    "span.absolute.rounded-full.bg-white",
  ).length;
}

beforeEach(() => {
  installMatchMedia(false);
  resetTimeCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Null-before-sampler default                                                */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — before the first sample", () => {
  it("renders without throwing when solarState is null", () => {
    expect(() =>
      render(<GlobeAtmosphere solarState={null} />),
    ).not.toThrow();
  });

  it("renders a container marked aria-hidden", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={null} />,
    );

    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the night palette before the first sample", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={null} />,
    );

    expect(container.innerHTML).toContain("#02050c");
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere source priority                                                 */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — atmosphere source priority", () => {
  it("renders the override palette when atmosphereOverride is set", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ dominantAtmosphere: "night" })}
        atmosphereOverride="day"
      />,
    );

    // The override wins; the day palette is rendered.
    expect(container.innerHTML).toContain("#15496c");
    expect(container.innerHTML).not.toContain("#02050c");
  });

  it("falls back to solarState.dominantAtmosphere when override is null", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ dominantAtmosphere: "dusk" })}
        atmosphereOverride={null}
      />,
    );

    expect(container.innerHTML).toContain("#101a31");
  });

  it("falls back to DEFAULT_ATMOSPHERE when both are null", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={null}
        atmosphereOverride={null}
      />,
    );

    // Default is "night".
    expect(container.innerHTML).toContain("#02050c");
  });

  it("accepts an override of every atmosphere", () => {
    const cases = [
      ["day", "#15496c"],
      ["dawn", "#19253b"],
      ["dusk", "#101a31"],
      ["night", "#02050c"],
    ] as const;

    for (const [atmosphere, hex] of cases) {
      const { container, unmount } = render(
        <GlobeAtmosphere
          solarState={solarState()}
          atmosphereOverride={atmosphere}
        />,
      );

      expect(container.innerHTML).toContain(hex);
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere layer                                                           */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — atmosphere layer", () => {
  it("renders the day palette when dominantAtmosphere is 'day'", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ dominantAtmosphere: "day" })}
      />,
    );

    expect(container.innerHTML).toContain("#15496c");
  });

  it("renders the night palette when dominantAtmosphere is 'night'", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({
          dominantAtmosphere: "night",
          daylightFraction: 0,
        })}
      />,
    );

    expect(container.innerHTML).toContain("#02050c");
  });

  it("renders the dawn palette when dominantAtmosphere is 'dawn'", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({
          dominantAtmosphere: "dawn",
          daylightFraction: 0.2,
        })}
      />,
    );

    expect(container.innerHTML).toContain("#19253b");
  });

  it("renders the dusk palette when dominantAtmosphere is 'dusk'", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({
          dominantAtmosphere: "dusk",
          daylightFraction: 0.3,
        })}
      />,
    );

    expect(container.innerHTML).toContain("#101a31");
  });
});

/* -------------------------------------------------------------------------- */
/* Sun glow position                                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — sun glow", () => {
  it("positions the glow at the projected subsolar point", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({
          subsolarScreenPosition: { x: 0.25, y: 0.75 },
        })}
      />,
    );

    const glow = container.querySelector(
      'div[style*="radial-gradient"]',
    );
    expect(glow).not.toBeNull();

    const style = (glow as HTMLElement).style;
    expect(style.left).toBe("25%");
    expect(style.top).toBe("75%");
  });

  it("falls back to center-screen when the subsolar position is null", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ subsolarScreenPosition: null })}
      />,
    );

    const glow = container.querySelector(
      'div[style*="radial-gradient"]',
    );
    expect(glow).not.toBeNull();

    const style = (glow as HTMLElement).style;
    expect(style.left).toBe("50%");
    expect(style.top).toBe("50%");
  });
});

/* -------------------------------------------------------------------------- */
/* Star field opacity                                                         */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — star field", () => {
  it("hides stars fully during daylight", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 1 })}
      />,
    );

    const root = container.firstElementChild;
    const wrappers = root?.querySelectorAll(
      ":scope > div[style*='opacity']",
    );
    const starWrapper = wrappers?.[1] as HTMLElement | undefined;

    expect(starWrapper).toBeDefined();
    expect(starWrapper?.style.opacity).toBe("0");
  });

  it("shows stars at full strength during deep night", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 0 })}
      />,
    );

    const root = container.firstElementChild;
    const wrappers = root?.querySelectorAll(
      ":scope > div[style*='opacity']",
    );
    const starWrapper = wrappers?.[1] as HTMLElement | undefined;

    expect(starWrapper?.style.opacity).toBe("1");
  });

  it("renders star elements when the disc is dark", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 0 })}
      />,
    );

    // 72 stars configured in the field. React `key` values
    // do not appear in the DOM, so we count rendered spans
    // by their distinctive class signature.
    expect(countStars(container)).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere intensity                                                       */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — atmosphere intensity", () => {
  it("peaks at 1.0 during full daylight", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 1 })}
      />,
    );

    const root = container.firstElementChild;
    const atmosphereWrapper = root?.querySelector(
      ":scope > div[style*='opacity']",
    ) as HTMLElement | undefined;

    expect(atmosphereWrapper?.style.opacity).toBe("1");
  });

  it("floors at 0.55 during full night", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({
          daylightFraction: 0,
          dominantAtmosphere: "night",
        })}
      />,
    );

    const root = container.firstElementChild;
    const atmosphereWrapper = root?.querySelector(
      ":scope > div[style*='opacity']",
    ) as HTMLElement | undefined;

    expect(atmosphereWrapper?.style.opacity).toBe("0.55");
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — reduced motion", () => {
  it("renders without throwing when prefers-reduced-motion matches", () => {
    installMatchMedia(true);

    expect(() =>
      render(
        <GlobeAtmosphere
          solarState={solarState({ dominantAtmosphere: "day" })}
        />,
      ),
    ).not.toThrow();
  });

  it("still renders the star field when reduced motion is set", () => {
    installMatchMedia(true);

    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 0 })}
      />,
    );

    expect(countStars(container)).toBeGreaterThan(0);
  });
});