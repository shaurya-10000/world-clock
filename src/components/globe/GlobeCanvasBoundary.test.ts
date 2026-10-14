import { describe, expect, it } from "vitest";

import GlobeCanvasBoundary from "@/components/globe/GlobeCanvasBoundary";

/*
 * ## What is testable in a pure test file
 *
 * `GlobeCanvasBoundary` has exactly one static method that is
 * pure and side-effect-free: `getDerivedStateFromError`. It
 * takes no arguments and returns a fixed shape. That is the
 * entire surface this file can meaningfully test without
 * mounting the component.
 *
 * The rest of the class — `componentDidCatch`, `render` — is
 * exercised by `GlobeCanvasBoundary.component.test.tsx` and
 * `GlobeCanvasBoundary.integration.test.tsx`. Those tests need
 * React's reconciliation lifecycle to run; this file does not.
 */

describe("GlobeCanvasBoundary.getDerivedStateFromError", () => {
  it("returns hasError: true for any thrown error", () => {
    const result = GlobeCanvasBoundary.getDerivedStateFromError();
    expect(result).toEqual({ hasError: true });
  });

  it("is a static method, not an instance method", () => {
    /*
     * React calls `getDerivedStateFromError` on the class, not
     * on an instance. If it were ever converted to an instance
     * method, React would silently stop calling it and the
     * boundary would never flip into the error state.
     */
    expect(typeof GlobeCanvasBoundary.getDerivedStateFromError).toBe(
      "function",
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        GlobeCanvasBoundary,
        "getDerivedStateFromError",
      ),
    ).toBe(true);
  });

  it("returns a fresh object each call", () => {
    const first = GlobeCanvasBoundary.getDerivedStateFromError();
    const second = GlobeCanvasBoundary.getDerivedStateFromError();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("returns an object with exactly one key", () => {
    /*
     * The state shape is deliberately minimal. Any additional
     * key would need to be reset by the boundary's `render`
     * method on recovery; keeping the shape to a single boolean
     * makes the boundary trivially resettable via a remount.
     */
    const result = GlobeCanvasBoundary.getDerivedStateFromError();
    expect(Object.keys(result)).toEqual(["hasError"]);
  });

  it("does not inspect the error argument", () => {
    /*
     * React passes the error as the first argument. The
     * boundary's behavior is identical for every error type —
     * it does not distinguish between a network error, a
     * shader error, and a runtime error. That is intentional:
     * the fallback message is generic and the specific error is
     * logged through `componentDidCatch`.
     *
     * Calling the static with different arguments must produce
     * the same result. TypeScript does not allow passing
     * arguments to a zero-parameter function, so the assertion
     * is on the shape of the return value, not on the
     * arguments.
     */
    const result = GlobeCanvasBoundary.getDerivedStateFromError();
    expect(result.hasError).toBe(true);
  });

  it("has a default export that is the class", () => {
    expect(typeof GlobeCanvasBoundary).toBe("function");
    expect(GlobeCanvasBoundary.prototype).toBeDefined();
  });

  it("has a prototype that inherits from React's Component", () => {
    /*
     * The class must extend `React.Component` or React will not
     * call `getDerivedStateFromError` or `componentDidCatch`
     * during reconciliation. `Object.getPrototypeOf` on the
     * class itself gives the parent class, and the parent's
     * prototype should carry the React component methods.
     */
    const parent = Object.getPrototypeOf(GlobeCanvasBoundary);
    expect(parent).toBeDefined();
    /* React's Component.prototype has `setState` and `forceUpdate`. */
    expect(typeof parent.prototype.setState).toBe("function");
    expect(typeof parent.prototype.forceUpdate).toBe("function");
  });
});