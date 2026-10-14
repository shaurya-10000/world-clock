import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState, type ReactElement } from "react";

import ErrorBoundary from "@/app/error";

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { logError } from "@/lib/logger";

const mockedLogError = vi.mocked(logError);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeError(digest?: string): Error & { digest?: string } {
  const err = new Error("boom") as Error & { digest?: string };
  if (digest !== undefined) err.digest = digest;
  return err;
}

beforeEach(() => {
  mockedLogError.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Effect lifecycle                                                           */
/* -------------------------------------------------------------------------- */

describe("error boundary — effect lifecycle", () => {
  it("logs once on mount", () => {
    render(
      <ErrorBoundary error={makeError()} reset={vi.fn()} />,
    );

    expect(mockedLogError).toHaveBeenCalledTimes(1);
  });

  it("re-logs when the error identity changes", () => {
    const { rerender } = render(
      <ErrorBoundary error={makeError("first")} reset={vi.fn()} />,
    );

    rerender(
      <ErrorBoundary error={makeError("second")} reset={vi.fn()} />,
    );

    expect(mockedLogError).toHaveBeenCalledTimes(2);
  });

  it("does not re-log when the error reference is stable", () => {
    const error = makeError();
    const reset = vi.fn();

    const { rerender } = render(
      <ErrorBoundary error={error} reset={reset} />,
    );

    rerender(<ErrorBoundary error={error} reset={reset} />);
    rerender(<ErrorBoundary error={error} reset={reset} />);

    expect(mockedLogError).toHaveBeenCalledTimes(1);
  });

  it("does not re-log when only reset identity changes", () => {
    const error = makeError();

    const { rerender } = render(
      <ErrorBoundary error={error} reset={vi.fn()} />,
    );

    rerender(<ErrorBoundary error={error} reset={vi.fn()} />);

    expect(mockedLogError).toHaveBeenCalledTimes(1);
  });

  it("passes the exact error object to the logger", () => {
    const error = makeError("xyz");
    render(<ErrorBoundary error={error} reset={vi.fn()} />);

    expect(mockedLogError).toHaveBeenCalledWith(
      "route error",
      error,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Reset flow                                                                 */
/* -------------------------------------------------------------------------- */

describe("error boundary — reset flow", () => {
  it("invokes the reset callback exactly once per click", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={makeError()} reset={reset} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Try again" }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("invokes the reset callback on every click", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={makeError()} reset={reset} />);

    const button = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(reset).toHaveBeenCalledTimes(3);
  });

  it("does not invoke reset on render or on rerender", () => {
    const reset = vi.fn();
    const { rerender } = render(
      <ErrorBoundary error={makeError()} reset={reset} />,
    );

    rerender(<ErrorBoundary error={makeError()} reset={reset} />);

    expect(reset).not.toHaveBeenCalled();
  });

  it("works with a real state-driven reset boundary", () => {
    /*
     * Simulates the Next.js contract: the boundary wraps
     * stateful content, `reset` clears the error state, and
     * the content re-renders. Verifies that this component's
     * reset button actually drives that flow.
     */
    function Host(): ReactElement {
      const [failed, setFailed] = useState(true);

      if (failed) {
        return (
          <ErrorBoundary
            error={makeError()}
            reset={() => setFailed(false)}
          />
        );
      }

      return <p data-testid="recovered">Recovered</p>;
    }

    render(<Host />);
    expect(screen.queryByTestId("recovered")).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Try again" }),
      );
    });

    expect(screen.getByTestId("recovered")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Digest propagation                                                         */
/* -------------------------------------------------------------------------- */

describe("error boundary — digest propagation", () => {
  it("reveals the digest when it appears after mount", () => {
    const { rerender } = render(
      <ErrorBoundary error={makeError()} reset={vi.fn()} />,
    );
    expect(screen.queryByText(/^ref /)).not.toBeInTheDocument();

    rerender(
      <ErrorBoundary error={makeError("late-digest")} reset={vi.fn()} />,
    );

    expect(screen.getByText(/ref late-digest/)).toBeInTheDocument();
  });

  it("hides the digest when it disappears after mount", () => {
    const { rerender } = render(
      <ErrorBoundary error={makeError("gone-soon")} reset={vi.fn()} />,
    );
    expect(screen.getByText(/ref gone-soon/)).toBeInTheDocument();

    rerender(
      <ErrorBoundary error={makeError()} reset={vi.fn()} />,
    );

    expect(screen.queryByText(/^ref /)).not.toBeInTheDocument();
  });
});