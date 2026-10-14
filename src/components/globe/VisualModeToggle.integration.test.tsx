import { fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import VisualModeToggle, {
  VISUAL_MODES,
} from "@/components/globe/VisualModeToggle";
import type { GlobeVisualMode } from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A parent that exercises the exact contract `Globe.tsx` relies
 * on: roving tabindex, arrow-key navigation with wrap, Home/End,
 * and ref-driven focus. This is the shape the component is
 * designed for, so the integration suite wires it up for real
 * rather than asserting against a mock.
 */
function Harness({
  initial = "minimal" as GlobeVisualMode,
  onChange,
}: {
  initial?: GlobeVisualMode;
  onChange?: (next: GlobeVisualMode) => void;
}) {
  const [value, setValue] = useState<GlobeVisualMode>(initial);

  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const optionRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      optionRefs.current[index] = el;
    },
    [],
  );

  const handleChange = useCallback(
    (next: GlobeVisualMode) => {
      setValue(next);
      onChange?.(next);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = VISUAL_MODES.map((m) => m.value);
      const currentIndex = keys.indexOf(value);

      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % keys.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex =
            (currentIndex - 1 + keys.length) % keys.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = keys.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();

      const next = keys[nextIndex]!;
      setValue(next);
      optionRefs.current[nextIndex]?.focus();
    },
    [value],
  );

  return (
    <VisualModeToggle
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      optionRef={optionRef}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Round trips                                                                */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — round trips", () => {
  it("updates the checked option after a click", () => {
    render(<Harness />);

    fireEvent.click(screen.getAllByRole("radio")[1]!);

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
  });

  it("moves the roving tab stop after a click", () => {
    render(<Harness />);

    fireEvent.click(screen.getAllByRole("radio")[1]!);

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");
    expect(radios[1]).toHaveAttribute("tabindex", "0");
  });

  it("notifies the parent on every click, including re-selection", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("radio")[1]!);
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.click(screen.getAllByRole("radio")[0]!);

    expect(onChange.mock.calls.map((c) => c[0])).toEqual([
      "realistic",
      "minimal",
      "minimal",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Arrow-key navigation                                                       */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — arrow-key navigation", () => {
  it("advances to the next option on ArrowRight", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("wraps from the last option to the first on ArrowRight", () => {
    render(<Harness initial="realistic" />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    expect(screen.getAllByRole("radio")[0]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("wraps from the first option to the last on ArrowLeft", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowLeft",
    });

    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("treats ArrowDown identically to ArrowRight", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowDown",
    });

    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("treats ArrowUp identically to ArrowLeft", () => {
    render(<Harness initial="realistic" />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowUp",
    });

    expect(screen.getAllByRole("radio")[0]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("jumps to the first option on Home", () => {
    render(<Harness initial="realistic" />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "Home",
    });

    expect(screen.getAllByRole("radio")[0]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("jumps to the last option on End", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "End",
    });

    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Focus management                                                           */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — focus management", () => {
  it("moves DOM focus to the newly-selected option on arrow", () => {
    render(<Harness />);

    const radios = screen.getAllByRole("radio");
    radios[0]!.focus();
    expect(radios[0]).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    expect(screen.getAllByRole("radio")[1]).toHaveFocus();
  });

  it("moves focus to the first option on Home", () => {
    render(<Harness initial="realistic" />);

    screen.getAllByRole("radio")[1]!.focus();
    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "Home",
    });

    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
  });

  it("moves focus to the last option on End", () => {
    render(<Harness />);

    screen.getAllByRole("radio")[0]!.focus();
    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "End",
    });

    expect(screen.getAllByRole("radio")[1]).toHaveFocus();
  });

  it("keeps focus on the group when an unhandled key is pressed", () => {
    render(<Harness />);

    const radios = screen.getAllByRole("radio");
    radios[0]!.focus();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "Tab",
    });

    expect(radios[0]).toHaveFocus();
  });
});

/* -------------------------------------------------------------------------- */
/* Controlled-ness                                                            */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — controlled contract", () => {
  it("does not change its own checked state without a parent re-render", () => {
    /*
     * The component is fully controlled. A click dispatches
     * `onChange` but the parent is the only thing that can
     * flip `aria-checked`. A "frozen parent" — one that ignores
     * `onChange` — must leave the component's rendered output
     * unchanged.
     */
    render(
      <VisualModeToggle
        value="minimal"
        onChange={() => {}}
        onKeyDown={() => {}}
        optionRef={() => () => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole("radio")[1]!);

    expect(screen.getAllByRole("radio")[0]).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("reflects a value prop change immediately", () => {
    const { rerender } = render(
      <VisualModeToggle
        value="minimal"
        onChange={() => {}}
        onKeyDown={() => {}}
        optionRef={() => () => {}}
      />,
    );

    rerender(
      <VisualModeToggle
        value="realistic"
        onChange={() => {}}
        onKeyDown={() => {}}
        optionRef={() => () => {}}
      />,
    );

    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility guarantees                                                   */
/* -------------------------------------------------------------------------- */

describe("VisualModeToggle — accessibility", () => {
  it("exposes exactly one radio as the tab stop across arrow navigation", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });
    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    const tabbable = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });

  it("exposes exactly one radio as checked across arrow navigation", () => {
    render(<Harness />);

    for (const key of ["ArrowRight", "ArrowRight", "End", "Home"]) {
      fireEvent.keyDown(screen.getByRole("radiogroup"), { key });

      const checked = screen
        .getAllByRole("radio")
        .filter((el) => el.getAttribute("aria-checked") === "true");
      expect(checked).toHaveLength(1);
    }
  });

  it("does not render any focusable element outside the radiogroup", () => {
    const { container } = render(<Harness />);

    const group = container.querySelector("[role='radiogroup']");
    expect(group).not.toBeNull();

    /*
     * Walk every focusable element in the container and assert
     * that none of them lives outside the radiogroup. The
     * radiogroup's own tab stop (the active radio) is a
     * descendant of `group`, so `group.contains(el)` returns
     * true for it and it is filtered out. A stray `<a>`,
     * `<input>`, or `<button>` added next to the toggle in a
     * future edit would live outside `group`, would survive
     * the filter, and would fail this assertion.
     *
     * `button` is included in the selector on purpose: the
     * radiogroup's own options are `<button role="radio">`,
     * and a future "reset" or "help" button added as a
     * sibling would otherwise slip past a selector that only
     * looked for `[tabindex]` and form controls.
     */
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      ),
    );

    const outside = focusable.filter(
      (el) => !group!.contains(el),
    );

    expect(outside).toHaveLength(0);
  });
});