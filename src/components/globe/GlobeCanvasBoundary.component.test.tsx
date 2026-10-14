import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * ## Why `@/lib/logger` is mocked
 *
 * The boundary calls `logError` from `componentDidCatch`. In
 * tests that is a real side effect — it writes to `console`
 * based on `NEXT_PUBLIC_LOG_LEVEL`. Mocking the module keeps
 * the test output clean and lets the assertions check *that*
 * `logError` was called with the right arguments without
 * caring what the logger does with them.
 *
 * ## Why `console.error` is silenced
 *
 * React logs every caught error to the console before invoking
 * the boundary's `componentDidCatch`. That is useful in
 * development and noise in tests — the interesting behavior
 * (the fallback rendering) is what the tests assert on, and
 * the console output is just React narrating its internal
 * state transitions.
 */

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import GlobeCanvasBoundary, {
  GlobeCanvasFallback,
} from "@/components/globe/GlobeCanvasBoundary";
import { logError } from "@/lib/logger";

const mockedLogError = vi.mocked(logError);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A component whose render phase throws. Defining it as a
 * named function rather than an arrow avoids the "anonymous
 * component" warning from React's dev tools when the error is
 * logged.
 */
function Bomb(): never {
  throw new Error("boom");
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * React logs caught errors to `console.error` during the
   * test. Silence them so the suite output stays readable.
   */
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Happy path                                                                 */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvasBoundary — happy path", () => {
  it("renders its children when nothing throws", () => {
    render(
      <GlobeCanvasBoundary>
        <div data-testid="child" />
      </GlobeCanvasBoundary>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("does not render the fallback when nothing throws", () => {
    render(
      <GlobeCanvasBoundary>
        <div data-testid="child" />
      </GlobeCanvasBoundary>,
    );

    expect(
      screen.queryByLabelText("Interactive globe unavailable"),
    ).not.toBeInTheDocument();
  });

  it("does not call logError when nothing throws", () => {
    render(
      <GlobeCanvasBoundary>
        <div />
      </GlobeCanvasBoundary>,
    );

    expect(mockedLogError).not.toHaveBeenCalled();
  });

  it("renders multiple children without collapsing them", () => {
    render(
      <GlobeCanvasBoundary>
        <div data-testid="a" />
        <div data-testid="b" />
      </GlobeCanvasBoundary>,
    );

    expect(screen.getByTestId("a")).toBeInTheDocument();
    expect(screen.getByTestId("b")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Error path                                                                 */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvasBoundary — error path", () => {
  it("renders the fallback when a child throws", () => {
    render(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();
  });

  it("does not render the throwing child", () => {
    render(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("reports the error through logError", () => {
    render(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    expect(mockedLogError).toHaveBeenCalledWith(
      "globe canvas failed",
      expect.any(Error),
    );
  });

  it("swallows errors thrown during the render phase of descendants", () => {
    expect(() =>
      render(
        <GlobeCanvasBoundary>
          <Bomb />
        </GlobeCanvasBoundary>,
      ),
    ).not.toThrow();
  });

  it("logs exactly one error per failure", () => {
    render(
      <GlobeCanvasBoundary>
        <Bomb />
      </GlobeCanvasBoundary>,
    );

    expect(mockedLogError).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Fallback component (in isolation)                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvasFallback", () => {
  it("has an accessible label", () => {
    render(<GlobeCanvasFallback />);
    expect(
      screen.getByLabelText("Interactive globe unavailable"),
    ).toBeInTheDocument();
  });

  it("renders the headline", () => {
    render(<GlobeCanvasFallback />);
    expect(screen.getByText("Globe unavailable")).toBeInTheDocument();
  });

  it("renders explanatory copy", () => {
    render(<GlobeCanvasFallback />);
    expect(
      screen.getByText(/Everything else on this page still works/),
    ).toBeInTheDocument();
  });

  it("marks the icon as decorative", () => {
    const { container } = render(<GlobeCanvasFallback />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("does not introduce focusable elements", () => {
    const { container } = render(<GlobeCanvasFallback />);
    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not call logError — it is a pure presentation", () => {
    render(<GlobeCanvasFallback />);
    expect(mockedLogError).not.toHaveBeenCalled();
  });
});