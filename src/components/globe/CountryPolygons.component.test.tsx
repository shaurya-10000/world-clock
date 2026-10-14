import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* -------------------------------------------------------------------------- */
/* three-globe mock                                                           */
/* -------------------------------------------------------------------------- */

/*
 * ## Why `three-globe` is mocked
 *
 * `three-globe` constructs a THREE object graph on
 * instantiation and configures it through a fluent API. The
 * component only calls that API — the resulting graph is
 * consumed by R3F's reconciler inside a real Canvas, which is
 * not available in a unit test.
 *
 * The mock replaces the class with a spy-recording stub. Each
 * method call is recorded so the tests can assert on the
 * sequence of configuration calls the component makes, and
 * every method returns `this` so the fluent chain resolves.
 */

const instanceSpies = {
  showGlobe: vi.fn(),
  polygonsData: vi.fn(),
  polygonCapColor: vi.fn(),
  polygonSideColor: vi.fn(),
  polygonStrokeColor: vi.fn(),
  polygonAltitude: vi.fn(),
  clear: vi.fn(),
  traverse: vi.fn(),
  setScalar: vi.fn(),
};

vi.mock("three-globe", () => {
  class MockThreeGlobe {
    scale = { setScalar: instanceSpies.setScalar };

    showGlobe(...args: unknown[]) {
      instanceSpies.showGlobe(...args);
      return this;
    }
    polygonsData(...args: unknown[]) {
      instanceSpies.polygonsData(...args);
      return this;
    }
    polygonCapColor(...args: unknown[]) {
      instanceSpies.polygonCapColor(...args);
      return this;
    }
    polygonSideColor(...args: unknown[]) {
      instanceSpies.polygonSideColor(...args);
      return this;
    }
    polygonStrokeColor(...args: unknown[]) {
      instanceSpies.polygonStrokeColor(...args);
      return this;
    }
    polygonAltitude(...args: unknown[]) {
      instanceSpies.polygonAltitude(...args);
      return this;
    }
    clear(...args: unknown[]) {
      instanceSpies.clear(...args);
      return this;
    }
    traverse(cb: (o: unknown) => void) {
      instanceSpies.traverse(cb);
    }
  }
  return { default: MockThreeGlobe };
});

/*
 * ## Why `@react-three/fiber` is NOT mocked
 *
 * `<primitive object={globe} />` is an R3F intrinsic — a
 * string tag that R3F's reconciler intercepts inside a real
 * `<Canvas>`. Outside a Canvas, React's DOM renderer treats it
 * as an unknown HTML element. `vi.mock("@react-three/fiber",
 * ...)` cannot replace it: `primitive` is not a module export,
 * so there is nothing to intercept.
 *
 * The component's own tests therefore do not assert against
 * the DOM the primitive would nominally render to — they
 * assert against the `three-globe` instance spies, which is
 * where the component's real work happens. See the file
 * header of `RealisticEarthSphere.component.test.tsx` for the
 * same reasoning.
 *
 * The React warning the primitive emits ("The tag <primitive>
 * is unrecognized in this browser") is filtered by
 * `vitest.setup.ts`.
 */

import CountryPolygons from "@/components/globe/CountryPolygons";
import {
  POLYGON_ALTITUDE,
  POLYGON_CAP_COLOR,
  POLYGON_SIDE_COLOR,
  POLYGON_STROKE_COLOR,
} from "@/components/globe/constants";
import { GLOBE_SCALE } from "@/lib/globe-geometry";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

