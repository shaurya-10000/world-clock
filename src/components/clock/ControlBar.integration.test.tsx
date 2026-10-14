import { vi } from "vitest";

/*
 * `AnimatePresence mode="wait"` defers mounting the incoming
 * child until the outgoing child finishes its exit animation.
 * Under `happy-dom` there is no animation loop, so exit never
 * completes and the new child never mounts — every test that
 * switches modes would fail. The mock makes `AnimatePresence`
 * a synchronous passthrough so both mount and unmount happen
 * in the same commit. `motion.*` elements are simplified to
 * plain DOM nodes; only the animations' `initial`/`exit`
 * behavior is stripped, not their structural role.
 */
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

import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi as vitest,
} from "vitest";

import ControlBar from "@/components/clock/ControlBar";
import type {
  ClockMode,
  TimeFormat,
} from "@/lib/time";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

interface RenderOptions {
  mode?: ClockMode;
  format?: TimeFormat;
  reducedMotion?: boolean;
}

function renderBar(options: RenderOptions = {}) {
  const onModeChange = vitest.fn();
  const onFormatChange = vitest.fn();

  const props = {
    mode: options.mode ?? "analog",
    format: options.format ?? "12h",
    onModeChange,
    onFormatChange,
    reducedMotion: options.reducedMotion ?? false,
  };

  const utils = render(<ControlBar {...props} />);

  return { onModeChange, onFormatChange, ...utils };
}

