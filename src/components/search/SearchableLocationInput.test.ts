import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  computePanelPosition,
  MAX_PANEL_WIDTH_PX,
  MIN_PANEL_WIDTH_PX,
  PANEL_VIEWPORT_MARGIN_PX,
} from "@/components/search/SearchableLocationInput";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build a minimal `HTMLElement`-shaped object whose only
 * meaningful method is `getBoundingClientRect`. The function
 * under test reads nothing else from the trigger — no class
 * list, no attributes, no children — so a stub with just the
 * one method is sufficient.
 */
function makeTrigger(
  rect: Partial<DOMRect>,
): HTMLElement {
  const full: DOMRect = {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  };

  return {
    getBoundingClientRect: () => full,
  } as unknown as HTMLElement;
}

/**
 * Replace `window.innerWidth` for the duration of a test. The
 * property is a getter on the `window` object in `happy-dom`,
 * so it must be redefined rather than assigned.
 */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

const ORIGINAL_INNER_WIDTH = window.innerWidth;

beforeEach(() => {
  setViewportWidth(ORIGINAL_INNER_WIDTH);
});

afterEach(() => {
  setViewportWidth(ORIGINAL_INNER_WIDTH);
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Top position                                                               */
/* -------------------------------------------------------------------------- */

describe("computePanelPosition — top", () => {
  it("places the panel 8px below the trigger", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 100, left: 40 });

    expect(computePanelPosition(trigger).top).toBe(108);
  });

  it("uses only the trigger's bottom edge for the top", () => {
    /*
     * `left`, `right`, `top`, and `width` on the trigger's
     * rect must not influence the panel's `top`. A refactor
     * that accidentally computed `top` from the trigger's
     * center or top edge would fail this.
     */
    setViewportWidth(1280);

    const trigger = makeTrigger({
      top: 900,
      bottom: 42,
      left: 500,
      width: 200,
    });

    expect(computePanelPosition(trigger).top).toBe(50);
  });

  it("handles a trigger at the very top of the viewport", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 0, left: 0 });

    expect(computePanelPosition(trigger).top).toBe(8);
  });

  it("handles a trigger with a negative top (partially scrolled off)", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ top: -20, bottom: 12, left: 40 });

    expect(computePanelPosition(trigger).top).toBe(20);
  });
});

/* -------------------------------------------------------------------------- */
/* Width computation                                                          */
/* -------------------------------------------------------------------------- */

