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
import { getAtmosphereVisual } from "@/lib/atmosphere";
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
/* Atmosphere layer colors                                                    */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — atmosphere layer colors", () => {
  it("uses the night ambient background at UTC midnight", () => {
    freezeClock(MIDNIGHT_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    expect(container.innerHTML).toContain("#05070b");
  });

  it("uses the day ambient background at UTC noon", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    expect(container.innerHTML).toContain("#07111b");
  });

  it("selects a different palette for a zone at a different local hour", () => {
    /*
     * At UTC noon, UTC is hour 12 (day) and Tokyo is hour 21
     * (night). The rendered markup must differ — which is what
     * proves the atmosphere lookup is per-zone.
     */
    freezeClock(NOON_UTC);

    const { container: utc } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );
    const { container: tokyo } = render(
      <SearchRowAtmosphere timezone="Asia/Tokyo" />,
    );

    expect(utc.innerHTML).not.toBe(tokyo.innerHTML);
  });

  it("renders the atmosphere's glow layer for the classified atmosphere", () => {
    /*
     * The glow layer is a distinct class string from the
     * `lib/atmosphere` table. This test verifies the
     * component actually passes the visual's `glow` class
     * through to the second layer — a refactor that
     * accidentally dropped the second layer would fail this
     * even though the first layer's test would still pass.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    const dayVisual = getAtmosphereVisual("day");
    expect(container.innerHTML).toContain(
      dayVisual.ambient.glow,
    );
  });

  it("renders both the background and glow layers for every atmosphere", () => {
    for (const instant of [MIDNIGHT_UTC, NOON_UTC]) {
      freezeClock(instant);

      const { container } = render(
        <SearchRowAtmosphere timezone="UTC" />,
      );

      const html = container.innerHTML;
      const classMatch = html.match(
        /bg-\[radial-gradient[^"]*/g,
      );
      // At least the background and glow layers, both of
      // which start with `bg-[radial-gradient`.
      expect((classMatch ?? []).length).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Icon selection                                                             */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — icon selection", () => {
  it("renders an icon element", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("renders the sun icon when the local hour is day", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    expect(container.innerHTML).toContain("lucide-sun");
  });

  it("renders the moon icon when the local hour is night", () => {
    freezeClock(MIDNIGHT_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    expect(container.innerHTML).toContain("lucide-moon");
  });

  it("renders the cloud-sun icon during dusk", () => {
    /*
     * `America/Chicago` is UTC-6 in January. At UTC midnight
     * its local hour is 18:00, which classifies as dusk and
     * maps to the `cloud-sun` icon.
     */
    freezeClock(MIDNIGHT_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="America/Chicago" />,
    );

    expect(container.innerHTML).toContain("lucide-cloud-sun");
  });

  it("renders the icon with the visual's iconClass", () => {
    /*
     * The icon's color class comes from
     * `visual.iconClass`. Verifying it appears in the DOM
     * pins the contract that the visual's palette reaches
     * the rendered output.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    const dayVisual = getAtmosphereVisual("day");
    expect(container.innerHTML).toContain(dayVisual.iconClass);
  });
});

/* -------------------------------------------------------------------------- */
/* Hover highlight                                                            */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — hover highlight", () => {
  it("applies the hover transition when hoverHighlight is true", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" hoverHighlight />,
    );

    expect(container.innerHTML).toContain("group-hover:opacity-100");
  });

  it("omits the hover transition when hoverHighlight is false", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    expect(container.innerHTML).not.toContain("group-hover:opacity-100");
  });

  it("applies the hover transition only to the first layer", () => {
    /*
     * The hover highlight brightens only the base
     * background. If a refactor accidentally applied it to
     * the glow layer as well, the row would double-brighten
     * on hover — a subtle visual bug that only shows up when
     * the row is interacted with.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" hoverHighlight />,
    );

    const layers = Array.from(
      container.querySelectorAll('div[aria-hidden="true"]'),
    );

    const withHover = layers.filter((layer) =>
      layer.className.includes("group-hover:opacity-100"),
    );

    expect(withHover).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Icon size                                                                  */
/* -------------------------------------------------------------------------- */

describe("SearchRowAtmosphere — icon size", () => {
  it("uses the default icon size when none is given", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("size-14");
  });

  it("respects an explicit icon size", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" iconSize="size-12" />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("size-12");
  });

  it("does not include the default size class when a custom one is given", () => {
    /*
     * Class strings are joined without deduplication. If a
     * future refactor added `size-14` unconditionally, the
     * SVG would carry both `size-14` and `size-12`, and CSS
     * ordering (not intent) would decide the rendered size.
     * This test catches the double-class bug.
     */
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere timezone="UTC" iconSize="size-12" />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).not.toContain("size-14");
  });

  it("respects an arbitrary custom icon size", () => {
    freezeClock(NOON_UTC);

    const { container } = render(
      <SearchRowAtmosphere
        timezone="UTC"
        iconSize="size-[3.25rem]"
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain(
      "size-[3.25rem]",
    );
  });
});