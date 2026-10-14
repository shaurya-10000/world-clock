import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GlobeSizeToggle from "@/components/globe/GlobeSizeToggle";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface RenderOptions {
  stepIndex?: number;
  stepCount?: number;
  onDecrement?: () => void;
  onIncrement?: () => void;
}

function renderToggle(opts: RenderOptions = {}) {
  const onDecrement = opts.onDecrement ?? vi.fn();
  const onIncrement = opts.onIncrement ?? vi.fn();

  const result = render(
    <GlobeSizeToggle
      stepIndex={opts.stepIndex ?? 0}
      stepCount={opts.stepCount ?? 7}
      onDecrement={onDecrement}
      onIncrement={onIncrement}
    />,
  );

  return { ...result, onDecrement, onIncrement };
}

function decrementButton() {
  return screen.getByRole("button", { name: "Reduce globe size" });
}

function incrementButton() {
  return screen.getByRole("button", { name: "Increase globe size" });
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — structure", () => {
  it("renders without throwing", () => {
    expect(() => renderToggle()).not.toThrow();
  });

  it("renders a group with an accessible name", () => {
    renderToggle();
    expect(
      screen.getByRole("group", { name: "Globe size" }),
    ).toBeInTheDocument();
  });

  it("renders exactly two buttons", () => {
    renderToggle();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("gives both buttons accessible names", () => {
    renderToggle();
    expect(decrementButton()).toBeInTheDocument();
    expect(incrementButton()).toBeInTheDocument();
  });

  it("renders decorative icons inside the buttons", () => {
    /*
     * The `Minus` and `Plus` lucide icons are decoration — the
     * accessible name comes from `aria-label`. They must carry
     * `aria-hidden` so assistive tech does not read the icon's
     * internal SVG title (which lucide does not emit anyway,
     * but the assertion pins the contract).
     */
    const { container } = renderToggle();
    const hiddenSvgs = container.querySelectorAll(
      "svg[aria-hidden='true']",
    );
    expect(hiddenSvgs.length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Disabled logic                                                             */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — disabled logic at the boundaries", () => {
  it("disables the increment button at the closest camera (stepIndex 0)", () => {
    /*
     * stepIndex 0 is the closest camera = largest globe. There
     * is no larger size left to step to, so `+` ("increase
     * globe size") is disabled.
     */
    renderToggle({ stepIndex: 0, stepCount: 7 });
    expect(incrementButton()).toBeDisabled();
    expect(decrementButton()).not.toBeDisabled();
  });

  it("disables the decrement button at the furthest camera (last index)", () => {
    /*
     * stepIndex 6 is the furthest camera = smallest globe.
     * There is no smaller size left to step to, so `−`
     * ("reduce globe size") is disabled.
     */
    renderToggle({ stepIndex: 6, stepCount: 7 });
    expect(decrementButton()).toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });

  it("enables both buttons in the middle of the ladder", () => {
    renderToggle({ stepIndex: 3, stepCount: 7 });
    expect(decrementButton()).not.toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });

  it("never disables both buttons when the ladder has more than one step", () => {
    /*
     * A ladder with at least two steps always has a move
     * available in at least one direction. Disabling both
     * would mean the UI is dead, which should never happen
     * for a valid (stepIndex, stepCount) pair.
     */
    for (let i = 0; i < 7; i += 1) {
      const { unmount } = renderToggle({
        stepIndex: i,
        stepCount: 7,
      });
      const dec = decrementButton();
      const inc = incrementButton();
      expect(
        dec.hasAttribute("disabled") && inc.hasAttribute("disabled"),
      ).toBe(false);
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Defensive normalization                                                    */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — degenerate stepCount", () => {
  it("disables both buttons when stepCount is 0", () => {
    renderToggle({ stepIndex: 0, stepCount: 0 });
    expect(decrementButton()).toBeDisabled();
    expect(incrementButton()).toBeDisabled();
  });

  it("disables both buttons when stepCount is 1", () => {
    renderToggle({ stepIndex: 0, stepCount: 1 });
    expect(decrementButton()).toBeDisabled();
    expect(incrementButton()).toBeDisabled();
  });
});

describe("GlobeSizeToggle — non-finite stepIndex", () => {
  it("keeps both buttons usable for NaN", () => {
    /*
     * A non-finite index is a bug upstream. Disabling both
     * buttons in response would hide the bug; leaving them
     * usable means the user can still step, and the bug
     * surfaces elsewhere (e.g. a console warning from the
     * caller).
     */
    renderToggle({ stepIndex: Number.NaN, stepCount: 7 });
    expect(decrementButton()).not.toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });

  it("keeps both buttons usable for Infinity", () => {
    renderToggle({ stepIndex: Number.POSITIVE_INFINITY, stepCount: 7 });
    expect(decrementButton()).not.toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });

  it("keeps both buttons usable for -Infinity", () => {
    renderToggle({ stepIndex: Number.NEGATIVE_INFINITY, stepCount: 7 });
    expect(decrementButton()).not.toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });
});

describe("GlobeSizeToggle — out-of-range stepIndex", () => {
  it("clamps a negative stepIndex to the minimum boundary", () => {
    /*
     * stepIndex -3 is below the ladder. After clamping it is
     * 0, which is the minimum boundary — so `+` is disabled.
     * The assertion is on the *outcome*, not the clamp
     * arithmetic.
     */
    renderToggle({ stepIndex: -3, stepCount: 7 });
    expect(incrementButton()).toBeDisabled();
    expect(decrementButton()).not.toBeDisabled();
  });

  it("clamps an oversized stepIndex to the maximum boundary", () => {
    renderToggle({ stepIndex: 100, stepCount: 7 });
    expect(decrementButton()).toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });
});

/* -------------------------------------------------------------------------- */
/* Interaction                                                                */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — click", () => {
  it("calls onDecrement when the decrement button is clicked", () => {
    const onDecrement = vi.fn();
    renderToggle({ stepIndex: 3, onDecrement });

    fireEvent.click(decrementButton());

    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it("calls onIncrement when the increment button is clicked", () => {
    const onIncrement = vi.fn();
    renderToggle({ stepIndex: 3, onIncrement });

    fireEvent.click(incrementButton());

    expect(onIncrement).toHaveBeenCalledTimes(1);
  });

  it("does not call onDecrement when the decrement button is disabled", () => {
    const onDecrement = vi.fn();
    renderToggle({ stepIndex: 6, stepCount: 7, onDecrement });

    fireEvent.click(decrementButton());

    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("does not call onIncrement when the increment button is disabled", () => {
    const onIncrement = vi.fn();
    renderToggle({ stepIndex: 0, stepCount: 7, onIncrement });

    fireEvent.click(incrementButton());

    expect(onIncrement).not.toHaveBeenCalled();
  });

  it("does not fire onIncrement when the decrement button is clicked", () => {
    const onIncrement = vi.fn();
    renderToggle({ stepIndex: 3, onIncrement });

    fireEvent.click(decrementButton());

    expect(onIncrement).not.toHaveBeenCalled();
  });

  it("does not fire onDecrement when the increment button is clicked", () => {
    const onDecrement = vi.fn();
    renderToggle({ stepIndex: 3, onDecrement });

    fireEvent.click(incrementButton());

    expect(onDecrement).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility guarantees                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — accessibility", () => {
  it("uses a group role for the container", () => {
    const { container } = renderToggle();
    const group = container.querySelector("[role='group']");
    expect(group).not.toBeNull();
  });

  it("does not introduce focusable elements outside the two buttons", () => {
    const { container } = renderToggle();
    const focusable = container.querySelectorAll(
      'a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("gives each button a title attribute matching its aria-label", () => {
    /*
     * Sighted users who cannot infer the icon's meaning get
     * the tooltip from `title`; screen reader users get the
     * same string from `aria-label`. The two must match.
     */
    renderToggle();
    expect(decrementButton()).toHaveAttribute(
      "title",
      "Reduce globe size",
    );
    expect(incrementButton()).toHaveAttribute(
      "title",
      "Increase globe size",
    );
  });

  it("marks both buttons as type=button", () => {
    /*
     * Without `type="button"` a button inside a `<form>` would
     * default to `type="submit"`. Neither button submits
     * anything, and this component should not acquire a
     * submission behavior by accident if it is ever nested
     * inside a form.
     */
    renderToggle();
    expect(decrementButton()).toHaveAttribute("type", "button");
    expect(incrementButton()).toHaveAttribute("type", "button");
  });
});