describe("computePanelPosition — width", () => {
  it("uses MAX_PANEL_WIDTH_PX when the viewport is wide", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger).width).toBe(
      MAX_PANEL_WIDTH_PX,
    );
  });

  it("uses viewportWidth - 2·margin when the viewport is narrow", () => {
    /*
     * On a 360px viewport with a 12px margin,
     * `viewportWidth - 2·margin` is 336. That is above
     * `MIN_PANEL_WIDTH_PX` and below `MAX_PANEL_WIDTH_PX`,
     * so the width is exactly 336.
     */
    setViewportWidth(360);

    const trigger = makeTrigger({ bottom: 40, left: 40 });

    expect(computePanelPosition(trigger).width).toBe(
      360 - 2 * PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("clamps to MIN_PANEL_WIDTH_PX when the viewport is very narrow", () => {
    /*
     * On a 300px viewport, `Math.max(MIN, 300 - 2·margin)` is
     * `MIN` (the floor). This is deliberately larger than the
     * viewport would allow with margins — the panel is
     * allowed to overflow horizontally on extremely narrow
     * screens rather than become unusably small.
     */
    setViewportWidth(300);

    const trigger = makeTrigger({ bottom: 40, left: 40 });

    expect(computePanelPosition(trigger).width).toBe(
      MIN_PANEL_WIDTH_PX,
    );
  });

  it("uses MIN_PANEL_WIDTH_PX as the floor even on a zero-width viewport", () => {
    setViewportWidth(0);

    const trigger = makeTrigger({ bottom: 40, left: 40 });

    expect(computePanelPosition(trigger).width).toBe(
      MIN_PANEL_WIDTH_PX,
    );
  });

  it("uses MAX_PANEL_WIDTH_PX as the ceiling even on an ultra-wide viewport", () => {
    setViewportWidth(3840);

    const trigger = makeTrigger({ bottom: 40, left: 1000 });

    expect(computePanelPosition(trigger).width).toBe(
      MAX_PANEL_WIDTH_PX,
    );
  });

  it("uses 2 × PANEL_VIEWPORT_MARGIN_PX as the total horizontal inset", () => {
    /*
     * ## Why this test exists
     *
     * The width formula subtracts `2 · PANEL_VIEWPORT_MARGIN_PX`
     * from the viewport to leave one margin on each side. An
     * earlier version of the component hardcoded the literal
     * `24` in this position, which happened to equal
     * `2 · 12` — but would silently decouple from the margin
     * constant if the latter ever changed.
     *
     * This test pins the coupling directly: at a viewport
     * width where the panel is limited by `viewportWidth -
     * 2·margin` (not by either the min or max clamp), the
     * computed width must equal that expression exactly.
     *
     * ## Why the viewport is `400`, not `600`
     *
     * The middle regime is the interval
     * `MIN + 2·margin < viewportWidth < MAX + 2·margin`,
     * which is `344 < viewportWidth < 444`. A viewport of
     * `600` is above that range — `600 - 2·12 = 576`, but
     * `Math.min(576, MAX=420)` clamps to `420`, so the
     * ceiling regime is what the width computation actually
     * hits. An earlier version of this test used `600` and
     * asserted `600 - 2·margin`, which was always wrong: the
     * returned width was `MAX`, not `600 - 2·margin`.
     *
     * `400` is inside the middle regime: `400 - 24 = 376`,
     * which is above `MIN=320` and below `MAX=420`, so the
     * width formula's middle branch is what determines the
     * result.
     */
    setViewportWidth(400);

    const trigger = makeTrigger({ bottom: 40, left: 40 });

    expect(computePanelPosition(trigger).width).toBe(
      400 - 2 * PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("produces exactly MAX_PANEL_WIDTH_PX at the transition viewport width", () => {
    /*
     * `viewportWidth - 2·margin === MAX_PANEL_WIDTH_PX` when
     * `viewportWidth === MAX + 2·margin`. At that boundary,
     * both the middle regime and the ceiling regime produce
     * `MAX`. One pixel larger, the ceiling still wins. One
     * pixel smaller, the middle regime wins. The transition is
     * sharp and this test pins it.
     */
    setViewportWidth(
      MAX_PANEL_WIDTH_PX + 2 * PANEL_VIEWPORT_MARGIN_PX,
    );

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger).width).toBe(
      MAX_PANEL_WIDTH_PX,
    );
  });

  it("produces viewportWidth - 2·margin one pixel below the transition", () => {
    setViewportWidth(
      MAX_PANEL_WIDTH_PX + 2 * PANEL_VIEWPORT_MARGIN_PX - 1,
    );

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger).width).toBe(
      MAX_PANEL_WIDTH_PX - 1,
    );
  });

  it("produces exactly MIN_PANEL_WIDTH_PX at the floor boundary", () => {
    /*
     * `viewportWidth - 2·margin === MIN_PANEL_WIDTH_PX` when
     * `viewportWidth === MIN + 2·margin`. At that boundary the
     * floor and the middle regime agree on `MIN`.
     */
    setViewportWidth(
      MIN_PANEL_WIDTH_PX + 2 * PANEL_VIEWPORT_MARGIN_PX,
    );

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger).width).toBe(
      MIN_PANEL_WIDTH_PX,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Left clamping                                                              */
/* -------------------------------------------------------------------------- */

describe("computePanelPosition — left clamping", () => {
  it("leaves a trigger that fits comfortably inside the viewport", () => {
    /*
     * Viewport 1280, panel width MAX, margin PANEL. The
     * maximum left edge that keeps the panel on-screen is
     * `1280 - MAX - PANEL`. A trigger well inside that range
     * keeps its own left.
     */
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger).left).toBe(100);
  });

  it("clamps the left edge to PANEL_VIEWPORT_MARGIN_PX", () => {
    /*
     * A trigger that starts off the left edge of the
     * viewport — e.g. during a rubber-band scroll on iOS —
     * would produce a negative panel left. The clamp brings
     * it to the margin.
     */
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: -50 });

    expect(computePanelPosition(trigger).left).toBe(
      PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("clamps the left edge to the max-left that keeps the panel on-screen", () => {
    /*
     * A trigger near the right edge of a wide viewport —
     * e.g. after the chrome row is right-aligned — would
     * place the panel's right edge past the viewport. The
     * clamp pulls the panel back so its right edge lands
     * exactly at `viewportWidth - margin`.
     */
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 1200 });

    expect(computePanelPosition(trigger).left).toBe(
      1280 - MAX_PANEL_WIDTH_PX - PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("clamps to the max-left even when the trigger is fully off-screen to the right", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 5000 });

    expect(computePanelPosition(trigger).left).toBe(
      1280 - MAX_PANEL_WIDTH_PX - PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("places the panel at the margin when the trigger is at left 0", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 0 });

    expect(computePanelPosition(trigger).left).toBe(
      PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("places the panel at the margin when the trigger is exactly at the margin", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({
      bottom: 40,
      left: PANEL_VIEWPORT_MARGIN_PX,
    });

    expect(computePanelPosition(trigger).left).toBe(
      PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("places the panel at the max-left when the trigger is exactly at the max-left", () => {
    setViewportWidth(1280);

    const maxLeft =
      1280 - MAX_PANEL_WIDTH_PX - PANEL_VIEWPORT_MARGIN_PX;
    const trigger = makeTrigger({ bottom: 40, left: maxLeft });

    expect(computePanelPosition(trigger).left).toBe(maxLeft);
  });

  it("uses the same constant for the width and the left clamp", () => {
    /*
     * ## Why this test exists
     *
     * The margin appears in two places: as half the total
     * inset in the width formula, and as the left-clamp floor
     * in the left formula. A change to the constant that
     * missed one of the two would produce a panel that
     * overflows by the delta, on the side whose formula was
     * not updated.
     *
     * This test constructs a case where the two uses are
     * observable together: on a viewport where the panel is
     * at its max width and the trigger is off the left edge,
     * the panel's `left` must be exactly
     * `PANEL_VIEWPORT_MARGIN_PX`, and the panel's right edge
     * (`left + width`) must be at most
     * `viewportWidth - PANEL_VIEWPORT_MARGIN_PX`.
     */
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: -100 });
    const { left, width } = computePanelPosition(trigger);

    expect(left).toBe(PANEL_VIEWPORT_MARGIN_PX);
    expect(left + width).toBeLessThanOrEqual(
      1280 - PANEL_VIEWPORT_MARGIN_PX,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Narrow-viewport edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe("computePanelPosition — narrow viewports", () => {
  it("places the panel at the margin when the panel is wider than the viewport allows", () => {
    /*
     * On a 300px viewport with the floor applied, the panel
     * is wider than the viewport minus margins. The
     * `maxLeft` computation is negative, and the outer
     * `Math.max` brings the result to the left margin, so the
     * panel anchors to the left edge and overflows to the
     * right. This is the documented behavior — the panel
     * prefers to overflow than to shrink below its minimum
     * usable width.
     */
    setViewportWidth(300);

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger).left).toBe(
      PANEL_VIEWPORT_MARGIN_PX,
    );
  });

  it("never produces a negative left edge", () => {
    for (const viewportWidth of [0, 100, 200, 300, 360]) {
      setViewportWidth(viewportWidth);

      const trigger = makeTrigger({ bottom: 40, left: 0 });
      const { left } = computePanelPosition(trigger);

      expect(left).toBeGreaterThanOrEqual(0);
    }
  });

  it("never produces a negative width", () => {
    for (const viewportWidth of [0, 100, 200, 300, 360]) {
      setViewportWidth(viewportWidth);

      const trigger = makeTrigger({ bottom: 40, left: 0 });
      const { width } = computePanelPosition(trigger);

      expect(width).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Return shape and purity                                                    */
/* -------------------------------------------------------------------------- */

describe("computePanelPosition — return shape and purity", () => {
  it("returns exactly three numeric fields", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 100 });
    const result = computePanelPosition(trigger);

    expect(Object.keys(result).sort()).toEqual([
      "left",
      "top",
      "width",
    ]);
    expect(typeof result.top).toBe("number");
    expect(typeof result.left).toBe("number");
    expect(typeof result.width).toBe("number");
  });

  it("returns finite numbers for realistic inputs", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 100 });
    const result = computePanelPosition(trigger);

    expect(Number.isFinite(result.top)).toBe(true);
    expect(Number.isFinite(result.left)).toBe(true);
    expect(Number.isFinite(result.width)).toBe(true);
  });

  it("is deterministic — same trigger and viewport, same output", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 100 });

    expect(computePanelPosition(trigger)).toEqual(
      computePanelPosition(trigger),
    );
  });

  it("returns a fresh object on each call", () => {
    setViewportWidth(1280);

    const trigger = makeTrigger({ bottom: 40, left: 100 });
    const a = computePanelPosition(trigger);
    const b = computePanelPosition(trigger);

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("does not mutate the trigger", () => {
    setViewportWidth(1280);

    const rect = {
      top: 10,
      bottom: 40,
      left: 100,
      right: 200,
      width: 100,
      height: 30,
      x: 100,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect;

    const trigger = makeTrigger(rect);
    const snapshot = { ...rect };

    computePanelPosition(trigger);

    expect(rect).toEqual(snapshot);
  });

  it("calls getBoundingClientRect exactly once per invocation", () => {
    setViewportWidth(1280);

    const getBoundingClientRect = vi.fn(() => ({
      top: 0,
      bottom: 40,
      left: 100,
      right: 200,
      width: 100,
      height: 40,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })) as unknown as () => DOMRect;

    const trigger = {
      getBoundingClientRect,
    } as unknown as HTMLElement;

    computePanelPosition(trigger);

    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
  });
});