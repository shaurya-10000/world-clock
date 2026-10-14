import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import VisualModeToggle, {
  VISUAL_MODES,
} from "@/components/globe/VisualModeToggle";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A ref factory that does nothing. Used wherever the test is
 * not asserting on ref plumbing, so the component still gets a
 * well-formed `optionRef` prop.
 */
function noopRef() {
  return () => {};
}

interface RenderOverrides {
  value?: "minimal" | "realistic";
  onChange?: (next: "minimal" | "realistic") => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

function renderToggle(overrides: RenderOverrides = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const onKeyDown = overrides.onKeyDown ?? vi.fn();
  const value = overrides.value ?? "minimal";

  const result = render(
    <VisualModeToggle
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      optionRef={noopRef}
    />,
  );

  return { ...result, onChange, onKeyDown };
}

/* -------------------------------------------------------------------------- */
/* VISUAL_MODES                                                               */
/* -------------------------------------------------------------------------- */

describe("VISUAL_MODES", () => {
  it("contains exactly the two supported modes", () => {
    expect(VISUAL_MODES.map((m) => m.value)).toEqual([
      "minimal",
      "realistic",
    ]);
  });

  it("places minimal before realistic in display order", () => {
    /*
     * The parent's arrow-key handler walks this array in order.
     * If the order ever changes, the handler's "next option"
     * computation must change with it — this test pins the
     * order so a reorder is a deliberate, visible edit.
     */
    expect(VISUAL_MODES[0]?.value).toBe("minimal");
    expect(VISUAL_MODES[1]?.value).toBe("realistic");
  });

  it("is frozen against runtime mutation", () => {
    expect(Object.isFrozen(VISUAL_MODES)).toBe(true);
  });

  it("gives every entry a non-empty label and shortLabel", () => {
    for (const mode of VISUAL_MODES) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.shortLabel.length).toBeGreaterThan(0);
    }
  });

  it("uses distinct values across entries", () => {
    const values = VISUAL_MODES.map((m) => m.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — structure", () => {
  it("renders without throwing", () => {
    expect(() => renderToggle()).not.toThrow();
  });

  it("renders a radiogroup with an accessible name", () => {
    renderToggle();
    expect(
      screen.getByRole("radiogroup", { name: "Globe visual style" }),
    ).toBeInTheDocument();
  });

  it("renders one radio per entry in VISUAL_MODES", () => {
    renderToggle();
    expect(screen.getAllByRole("radio")).toHaveLength(
      VISUAL_MODES.length,
    );
  });

  it("renders no buttons that are not radios", () => {
    /*
     * Every `<button>` in the group carries `role="radio"`. If a
     * future edit adds a chrome button (a reset, a help icon),
     * it must not be silently bundled into the radiogroup.
     */
    const { container } = renderToggle();
    const buttons = container.querySelectorAll("button");
    const radios = container.querySelectorAll("[role='radio']");
    expect(buttons.length).toBe(radios.length);
  });
});

/* -------------------------------------------------------------------------- */
/* Selection state                                                            */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — selection state", () => {
  it("marks the active option aria-checked=true", () => {
    renderToggle({ value: "minimal" });
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("aria-checked", "false");
  });

  it("reflects a realistic selection", () => {
    renderToggle({ value: "realistic" });
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
  });

  it("never marks two options as checked at once", () => {
    for (const value of ["minimal", "realistic"] as const) {
      const { unmount } = renderToggle({ value });
      const checked = screen
        .getAllByRole("radio")
        .filter((el) => el.getAttribute("aria-checked") === "true");
      expect(checked).toHaveLength(1);
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Roving tabindex                                                            */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — roving tabindex", () => {
  it("puts the active option at tabIndex 0", () => {
    renderToggle({ value: "realistic" });
    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toHaveAttribute("tabindex", "0");
  });

  it("puts every inactive option at tabIndex -1", () => {
    renderToggle({ value: "realistic" });
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");
  });

  it("exposes exactly one tab stop", () => {
    renderToggle({ value: "minimal" });
    const tabbable = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Interaction                                                                */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — click", () => {
  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    renderToggle({ value: "minimal", onChange });

    fireEvent.click(screen.getAllByRole("radio")[1]!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("realistic");
  });

  it("still calls onChange when the active option is clicked", () => {
    /*
     * Clicking the already-active option is a no-op in the
     * parent (the state does not change), but the component's
     * contract is "a click dispatches the value". Whether the
     * parent reacts is the parent's decision.
     */
    const onChange = vi.fn();
    renderToggle({ value: "minimal", onChange });

    fireEvent.click(screen.getAllByRole("radio")[0]!);

    expect(onChange).toHaveBeenCalledWith("minimal");
  });

  it("does not call onChange on a non-click interaction", () => {
    const onChange = vi.fn();
    renderToggle({ value: "minimal", onChange });

    fireEvent.mouseEnter(screen.getAllByRole("radio")[1]!);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("VisualModeToggle — keyboard forwarding", () => {
  it("forwards keydown events to the parent handler", () => {
    const onKeyDown = vi.fn();
    renderToggle({ onKeyDown });

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("forwards the event object so the parent can read `.key`", () => {
    const onKeyDown = vi.fn();
    renderToggle({ onKeyDown });

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "End",
    });

    expect(onKeyDown.mock.calls[0]?.[0]).toMatchObject({
      key: "End",
    });
  });

  it("does not process keys itself — it defers entirely to the parent", () => {
    /*
     * The component has no internal keyboard logic. A keydown
     * must not change the rendered state on its own. This test
     * would catch an accidental future addition of a local
     * keydown handler that duplicates the parent's work.
     */
    const onChange = vi.fn();
    renderToggle({ value: "minimal", onChange });

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Ref plumbing                                                               */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — optionRef plumbing", () => {
  it("calls the factory once per option, in index order", () => {
    /*
     * `optionRef` must be typed to take a `number` so that
     * `mock.calls[n][0]` reads as a number rather than as the
     * empty-tuple `[]` that an untyped `vi.fn(() => ...)`
     * produces.
     */
    const optionRef = vi.fn<(index: number) => () => void>(
      () => () => {},
    );

    render(
      <VisualModeToggle
        value="minimal"
        onChange={() => {}}
        onKeyDown={() => {}}
        optionRef={optionRef}
      />,
    );

    expect(optionRef).toHaveBeenCalledTimes(VISUAL_MODES.length);
    expect(optionRef.mock.calls.map((c) => c[0])).toEqual(
      VISUAL_MODES.map((_, i) => i),
    );
  });

  it("wires the returned ref to the corresponding button", () => {
    const received: Array<HTMLButtonElement | null> = [];
    const optionRef =
      (index: number) => (el: HTMLButtonElement | null) => {
        received[index] = el;
      };

    render(
      <VisualModeToggle
        value="minimal"
        onChange={() => {}}
        onKeyDown={() => {}}
        optionRef={optionRef}
      />,
    );

    const radios = screen.getAllByRole("radio");
    expect(received[0]).toBe(radios[0]);
    expect(received[1]).toBe(radios[1]);
  });
});