describe("CountryPolygons — lifecycle", () => {
  it("configures the three-globe instance during the effect", () => {
    /*
     * ## Why this test used to be called "returns null on the
     * ## initial render"
     *
     * The component's initial render returns `null` because
     * its `globe` state starts empty. But React Testing
     * Library flushes passive effects synchronously after
     * `render()` returns, and the effect synchronously calls
     * `setGlobe(instance)`. By the time the test body runs,
     * the component has already re-rendered with the
     * populated state.
     *
     * The initial-`null` return is therefore not observable
     * via `container.firstChild` from this test setup. The
     * observable consequence of the effect running is that
     * `showGlobe(false)` was called — so this test asserts on
     * that instead, and its name reflects what is actually
     * being verified.
     */
    render(<CountryPolygons />);

    expect(instanceSpies.showGlobe).toHaveBeenCalledWith(false);
  });

  it("performs its setup during the passive-effect flush", () => {
    /*
     * `render` flushes passive effects synchronously, so the
     * three-globe instance is fully configured by the time this
     * assertion runs. We assert against the instance spies rather
     * than the DOM because `<primitive>` is owned by
     * `@react-three/fiber` and is a no-op outside a real Canvas.
     */
    render(<CountryPolygons />);
    expect(instanceSpies.polygonsData).toHaveBeenCalledTimes(1);
    expect(instanceSpies.polygonAltitude).toHaveBeenCalledTimes(1);
  });

  it("hides the base globe on the three-globe instance", () => {
    render(<CountryPolygons />);
    expect(instanceSpies.showGlobe).toHaveBeenCalledWith(false);
  });

  it("configures the polygon layer with the configured colors and altitude", () => {
    render(<CountryPolygons />);
    expect(instanceSpies.polygonsData).toHaveBeenCalledTimes(1);
    expect(instanceSpies.polygonCapColor).toHaveBeenCalledTimes(1);
    expect(instanceSpies.polygonSideColor).toHaveBeenCalledTimes(1);
    expect(instanceSpies.polygonStrokeColor).toHaveBeenCalledTimes(1);
    expect(instanceSpies.polygonAltitude).toHaveBeenCalledTimes(1);
  });

  it("passes the current polygon constants to the polygon layer", () => {
    render(<CountryPolygons />);

    /*
     * The cap, side, and stroke colors are passed as
     * functions of no arguments — `three-globe` calls them
     * per feature and the layer ignores the argument. We call
     * each captured function and check the constant it
     * returns.
     */
    const capFn = instanceSpies.polygonCapColor.mock
      .calls[0]?.[0] as (() => string) | undefined;
    const sideFn = instanceSpies.polygonSideColor.mock
      .calls[0]?.[0] as (() => string) | undefined;
    const strokeFn = instanceSpies.polygonStrokeColor.mock
      .calls[0]?.[0] as (() => string) | undefined;

    expect(capFn?.()).toBe(POLYGON_CAP_COLOR);
    expect(sideFn?.()).toBe(POLYGON_SIDE_COLOR);
    expect(strokeFn?.()).toBe(POLYGON_STROKE_COLOR);

    expect(
      instanceSpies.polygonAltitude.mock.calls[0]?.[0],
    ).toBe(POLYGON_ALTITUDE);
  });

  it("applies the globe scale to the instance", () => {
    render(<CountryPolygons />);
    expect(instanceSpies.setScalar).toHaveBeenCalledTimes(1);
    expect(instanceSpies.setScalar).toHaveBeenCalledWith(GLOBE_SCALE);
  });

  it("constructs the three-globe instance exactly once", () => {
    /*
     * The effect has an empty dependency array, so the
     * instance is constructed once per mount. If it re-ran on
     * every render, `polygonsData` would be called more than
     * once for the same mount.
     */
    const { rerender } = render(<CountryPolygons />);
    rerender(<CountryPolygons />);
    rerender(<CountryPolygons />);

    expect(instanceSpies.polygonsData).toHaveBeenCalledTimes(1);
    expect(instanceSpies.showGlobe).toHaveBeenCalledTimes(1);
  });

  it("does not introduce focusable elements", () => {
    const { container } = render(<CountryPolygons />);

    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );

    expect(focusable).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */

describe("CountryPolygons — cleanup", () => {
  it("calls clear() on unmount", () => {
    const { unmount } = render(<CountryPolygons />);
    unmount();
    expect(instanceSpies.clear).toHaveBeenCalledTimes(1);
  });

  it("traverses the scene graph on unmount to dispose resources", () => {
    const { unmount } = render(<CountryPolygons />);
    unmount();
    expect(instanceSpies.traverse).toHaveBeenCalledTimes(1);
  });

  it("does not clear the instance on re-render", () => {
    /*
     * `clear()` is called only from the unmount cleanup, not
     * on re-render. A refactor that moved the cleanup into a
     * re-running effect would fail this.
     */
    const { rerender } = render(<CountryPolygons />);
    rerender(<CountryPolygons />);

    expect(instanceSpies.clear).not.toHaveBeenCalled();
  });
});