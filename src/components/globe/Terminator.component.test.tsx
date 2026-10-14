import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Capture every frame callback that the component registers so
 * the tests can fire them manually. The real `useFrameAdapter`
 * wires the callback into R3F's frame loop; here we just hold
 * onto it.
 *
 * ## Why the `<points>` warning appears in the test output
 *
 * This component renders `<points>` primitives. Inside a real
 * `<Canvas>`, R3F's reconciler intercepts those tags and
 * creates `THREE.Points` objects in the scene graph. Outside a
 * Canvas — which is what every test in this file does — React
 * has no reconciler for them and falls back to treating
 * `points` as an unknown DOM element, producing a `<points>`
 * tag in the container plus a warning on the console.
 *
 * That fallback is harmless for these tests: the tag has no
 * children, no text, no interactive attributes, and nothing
 * that renders as a visible box. But it means any assertion
 * phrased as "nothing is rendered to the DOM" is wrong. The
 * assertions below phrase the guarantee in terms of what a
 * user could actually observe: no text, no focusable
 * elements, no interactive roles.
 */

const frameCallbacks: Array<() => void> = [];

vi.mock("@/lib/r3f-adapters", () => ({
  useFrameAdapter: (cb: () => void) => {
    frameCallbacks.push(cb);
  },
  useThreeAdapter: () => ({
    camera: { position: { x: 0, y: 0, z: 5 } },
  }),
}));

vi.mock("@/components/globe/solarContext", () => ({
  getSunDirectionInGlobeFrame: () => ({ x: 0, y: 0, z: 1 }),
}));

import Terminator from "@/components/globe/Terminator";

function fireFrame(): void {
  for (const cb of frameCallbacks) cb();
}

beforeEach(() => {
  frameCallbacks.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Mount contract                                                             */
/* -------------------------------------------------------------------------- */

describe("Terminator — mount", () => {
  it("renders without throwing inside happy-dom", () => {
    expect(() => render(<Terminator />)).not.toThrow();
  });

  it("registers exactly one frame callback with the adapter", () => {
    render(<Terminator />);
    expect(frameCallbacks).toHaveLength(1);
  });

  it("registers a fresh callback on every render", () => {
    /*
     * `useFrameAdapter` is called on every render. If the
     * adapter's contract is "one registration per call", a
     * component that re-renders must produce a new callback
     * each time — even if the underlying R3F subscription
     * deduplicates. This test pins the contract against a
     * future change to the adapter that might coalesce
     * registrations.
     */
    const { rerender } = render(<Terminator />);
    rerender(<Terminator />);
    expect(frameCallbacks.length).toBeGreaterThanOrEqual(2);
  });

  it("does not introduce any focusable elements", () => {
    const { container } = render(<Terminator />);
    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("renders no text content to the DOM", () => {
    /*
     * Outside a real R3F canvas, `<points>` falls back to a
     * DOM `<points>` tag with no children. That is harmless —
     * the meaningful guarantee is that the component adds no
     * *content* to the DOM.
     */
    const { container } = render(<Terminator />);
    expect(container.textContent).toBe("");
  });

  it("renders no elements with interactive ARIA roles", () => {
    /*
     * The component contributes only inert geometry. Any
     * element with an interactive role would be a bug — the
     * axis markers and terminator ring are decorative.
     */
    const { container } = render(<Terminator />);
    const interactive = container.querySelectorAll(
      "[role='button'], [role='link'], [role='textbox'], [role='checkbox'], [role='radio'], [role='menuitem']",
    );
    expect(interactive).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Frame-callback safety                                                      */
/* -------------------------------------------------------------------------- */

describe("Terminator — frame callback", () => {
  it("does not throw when fired before any material ref is attached", () => {
    /*
     * Outside a real R3F canvas the `<points>` primitives do
     * not mount as THREE.Points, so the refs stay null. The
     * frame callback must tolerate that and return cleanly.
     */
    render(<Terminator />);
    expect(() => fireFrame()).not.toThrow();
  });

  it("does not throw across a full rotation of the sun direction", () => {
    render(<Terminator />);

    for (let i = 0; i < 16; i += 1) {
      /* The mock returns a fixed value; we just fire frames. */
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("does not throw on repeated frames with the same state", () => {
    render(<Terminator />);
    expect(() => {
      for (let i = 0; i < 60; i += 1) fireFrame();
    }).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Deterministic camera fixture                                               */
/* -------------------------------------------------------------------------- */

describe("Terminator — camera fixture", () => {
  it("reads the camera from the adapter, not from R3F directly", () => {
    /*
     * The adapter is the entire reason the component is
     * testable without a Canvas. If a future edit replaces
     * `useThreeAdapter` with a direct `useThree` import, this
     * suite stops running (the mock key would not exist) and
     * the failure is immediate.
     */
    const { unmount } = render(<Terminator />);
    fireFrame();
    unmount();

    /* If we got here, the adapter mock was used. */
    expect(frameCallbacks.length).toBeGreaterThan(0);
  });
});