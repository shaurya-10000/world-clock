import { vi } from "vitest";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const actual =
    await vi.importActual<typeof import("framer-motion")>(
      "framer-motion",
    );

  const makePlain = (tag: string) => {
    const Component = React.forwardRef<HTMLElement>(
      (props, ref) => {
        const {
          children,
          animate: _animate,
          initial: _initial,
          exit: _exit,
          transition: _transition,
          ...rest
        } = props as Record<string, unknown>;
        void _animate;
        void _initial;
        void _exit;
        void _transition;
        return React.createElement(
          tag,
          { ...rest, ref },
          children as React.ReactNode,
        );
      },
    );
    Component.displayName = `motion.${tag}`;
    return Component;
  };

  return {
    ...actual,
    motion: {
      div: makePlain("div"),
      span: makePlain("span"),
      button: makePlain("button"),
      a: makePlain("a"),
      aside: makePlain("aside"),
    },
    AnimatePresence: ({
      children,
    }: {
      children: React.ReactNode;
    }) => React.createElement(React.Fragment, null, children),
  };
});

import { render, screen } from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi as vitest,
} from "vitest";

import ControlBar from "@/components/clock/ControlBar";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function renderBar(
  overrides: Partial<
    React.ComponentProps<typeof ControlBar>
  > = {},
) {
  return render(
    <ControlBar
      mode="analog"
      format="12h"
      onModeChange={vitest.fn()}
      onFormatChange={vitest.fn()}
      reducedMotion={false}
      {...overrides}
    />,
  );
}

afterEach(() => {
  vitest.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("ControlBar — structure", () => {
  it("renders the clock display group", () => {
    renderBar();

    expect(
      screen.getByRole("group", { name: "Clock display" }),
    ).toBeInTheDocument();
  });

  it("renders two buttons inside the clock display group", () => {
    renderBar();

    const group = screen.getByRole("group", {
      name: "Clock display",
    });
    const buttons = group.querySelectorAll("button");

    expect(buttons).toHaveLength(2);
  });

  it("renders a decorative indicator in the clock display group", () => {
    renderBar();

    const group = screen.getByRole("group", {
      name: "Clock display",
    });
    const hidden = group.querySelectorAll(
      '[aria-hidden="true"]',
    );

    expect(hidden.length).toBeGreaterThan(0);
  });

  it("renders the Analog and Digital button labels", () => {
    renderBar();

    expect(
      screen.getByRole("button", { name: "Analog" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Digital" }),
    ).toBeInTheDocument();
  });

  it("renders exactly two buttons when mode is analog", () => {
    /*
     * The format control is hidden in analog mode. Only the
     * two mode buttons are present.
     */
    renderBar({ mode: "analog" });

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("renders exactly four buttons when mode is digital", () => {
    /*
     * The format control appears in digital mode, adding
     * two more buttons (12H and 24H).
     */
    renderBar({ mode: "digital" });

    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("ControlBar — accessibility", () => {
  it("every button has an accessible name", () => {
    renderBar({ mode: "digital" });

    const buttons = screen.getAllByRole("button");

    for (const button of buttons) {
      expect(
        button.textContent?.trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it("every button exposes aria-pressed", () => {
    renderBar({ mode: "digital" });

    const buttons = screen.getAllByRole("button");

    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-pressed");
    }
  });

  it("exactly one button per group has aria-pressed=true", () => {
    /*
     * Each segmented control has exactly two buttons and
     * exactly one of them is pressed — the control is a
     * toggle, not a checkbox set. Verify per group.
     */
    renderBar({ mode: "digital", format: "12h" });

    for (const groupName of [
      "Clock display",
      "Digital time format",
    ]) {
      const group = screen.getByRole("group", {
        name: groupName,
      });
      const pressed = Array.from(
        group.querySelectorAll("button"),
      ).filter(
        (b) => b.getAttribute("aria-pressed") === "true",
      );

      expect(pressed).toHaveLength(1);
    }
  });

  it("does not introduce headings or landmarks", () => {
    renderBar();

    expect(
      screen.queryByRole("heading"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("banner"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("main"),
    ).not.toBeInTheDocument();
  });

  it("groups the format options under a labelled group when visible", () => {
    renderBar({ mode: "digital" });

    expect(
      screen.getByRole("group", {
        name: "Digital time format",
      }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Visual variant                                                             */
/* -------------------------------------------------------------------------- */

describe("ControlBar — visual variant", () => {
  it("applies the strong variant to the mode control", () => {
    renderBar();

    const group = screen.getByRole("group", {
      name: "Clock display",
    });
    const indicator = group.querySelector<HTMLElement>(
      '[aria-hidden="true"]',
    );

    /*
     * The strong variant renders the indicator filled with
     * the foreground color. The weak variant uses a subtle
     * tinted class.
     */
    expect(indicator?.className).toContain(
      "bg-[var(--foreground)]",
    );
  });

  it("applies the weak variant to the format control", () => {
    renderBar({ mode: "digital" });

    const group = screen.getByRole("group", {
      name: "Digital time format",
    });
    const indicator = group.querySelector<HTMLElement>(
      '[aria-hidden="true"]',
    );

    expect(indicator?.className).toContain(
      "bg-[var(--foreground)]/[0.08]",
    );
  });

  it("strong and weak indicators use different background classes", () => {
    /*
     * The two variants must be visually distinguishable. A
     * refactor that collapsed them to the same class would
     * pass the two tests above by accident if the shared
     * class matched both checks — this test ensures the two
     * are genuinely different strings.
     */
    renderBar({ mode: "digital" });

    const modeGroup = screen.getByRole("group", {
      name: "Clock display",
    });
    const formatGroup = screen.getByRole("group", {
      name: "Digital time format",
    });

    const modeIndicator = modeGroup.querySelector<HTMLElement>(
      '[aria-hidden="true"]',
    );
    const formatIndicator =
      formatGroup.querySelector<HTMLElement>(
        '[aria-hidden="true"]',
      );

    expect(modeIndicator?.className).not.toBe(
      formatIndicator?.className,
    );
  });
});