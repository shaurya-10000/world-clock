import { fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import GlobeSizeToggle from "@/components/globe/GlobeSizeToggle";
import {
  CAMERA_DISTANCE_STEPS,
  MAX_CAMERA_STEP_INDEX,
  MIN_CAMERA_STEP_INDEX,
} from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A parent that owns the ladder state and wires the toggle's
 * callbacks to it — exactly the shape `Globe.tsx` uses. The
 * harness clamps at the ends (no wrap), matching the toggle's
 * own disabled-at-the-boundary contract.
 */
function Harness({
  initial = 3,
  onChange,
}: {
  initial?: number;
  onChange?: (next: number) => void;
}) {
  const [stepIndex, setStepIndex] = useState(initial);

  const handleDecrement = useCallback(() => {
    setStepIndex((current) => {
      const next = Math.min(
        current + 1,
        MAX_CAMERA_STEP_INDEX,
      );
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const handleIncrement = useCallback(() => {
    setStepIndex((current) => {
      const next = Math.max(
        current - 1,
        MIN_CAMERA_STEP_INDEX,
      );
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  return (
    <GlobeSizeToggle
      stepIndex={stepIndex}
      stepCount={CAMERA_DISTANCE_STEPS.length}
      onDecrement={handleDecrement}
      onIncrement={handleIncrement}
    />
  );
}

function decrementButton() {
  return screen.getByRole("button", { name: "Reduce globe size" });
}

function incrementButton() {
  return screen.getByRole("button", { name: "Increase globe size" });
}

/* -------------------------------------------------------------------------- */
/* Round trips                                                                */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — round trips", () => {
  it("advances the parent's stepIndex on each decrement click", () => {
    const onChange = vi.fn();
    render(<Harness initial={3} onChange={onChange} />);

    fireEvent.click(decrementButton());
    fireEvent.click(decrementButton());

    expect(onChange.mock.calls.map((c) => c[0])).toEqual([4, 5]);
  });

  it("decrements the parent's stepIndex on each increment click", () => {
    const onChange = vi.fn();
    render(<Harness initial={3} onChange={onChange} />);

    fireEvent.click(incrementButton());
    fireEvent.click(incrementButton());

    expect(onChange.mock.calls.map((c) => c[0])).toEqual([2, 1]);
  });

  it("does not disable the decrement button when there is room to grow", () => {
    render(<Harness initial={3} />);
    expect(decrementButton()).not.toBeDisabled();
  });
});

/* -------------------------------------------------------------------------- */
/* Boundary behavior                                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — boundary behavior", () => {
  it("disables the decrement button after reaching the last step", () => {
    render(<Harness initial={MAX_CAMERA_STEP_INDEX} />);
    expect(decrementButton()).toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });

  it("disables the increment button after reaching the first step", () => {
    render(<Harness initial={MIN_CAMERA_STEP_INDEX} />);
    expect(incrementButton()).toBeDisabled();
    expect(decrementButton()).not.toBeDisabled();
  });

  it("reaches the last step after stepping to the end", () => {
    render(<Harness initial={3} />);

    for (
      let i = 3;
      i <= MAX_CAMERA_STEP_INDEX;
      i += 1
    ) {
      fireEvent.click(decrementButton());
    }

    expect(decrementButton()).toBeDisabled();
    expect(incrementButton()).not.toBeDisabled();
  });

  it("reaches the first step after stepping to the start", () => {
    render(<Harness initial={3} />);

    for (let i = 3; i >= MIN_CAMERA_STEP_INDEX; i -= 1) {
      fireEvent.click(incrementButton());
    }

    expect(incrementButton()).toBeDisabled();
    expect(decrementButton()).not.toBeDisabled();
  });

  it("never wraps from the last step back to the first", () => {
    render(<Harness initial={MAX_CAMERA_STEP_INDEX} />);

    const before = decrementButton();
    expect(before).toBeDisabled();

    /*
     * Clicking a disabled button in a real browser is a no-op;
     * `fireEvent.click` still dispatches the event, but the
     * browser's disabled handling swallows it. The parent's
     * handler does not run, so `stepIndex` stays at the
     * maximum and the state remains at the boundary.
     */
    fireEvent.click(before);
    expect(decrementButton()).toBeDisabled();
  });
});

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — keyboard", () => {
  it("does not throw when Space is pressed on the decrement button", () => {
    render(<Harness initial={3} />);
    expect(() =>
      fireEvent.keyDown(decrementButton(), { key: " " }),
    ).not.toThrow();
  });

  it("does not throw when Enter is pressed on the increment button", () => {
    render(<Harness initial={3} />);
    expect(() =>
      fireEvent.keyDown(incrementButton(), { key: "Enter" }),
    ).not.toThrow();
  });

  it("does not invoke onDecrement on ArrowRight (not a keyboard shortcut)", () => {
    const onChange = vi.fn();
    render(<Harness initial={3} onChange={onChange} />);

    fireEvent.keyDown(decrementButton(), { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Remount / reset                                                            */
/* -------------------------------------------------------------------------- */

describe("GlobeSizeToggle — reset via prop", () => {
  it("reflects an initial prop change on remount", () => {
    /*
     * The toggle is a controlled component. If a parent
     * re-renders with a different `stepIndex`, the disabled
     * state of both buttons must follow. This test does not
     * simulate the parent's own state change — it re-mounts
     * with a different `initial` prop, which is the purest
     * expression of "the component reflects the props it was
     * given".
     */
    const first = render(<Harness initial={3} />);
    expect(incrementButton()).not.toBeDisabled();
    expect(decrementButton()).not.toBeDisabled();
    first.unmount();

    render(<Harness initial={MIN_CAMERA_STEP_INDEX} />);
    expect(incrementButton()).toBeDisabled();
    expect(decrementButton()).not.toBeDisabled();
  });
});