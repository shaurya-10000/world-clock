import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TimeOverrideBanner, {
  formatOverrideTimestamp,
} from "@/components/globe/TimeOverrideBanner";
import {
  clearTimeOverride,
  getTimeOverride,
  resetTimeOverride,
  setTimeOverride,
} from "@/lib/time-override";

const REFERENCE_MS = Date.UTC(2024, 5, 20, 20, 51);

/*
 * The banner subscribes to `lib/time-override.ts` via
 * `useSyncExternalStore`. Updating that store from a test — as
 * opposed to from inside a React event handler — schedules a
 * re-render asynchronously. React only flushes it synchronously
 * if the update happens inside `act(...)`.
 *
 * `setOverride` and `clearOverride` wrap the two *notifying*
 * mutators (`setTimeOverride`, `clearTimeOverride`) in `act` so
 * every test that touches the override goes through a
 * synchronous flush. `resetTimeOverride` is the silent test
 * teardown and is used only in the lifecycle hooks below.
 */
function setOverride(ms: number): void {
  act(() => {
    setTimeOverride(ms);
  });
}

function clearOverride(): void {
  act(() => {
    clearTimeOverride();
  });
}

beforeEach(() => {
  resetTimeOverride();
});

afterEach(() => {
  resetTimeOverride();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — visibility", () => {
  it("renders nothing when no override is active", () => {
    const { container } = render(
      <TimeOverrideBanner label={null} reducedMotion={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the banner once an override is active", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("unmounts the banner when the override is cleared", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    clearOverride();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reacts to an override set from outside the component", () => {
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    setOverride(REFERENCE_MS);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — content", () => {
  it("renders the label prop as the primary text", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    expect(screen.getByText("Next solstice")).toBeInTheDocument();
  });

  it("falls back to a generic label when label is null", () => {
    setOverride(REFERENCE_MS);
    render(<TimeOverrideBanner label={null} reducedMotion={false} />);

    expect(screen.getByText("Frozen moment")).toBeInTheDocument();
  });

  it("renders the formatted UTC timestamp of the override", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    expect(
      screen.getByText(formatOverrideTimestamp(REFERENCE_MS)),
    ).toBeInTheDocument();
  });

  it("renders a 'Back to now' button", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    expect(
      screen.getByRole("button", { name: "Return to live time" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Interaction                                                                */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — Back to now", () => {
  it("clears the override when the button is clicked", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Return to live time" }),
    );

    expect(getTimeOverride()).toBeNull();
  });

  it("unmounts itself after clearing the override", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Return to live time" }),
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* ARIA                                                                       */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — ARIA", () => {
  it("renders with role=status and aria-live=polite", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
  });

  it("marks the status dot as decorative", () => {
    setOverride(REFERENCE_MS);
    const { container } = render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    const hidden = container.querySelectorAll("[aria-hidden='true']");
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("gives the close button an accessible name", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    expect(
      screen.getByRole("button", { name: "Return to live time" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — reduced motion", () => {
  it("applies animate-pulse when reducedMotion is false", () => {
    setOverride(REFERENCE_MS);
    const { container } = render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );

    expect(container.innerHTML).toContain("animate-pulse");
  });

  it("omits animate-pulse when reducedMotion is true", () => {
    setOverride(REFERENCE_MS);
    const { container } = render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={true} />,
    );

    expect(container.innerHTML).not.toContain("animate-pulse");
  });

  it("keeps the status dot visible under reduced motion", () => {
    setOverride(REFERENCE_MS);
    const { container } = render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={true} />,
    );

    expect(container.innerHTML).toContain("bg-[var(--accent)]");
  });
});