afterEach(() => {
  vitest.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Mode switching                                                             */
/* -------------------------------------------------------------------------- */

describe("ControlBar — mode switching", () => {
  it("renders the Analog and Digital options", () => {
    renderBar();

    expect(
      screen.getByRole("button", { name: "Analog" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Digital" }),
    ).toBeInTheDocument();
  });

  it("marks Analog as pressed when mode is analog", () => {
    renderBar({ mode: "analog" });

    expect(
      screen.getByRole("button", { name: "Analog" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Digital" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Digital as pressed when mode is digital", () => {
    renderBar({ mode: "digital" });

    expect(
      screen.getByRole("button", { name: "Digital" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Analog" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onModeChange('digital') when Digital is clicked", () => {
    const { onModeChange } = renderBar({ mode: "analog" });

    fireEvent.click(
      screen.getByRole("button", { name: "Digital" }),
    );

    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("digital");
  });

  it("calls onModeChange('analog') when Analog is clicked", () => {
    const { onModeChange } = renderBar({ mode: "digital" });

    fireEvent.click(
      screen.getByRole("button", { name: "Analog" }),
    );

    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("analog");
  });

  it("does not call onModeChange when the already-active option is clicked", () => {
    /*
     * The control is a toggle — the callback fires on every
     * click, including on the already-active button. The
     * parent is expected to no-op in that case. This pins
     * the component's contract: it does not dedupe.
     */
    const { onModeChange } = renderBar({ mode: "analog" });

    fireEvent.click(
      screen.getByRole("button", { name: "Analog" }),
    );

    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("analog");
  });
});

/* -------------------------------------------------------------------------- */
/* Conditional format bar                                                     */
/* -------------------------------------------------------------------------- */

describe("ControlBar — conditional format bar", () => {
  it("hides the format control when mode is analog", () => {
    renderBar({ mode: "analog" });

    expect(
      screen.queryByRole("group", {
        name: "Digital time format",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the format control when mode is digital", () => {
    renderBar({ mode: "digital" });

    expect(
      screen.getByRole("group", {
        name: "Digital time format",
      }),
    ).toBeInTheDocument();
  });

  it("reveals the format control when switching from analog to digital", () => {
    const { rerender, onModeChange, onFormatChange } = renderBar({
      mode: "analog",
    });

    // Re-render as if the parent had flipped the mode.
    rerender(
      <ControlBar
        mode="digital"
        format="12h"
        onModeChange={onModeChange}
        onFormatChange={onFormatChange}
        reducedMotion={false}
      />,
    );

    expect(
      screen.getByRole("group", {
        name: "Digital time format",
      }),
    ).toBeInTheDocument();
  });

  it("hides the format control when switching from digital to analog", () => {
    const { rerender } = renderBar({ mode: "digital" });

    const onModeChange = vitest.fn();
    const onFormatChange = vitest.fn();

    rerender(
      <ControlBar
        mode="analog"
        format="12h"
        onModeChange={onModeChange}
        onFormatChange={onFormatChange}
        reducedMotion={false}
      />,
    );

    expect(
      screen.queryByRole("group", {
        name: "Digital time format",
      }),
    ).not.toBeInTheDocument();
  });

  it("reveals and hides the format control across multiple transitions", () => {
    /*
     * A single round-trip (analog → digital → analog) covers
     * the two transitions individually. This test cycles
     * twice to catch a hypothetical one-shot bug where the
     * format control mounts on the first transition but not
     * the second.
     */
    const onModeChange = vitest.fn();
    const onFormatChange = vitest.fn();

    const renderAt = (mode: ClockMode) =>
      render(
        <ControlBar
          mode={mode}
          format="12h"
          onModeChange={onModeChange}
          onFormatChange={onFormatChange}
          reducedMotion={false}
        />,
      );

    const { rerender } = renderAt("analog");

    for (let i = 0; i < 2; i += 1) {
      rerender(
        <ControlBar
          mode="digital"
          format="12h"
          onModeChange={onModeChange}
          onFormatChange={onFormatChange}
          reducedMotion={false}
        />,
      );

      expect(
        screen.getByRole("group", {
          name: "Digital time format",
        }),
      ).toBeInTheDocument();

      rerender(
        <ControlBar
          mode="analog"
          format="12h"
          onModeChange={onModeChange}
          onFormatChange={onFormatChange}
          reducedMotion={false}
        />,
      );

      expect(
        screen.queryByRole("group", {
          name: "Digital time format",
        }),
      ).not.toBeInTheDocument();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Format switching                                                           */
/* -------------------------------------------------------------------------- */

describe("ControlBar — format switching", () => {
  it("renders the 12H and 24H options in digital mode", () => {
    renderBar({ mode: "digital" });

    expect(
      screen.getByRole("button", { name: "12H" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "24H" }),
    ).toBeInTheDocument();
  });

  it("marks 12H as pressed when format is 12h", () => {
    renderBar({ mode: "digital", format: "12h" });

    expect(
      screen.getByRole("button", { name: "12H" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "24H" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("marks 24H as pressed when format is 24h", () => {
    renderBar({ mode: "digital", format: "24h" });

    expect(
      screen.getByRole("button", { name: "24H" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "12H" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onFormatChange('24h') when 24H is clicked", () => {
    const { onFormatChange } = renderBar({
      mode: "digital",
      format: "12h",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "24H" }),
    );

    expect(onFormatChange).toHaveBeenCalledTimes(1);
    expect(onFormatChange).toHaveBeenCalledWith("24h");
  });

  it("calls onFormatChange('12h') when 12H is clicked", () => {
    const { onFormatChange } = renderBar({
      mode: "digital",
      format: "24h",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "12H" }),
    );

    expect(onFormatChange).toHaveBeenCalledTimes(1);
    expect(onFormatChange).toHaveBeenCalledWith("12h");
  });

  it("does not call onFormatChange when mode is analog (button absent)", () => {
    /*
     * In analog mode, the format control is not rendered.
     * There is no `12H` or `24H` button to click. This test
     * documents that the callback cannot fire from the
     * analog state.
     */
    const { onFormatChange } = renderBar({ mode: "analog" });

    expect(
      screen.queryByRole("button", { name: "12H" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "24H" }),
    ).not.toBeInTheDocument();
    expect(onFormatChange).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("ControlBar — reduced motion", () => {
  it("renders without throwing when reduced motion is on", () => {
    expect(() =>
      renderBar({
        mode: "digital",
        reducedMotion: true,
      }),
    ).not.toThrow();
  });

  it("still renders both controls when reduced motion is on", () => {
    renderBar({ mode: "digital", reducedMotion: true });

    expect(
      screen.getByRole("group", { name: "Clock display" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Digital time format" }),
    ).toBeInTheDocument();
  });

  it("still reveals the format control when switching modes under reduced motion", () => {
    /*
     * Reduced motion disables the animation, not the
     * mount/unmount. The format control must still appear
     * when mode flips to digital.
     */
    const onModeChange = vitest.fn();
    const onFormatChange = vitest.fn();

    const { rerender } = render(
      <ControlBar
        mode="analog"
        format="12h"
        onModeChange={onModeChange}
        onFormatChange={onFormatChange}
        reducedMotion={true}
      />,
    );

    expect(
      screen.queryByRole("group", {
        name: "Digital time format",
      }),
    ).not.toBeInTheDocument();

    rerender(
      <ControlBar
        mode="digital"
        format="12h"
        onModeChange={onModeChange}
        onFormatChange={onFormatChange}
        reducedMotion={true}
      />,
    );

    expect(
      screen.getByRole("group", {
        name: "Digital time format",
      }),
    ).toBeInTheDocument();
  });
});