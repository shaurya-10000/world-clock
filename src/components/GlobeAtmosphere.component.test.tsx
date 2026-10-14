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
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — structure", () => {
  it("renders a single root element", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(container.children).toHaveLength(1);
  });

  it("root uses absolute inset-0 positioning", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    const root = container.firstElementChild;
    expect(root?.className).toContain("absolute");
    expect(root?.className).toContain("inset-0");
  });

  it("root uses overflow-hidden", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(
      container.firstElementChild?.className,
    ).toContain("overflow-hidden");
  });

  it("root has pointer-events-none", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(
      container.firstElementChild?.className,
    ).toContain("pointer-events-none");
  });

  it("renders a star field with the configured count", () => {
    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 0 })}
      />,
    );

    // 72 stars configured in the field.
    expect(countStars(container)).toBe(72);
  });

  it("does not render a top vignette", () => {
    /*
     * The component deliberately has no vignette fading into
     * `--background`. Fading a daytime sky into the near-black
     * page background produced a dark band at the top of the
     * section, and the sticky header already separates the
     * section from the page chrome.
     */
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(
      container.querySelector(
        ".bg-gradient-to-b.from-\\[var\\(--background\\)\\]",
      ),
    ).toBeNull();
  });

  it("does not render a bottom vignette", () => {
    /*
     * Same reasoning as the top vignette: no layer may fade
     * into `--background` at the bottom edge either. Any
     * class that references `var(--background)` would
     * reintroduce the dark band, so assert none exists.
     */
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(
      container.querySelector(
        ".bg-gradient-to-b.to-\\[var\\(--background\\)\\]",
      ),
    ).toBeNull();
    expect(
      container.querySelector('[class*="var(--background)"]'),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Sun glow element                                                           */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — sun glow element", () => {
  it("renders a single radial-gradient element", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    const glows = container.querySelectorAll(
      'div[style*="radial-gradient"]',
    );
    // The atmosphere's ambient layers also use radial
    // gradients, but they are rendered via Tailwind arbitrary
    // values (class names), not inline styles. Only the sun
    // glow uses an inline `background` with `radial-gradient`.
    expect(glows.length).toBeGreaterThanOrEqual(1);
  });

  it("uses a blur filter on the glow", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    const glow = container.querySelector(
      'div[style*="radial-gradient"]',
    ) as HTMLElement | undefined;

    expect(glow?.style.filter).toContain("blur");
  });

  it("uses vmax units for the glow size", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    const glow = container.querySelector(
      'div[style*="radial-gradient"]',
    ) as HTMLElement | undefined;

    expect(glow?.style.width).toBe("110vmax");
    expect(glow?.style.height).toBe("110vmax");
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — accessibility", () => {
  it("marks the root aria-hidden", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(
      container.firstElementChild?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("marks every layer aria-hidden", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    // Root + AtmosphereLayer + StarLayer wrapper = at least 3.
    expect(hidden.length).toBeGreaterThanOrEqual(3);
  });

  it("adds nothing to the tab order", () => {
    render(<GlobeAtmosphere solarState={solarState()} />);

    // No focusable elements should be present.
    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not expose any text content", () => {
    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(container.textContent).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("GlobeAtmosphere — reduced motion", () => {
  it("renders the same structure under reduced motion", () => {
    installMatchMedia(true);

    const { container } = render(
      <GlobeAtmosphere solarState={solarState()} />,
    );

    expect(container.children).toHaveLength(1);
    expect(countStars(container)).toBe(72);
  });

  it("still renders the star field under reduced motion", () => {
    installMatchMedia(true);

    const { container } = render(
      <GlobeAtmosphere
        solarState={solarState({ daylightFraction: 0 })}
      />,
    );

    // Reduced motion disables animation, not rendering.
    expect(countStars(container)).toBe(72);
  });
});