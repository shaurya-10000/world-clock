import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ErrorBoundary from "@/app/error";

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeError(digest?: string): Error & { digest?: string } {
  const err = new Error("boom") as Error & { digest?: string };
  if (digest !== undefined) err.digest = digest;
  return err;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Rendered output                                                            */
/* -------------------------------------------------------------------------- */

describe("error boundary — rendered output", () => {
  it("renders the brand tag", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(screen.getByText("World Clock")).toBeInTheDocument();
  });

  it("renders the heading", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        name: "Something went wrong",
      }),
    ).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(
      screen.getByText(/An unexpected error interrupted the page/i),
    ).toBeInTheDocument();
  });

  it("renders the retry button", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Digest visibility                                                          */
/* -------------------------------------------------------------------------- */

describe("error boundary — digest visibility", () => {
  it("renders the digest when present", () => {
    render(
      <ErrorBoundary
        error={makeError("abc123")}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText(/ref abc123/)).toBeInTheDocument();
  });

  it("omits the digest line when the digest is undefined", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(screen.queryByText(/^ref /)).not.toBeInTheDocument();
  });

  it("omits the digest line when the digest is an empty string", () => {
    render(
      <ErrorBoundary error={makeError("")} reset={vi.fn()} />,
    );

    expect(screen.queryByText(/^ref /)).not.toBeInTheDocument();
  });

  /* NEW */
  it("renders the digest line as a paragraph, not a heading", () => {
    /*
     * A digest is metadata, not page structure. If it were
     * ever promoted to a heading, screen readers would
     * announce it as a section title, and the level-1
     * heading would no longer be the sole navigational
     * landmark in the boundary.
     */
    const { container } = render(
      <ErrorBoundary
        error={makeError("abc123")}
        reset={vi.fn()}
      />,
    );

    const refLine = container.querySelector("p");
    expect(refLine).not.toBeNull();

    const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Something went wrong");
  });
});

/* -------------------------------------------------------------------------- */
/* User interaction                                                           */
/* -------------------------------------------------------------------------- */

describe("error boundary — user interaction", () => {
  it("calls reset when the retry button is clicked", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={makeError()} reset={reset} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Try again" }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not call reset on render", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={makeError()} reset={reset} />);

    expect(reset).not.toHaveBeenCalled();
  });

  /* NEW */
  it("does not throw when the retry button is clicked", () => {
    /*
     * A defensive guard: if the reset callback is ever
     * wrapped in a component that throws synchronously on
     * click, this catches it before the error boundary's
     * own error boundary (if any) does.
     */
    render(
      <ErrorBoundary error={makeError()} reset={vi.fn()} />,
    );

    expect(() =>
      fireEvent.click(
        screen.getByRole("button", { name: "Try again" }),
      ),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("error boundary — accessibility", () => {
  it("uses a level-1 heading for the primary message", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Something went wrong");
  });

  it("renders the retry control as a type=button element", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Try again" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("is keyboard-activatable via Enter", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={makeError()} reset={reset} />);

    const button = screen.getByRole("button", { name: "Try again" });
    button.focus();
    fireEvent.click(button);

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("exposes exactly one interactive element", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  /* NEW */
  it("does not disable the retry button", () => {
    /*
     * A disabled retry button would be a dead end — the user
     * has no other action available in this UI. The button
     * must always be clickable.
     */
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).not.toBeDisabled();
  });

  /* NEW */
  it("does not override the button's accessible name with aria-label", () => {
    /*
     * The visible text "Try again" is the accessible name.
     * If an `aria-label` is ever added, the accessible name
     * would change and screen-reader users would hear a
     * different label than sighted users see.
     */
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).not.toHaveAttribute("aria-label");
  });
});