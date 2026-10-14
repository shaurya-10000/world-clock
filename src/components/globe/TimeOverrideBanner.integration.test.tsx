import { act, fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TimeOverrideBanner from "@/components/globe/TimeOverrideBanner";
import {
  clearTimeOverride,
  getTimeOverride,
  resetTimeOverride,
  setTimeOverride,
} from "@/lib/time-override";

const REFERENCE_MS = Date.UTC(2024, 5, 20, 20, 51);

/*
 * See the equivalent helpers in the component test for the
 * reasoning. `clearTimeOverride` — not `resetTimeOverride` — is
 * the notifying mutation that the banner subscribes to. The
 * silent reset is used only in the lifecycle hooks.
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
/* Cross-module reaction                                                      */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — reacts to module-level override changes", () => {
  it("mounts when `setTimeOverride` is called after render", () => {
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    setOverride(REFERENCE_MS);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("unmounts when the override is cleared from outside", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    clearOverride();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("updates the displayed timestamp when the override changes", () => {
    setOverride(REFERENCE_MS);
    render(
      <TimeOverrideBanner label="Next solstice" reducedMotion={false} />,
    );
    expect(screen.getByText(/2024/)).toBeInTheDocument();

    const otherMs = Date.UTC(2025, 0, 1, 0, 0);
    setOverride(otherMs);

    expect(screen.getByText(/2025/)).toBeInTheDocument();
    expect(screen.queryByText(/2024/)).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple banners                                                           */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — multiple instances", () => {
  it("mounts and unmounts two banners in lockstep on the same override", () => {
    setOverride(REFERENCE_MS);
    render(
      <>
        <TimeOverrideBanner label="A" reducedMotion={false} />
        <TimeOverrideBanner label="B" reducedMotion={false} />
      </>,
    );

    expect(screen.getAllByRole("status")).toHaveLength(2);

    clearOverride();

    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("the close button on one banner clears the override for both", () => {
    setOverride(REFERENCE_MS);
    render(
      <>
        <TimeOverrideBanner label="A" reducedMotion={false} />
        <TimeOverrideBanner label="B" reducedMotion={false} />
      </>,
    );

    const buttons = screen.getAllByRole("button", {
      name: "Return to live time",
    });
    fireEvent.click(buttons[0]!);

    expect(getTimeOverride()).toBeNull();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Parent-driven label changes                                                */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — label prop changes", () => {
  it("reflects a label change from the parent without touching the override", () => {
    setOverride(REFERENCE_MS);

    const { rerender } = render(
      <TimeOverrideBanner label="Solstice" reducedMotion={false} />,
    );
    expect(screen.getByText("Solstice")).toBeInTheDocument();

    rerender(
      <TimeOverrideBanner label="Equinox" reducedMotion={false} />,
    );
    expect(screen.getByText("Equinox")).toBeInTheDocument();
    expect(getTimeOverride()).toBe(REFERENCE_MS);
  });

  it("falls back to the generic label when the parent passes null mid-override", () => {
    setOverride(REFERENCE_MS);

    const { rerender } = render(
      <TimeOverrideBanner label="Solstice" reducedMotion={false} />,
    );
    rerender(<TimeOverrideBanner label={null} reducedMotion={false} />);

    expect(screen.getByText("Frozen moment")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* State-preservation harness                                                 */
/* -------------------------------------------------------------------------- */

describe("TimeOverrideBanner — integration with a stateful parent", () => {
  /**
   * A parent that mirrors what a real consumer would look
   * like: it holds a label derived from external state (as
   * the picker hook does) and renders the banner. The
   * invariant to preserve is that the parent does not lose
   * its own state when the override toggles.
   */
  function Parent() {
    const [count, setCount] = useState(0);

    const handleIncrement = useCallback(() => {
      setCount((c) => c + 1);
    }, []);

    return (
      <>
        <button onClick={handleIncrement}>increment</button>
        <span data-testid="count">{count}</span>
        <TimeOverrideBanner label="Solstice" reducedMotion={false} />
      </>
    );
  }

  it("preserves parent state across override toggles", () => {
    render(<Parent />);

    fireEvent.click(screen.getByText("increment"));
    fireEvent.click(screen.getByText("increment"));
    expect(screen.getByTestId("count")).toHaveTextContent("2");

    setOverride(REFERENCE_MS);
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Return to live time" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    expect(screen.getByTestId("count")).toHaveTextContent("2");
  });
});