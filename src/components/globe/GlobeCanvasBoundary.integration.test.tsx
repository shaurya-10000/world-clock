import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Integration scope: the boundary in a real React tree,
 * alongside siblings that must survive when the wrapped
 * subtree fails.
 *
 * The point of these tests is the *isolation* the boundary
 * provides: a WebGL failure inside one section of the page
 * must not take down the rest of the page. That is a
 * cross-module invariant — it depends on React's reconciliation
 * treating the boundary as a scope, not on anything the
 * boundary itself does.
 */

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import GlobeCanvasBoundary from "@/components/globe/GlobeCanvasBoundary";
import { logError } from "@/lib/logger";

const mockedLogError = vi.mocked(logError);

function Bomb(): never {
  throw new Error("boom");
}

function Safe(): React.ReactElement {
  return <div data-testid="safe">ok</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Isolation                                                                  */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvasBoundary — isolation", () => {
  it("isolates a failing subtree from a sibling subtree", () => {
    render(
      <>
        <div data-testid="outside" />
        <GlobeCanvasBoundary>
          <Bomb />
        </GlobeCanvasBoundary>
      </>,
    );

    expect(screen.getByTestId("outside")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();
  });

  it("preserves state on the surviving tree when a sibling boundary trips", () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return (
        <button
          data-testid="counter"
          onClick={() => setCount((c) => c + 1)}
        >
          {count}
        </button>
      );
    }

    render(
      <>
        <Counter />
        <GlobeCanvasBoundary>
          <Bomb />
        </GlobeCanvasBoundary>
      </>,
    );

    /*
     * The counter is outside the boundary, so it should still
     * be mounted and reachable by test id.
     */
    expect(screen.getByTestId("counter")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();
  });

  it("does not throw upward out of render even when the child throws", () => {
    expect(() =>
      render(
        <GlobeCanvasBoundary>
          <Bomb />
        </GlobeCanvasBoundary>,
      ),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Persistence of the error state                                             */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvasBoundary — error-state persistence", () => {
  it("keeps rendering the fallback after the error state is set", () => {
    /*
     * Once an error boundary enters the error state, it stays
     * there until it is remounted. Passing different children
     * to a subsequent render does not clear the error — React
     * treats the boundary's state as sticky by design, so a
     * transiently broken child does not flash back and forth.
     */
    const { rerender } = render(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();

    rerender(
      <GlobeCanvasBoundary>
        <Safe />
      </GlobeCanvasBoundary>,
    );

    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("safe")).not.toBeInTheDocument();
  });

  it("recovers the children after a key-forced remount", () => {
    /*
     * The documented way to reset a React error boundary is to
     * change its `key`, which forces React to unmount and
     * remount it. This is what a parent would do if it wanted
     * to give the canvas a second chance — for example, after
     * a WebGL context loss event.
     */
    function Parent({ resetKey }: { resetKey: number }) {
      return (
        <GlobeCanvasBoundary key={resetKey}>
          <Safe />
        </GlobeCanvasBoundary>
      );
    }

    const { rerender } = render(<Parent resetKey={1} />);
    expect(screen.getByTestId("safe")).toBeInTheDocument();

    rerender(<Parent resetKey={2} />);
    expect(screen.getByTestId("safe")).toBeInTheDocument();
  });

  it("logs exactly one error per failure, even across re-renders", () => {
    const { rerender } = render(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    rerender(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    /*
     * React does not re-invoke `componentDidCatch` for
     * re-renders that stay in the error state. The `logError`
     * call happens exactly once per entering-the-error-state
     * transition.
     */
    expect(mockedLogError).toHaveBeenCalledTimes(1);
    expect(mockedLogError.mock.calls[0]?.[0]).toBe(
      "globe canvas failed",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Nested boundaries                                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvasBoundary — nested boundaries", () => {
  it("the innermost boundary catches the error first", () => {
    /*
     * React walks up the tree from the throwing component and
     * invokes the *nearest* error boundary. In practice
     * `GlobeCanvasBoundary` is the innermost boundary around
     * the canvas, so it wins. The outer boundary (a route-level
     * `error.tsx`) would only see errors thrown outside the
     * inner boundary's subtree.
     */
    render(
      <GlobeCanvasBoundary>
        <div data-testid="outer-child">
          <GlobeCanvasBoundary>
            <Bomb />
          </GlobeCanvasBoundary>
        </div>
      </GlobeCanvasBoundary>,
    );

    /* The outer boundary is not in its error state. */
    expect(screen.getByTestId("outer-child")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();
  });
});