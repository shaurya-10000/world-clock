import { describe, expect, it, vi } from "vitest";

import {
  createMarkerClickHandler,
  pickCardOffsetClasses,
  pickMarkerColor,
} from "@/components/globe/GlobeMarker";
import {
  MARKER_COLOR,
  MARKER_COLOR_FAVORITED,
  MARKER_COLOR_SELECTED,
} from "@/components/globe/constants";
import type { WorldLocation } from "@/lib/locations";

const LOCATION: WorldLocation = {
  id: "test-loc",
  city: "Testville",
  country: "Testland",
  timezone: "UTC",
  latitude: 0,
  longitude: 0,
  continent: "north-america",
  globeTiers: ["major"],
};

/* -------------------------------------------------------------------------- */
/* pickMarkerColor                                                            */
/* -------------------------------------------------------------------------- */

describe("pickMarkerColor", () => {
  it("returns the unselected gray for an unfavorited, unselected marker", () => {
    expect(pickMarkerColor(false, false)).toBe(MARKER_COLOR);
  });

  it("returns the selected gold for an unfavorited, selected marker", () => {
    expect(pickMarkerColor(false, true)).toBe(MARKER_COLOR_SELECTED);
  });

  it("returns the favorite pink for a favorited, unselected marker", () => {
    expect(pickMarkerColor(true, false)).toBe(MARKER_COLOR_FAVORITED);
  });

  it("returns the favorite pink for a favorited, selected marker", () => {
    expect(pickMarkerColor(true, true)).toBe(MARKER_COLOR_FAVORITED);
  });

  it("gives favorites precedence over selection", () => {
    expect(pickMarkerColor(true, true)).not.toBe(MARKER_COLOR_SELECTED);
  });

  it("returns a 6-digit hex color in every branch", () => {
    const hex = /^#[0-9a-f]{6}$/i;
    expect(pickMarkerColor(false, false)).toMatch(hex);
    expect(pickMarkerColor(false, true)).toMatch(hex);
    expect(pickMarkerColor(true, false)).toMatch(hex);
    expect(pickMarkerColor(true, true)).toMatch(hex);
  });

  it("is deterministic — the same inputs produce the same output", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(pickMarkerColor(true, false)).toBe(
        MARKER_COLOR_FAVORITED,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* pickCardOffsetClasses                                                      */
/* -------------------------------------------------------------------------- */

describe("pickCardOffsetClasses", () => {
  it("returns a negative translate for the left side", () => {
    const classes = pickCardOffsetClasses("left");
    expect(classes).toContain("-translate-x-3");
    expect(classes).toContain("sm:-translate-x-6");
  });

  it("returns a positive translate for the right side", () => {
    const classes = pickCardOffsetClasses("right");
    expect(classes).toContain("translate-x-3");
    expect(classes).toContain("sm:translate-x-6");
  });

  it("returns different class strings for the two sides", () => {
    expect(pickCardOffsetClasses("left")).not.toBe(
      pickCardOffsetClasses("right"),
    );
  });

  it("includes exactly two class tokens, one base and one responsive", () => {
    for (const side of ["left", "right"] as const) {
      const tokens = pickCardOffsetClasses(side).split(" ");
      expect(tokens).toHaveLength(2);
      expect(tokens.filter((t) => t.startsWith("sm:"))).toHaveLength(
        1,
      );
    }
  });

  it("is deterministic across calls", () => {
    expect(pickCardOffsetClasses("left")).toBe(
      pickCardOffsetClasses("left"),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* createMarkerClickHandler                                                   */
/* -------------------------------------------------------------------------- */

describe("createMarkerClickHandler", () => {
  it("stops propagation on every click", () => {
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      LOCATION,
      false,
      onSelect,
    );
    const event = { stopPropagation: vi.fn() };

    handler(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect with the location when not traveling", () => {
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      LOCATION,
      false,
      onSelect,
    );

    handler({ stopPropagation: vi.fn() });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(LOCATION);
  });

  it("does not call onSelect while traveling", () => {
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      LOCATION,
      true,
      onSelect,
    );

    handler({ stopPropagation: vi.fn() });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("stops propagation even while traveling", () => {
    const handler = createMarkerClickHandler(
      LOCATION,
      true,
      vi.fn(),
    );
    const event = { stopPropagation: vi.fn() };

    handler(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("passes the exact location object to onSelect", () => {
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      LOCATION,
      false,
      onSelect,
    );

    handler({ stopPropagation: vi.fn() });

    expect(onSelect.mock.calls[0]?.[0]).toBe(LOCATION);
  });

  it("returns a new handler per invocation", () => {
    const a = createMarkerClickHandler(LOCATION, false, vi.fn());
    const b = createMarkerClickHandler(LOCATION, false, vi.fn());
    expect(a).not.toBe(b);
  });

  it("is idempotent — two clicks on the same handler fire onSelect twice", () => {
    /*
     * The handler is stateless. A second click must produce a
     * second call; the previous click must not have consumed
     * anything.
     */
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      LOCATION,
      false,
      onSelect,
    );

    handler({ stopPropagation: vi.fn() });
    handler({ stopPropagation: vi.fn() });

    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});