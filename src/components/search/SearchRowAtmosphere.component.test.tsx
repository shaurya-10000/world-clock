import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import SearchRowAtmosphere from "@/components/search/SearchRowAtmosphere";
import { resetTimeCache } from "@/lib/time";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

function freezeClock(ms: number): void {
  setUseNowDeps({
    now: () => ms,
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });
}

const MIDNIGHT_UTC = Date.UTC(2024, 0, 15, 0, 0, 0);
const NOON_UTC = Date.UTC(2024, 0, 15, 12, 0, 0);

beforeEach(() => {
  resetUseNow();
  resetTimeCache();
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — structure", () => {
  it("renders a fragment with three decorative layers", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    const layers = container.querySelectorAll('[aria-hidden="true"]');
    expect(layers.length).toBeGreaterThanOrEqual(3);
  });

  it("renders no interactive elements", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("uses pointer-events-none on every div layer", () => {
    /*
     * Scope the query to `<div>` elements. The `<svg>` icon
     * also carries `aria-hidden="true"` (Lucide forwards the
     * prop as an attribute) but is *inside* the icon wrapper
     * — it does not need `pointer-events-none` because its
     * parent already has it. Matching on every `[aria-hidden]`
     * element would falsely require the SVG itself to carry
     * the class.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    const layers = container.querySelectorAll(
      'div[aria-hidden="true"]',
    );

    expect(layers.length).toBeGreaterThanOrEqual(3);

    for (const layer of Array.from(layers)) {
      expect(layer.className).toContain("pointer-events-none");
    }
  });

  it("positions every div layer absolutely", () => {
    /*
     * Same scoping rule as the `pointer-events-none` test.
     * The three chrome layers are `<div>`s, each `absolute`.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    const layers = container.querySelectorAll(
      'div[aria-hidden="true"]',
    );

    expect(layers.length).toBeGreaterThanOrEqual(3);

    for (const layer of Array.from(layers)) {
      expect(layer.className).toContain("absolute");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Default props                                                              */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — default props", () => {
  it("does not include the hover transition by default", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    expect(container.innerHTML).not.toContain("group-hover:opacity-100");
  });

  it("uses size-14 for the icon by default", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("size-14");
  });

  it("uses the hidden sm:block wrapper for the icon by default", () => {
    /*
     * The icon is hidden on mobile (`< sm`) because the
     * row's right edge does not have enough room. The
     * wrapper carries the responsive class.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <div>
        <SearchRowAtmosphere timezone="UTC" />
      </div>,
    );

    expect(container.innerHTML).toContain("sm:block");
    expect(container.innerHTML).toContain("hidden");
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere variants                                                        */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — atmosphere variants", () => {
  it("renders without throwing in each atmosphere", () => {
    for (const [zone, epoch] of [
      ["UTC", MIDNIGHT_UTC],
      ["UTC", NOON_UTC],
    ] as const) {
      freezeClock(epoch);
      expect(() =>
        render(
          <div>
            <SearchRowAtmosphere timezone={zone} />
          </div>,
        ),
      ).not.toThrow();
    }
  });

  it("renders no interactive content in any atmosphere", () => {
    /*
     * The component is chrome only. This test runs the
     * interactive-content check across both the day and night
     * palettes, in case a future refactor added an
     * atmosphere-specific element by mistake.
     */
    for (const [zone, epoch] of [
      ["UTC", MIDNIGHT_UTC],
      ["UTC", NOON_UTC],
    ] as const) {
      freezeClock(epoch);

      const { container } = render(
        <div>
          <SearchRowAtmosphere timezone={zone} />
        </div>,
      );

      expect(
        container.querySelectorAll(
          'button, a[href], input, [tabindex]:not([tabindex="-1"])',
        ),
      ).toHaveLength(0);
    }
  });

  it("respects an explicit hoverHighlight across atmospheres", () => {
    for (const [zone, epoch] of [
      ["UTC", MIDNIGHT_UTC],
      ["UTC", NOON_UTC],
    ] as const) {
      freezeClock(epoch);

      const { container } = render(
        <div>
          <SearchRowAtmosphere
            timezone={zone}
            hoverHighlight
          />
        </div>,
      );

      expect(container.innerHTML).toContain(
        "group-hover:opacity-100",
      );
    }
  });
});