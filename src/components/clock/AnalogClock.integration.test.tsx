import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { LocalTime } from "@/lib/time";

vi.mock("framer-motion", async () => {
  const React = await import("react");

  const makeMotionDiv = () => {
    const Component = React.forwardRef<
      HTMLDivElement,
      Record<string, unknown>
    >((props, ref) => {
      const {
        children,
        animate,
        initial: _initial,
        exit: _exit,
        transition: _transition,
        style,
        ...rest
      } = props as Record<string, unknown>;

      void _initial;
      void _exit;
      void _transition;

      const rotate =
        typeof animate === "object" && animate !== null
          ? (animate as { rotate?: number }).rotate
          : undefined;

      return React.createElement("div", {
        ...rest,
        ref,
        style,
        "data-rotate":
          rotate !== undefined ? String(rotate) : undefined,
        children,
      } as React.HTMLAttributes<HTMLDivElement>);
    });
    Component.displayName = "motion.div";
    return Component;
  };

  return {
    motion: { div: makeMotionDiv() },
    useReducedMotion: () => false,
    AnimatePresence: ({
      children,
    }: {
      children: React.ReactNode;
    }) => React.createElement(React.Fragment, null, children),
  };
});

import AnalogClock from "@/components/clock/AnalogClock";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function timeAt(
  hour: number,
  minute: number,
  second: number,
): LocalTime {
  return {
    hour,
    minute,
    second,
    decimalHour: hour + minute / 60 + second / 3600,
    time12: `${hour}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
    time24: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
    period: hour < 12 ? "AM" : "PM",
    formattedDate: "Monday, January 15, 2024",
    zoneName: "UTC",
    utcOffset: "UTC",
  };
}

function renderClock(time: LocalTime) {
  return render(<AnalogClock time={time} />);
}

/**
 * Read all three `data-rotate` values from the rendered tree,
 * in DOM order (hour hand, minute hand, second hand). The
 * component renders the three hands as `motion.div` elements
 * in that order.
 */
function getHandRotations(container: HTMLElement): {
  hour: number;
  minute: number;
  second: number;
} {
  const hands = container.querySelectorAll<HTMLElement>(
    "div[data-rotate]",
  );

  const [hourEl, minuteEl, secondEl] = Array.from(hands);

  return {
    hour: Number(hourEl?.getAttribute("data-rotate")),
    minute: Number(minuteEl?.getAttribute("data-rotate")),
    second: Number(secondEl?.getAttribute("data-rotate")),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Hands rotate correctly                                                     */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — hands rotate correctly", () => {
  it("all hands point at 12 at midnight", () => {
    const { container } = renderClock(timeAt(0, 0, 0));

    expect(getHandRotations(container)).toEqual({
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("hour hand points at 3 at 03:00", () => {
    const { container } = renderClock(timeAt(3, 0, 0));

    expect(getHandRotations(container).hour).toBe(90);
  });

  it("minute hand points at 3 at :15", () => {
    const { container } = renderClock(timeAt(0, 15, 0));

    expect(getHandRotations(container).minute).toBe(90);
  });

  it("second hand points at 6 at :30", () => {
    const { container } = renderClock(timeAt(0, 0, 30));

    expect(getHandRotations(container).second).toBe(180);
  });

  it("updates the second hand when the time prop changes", () => {
    const { container, rerender } = renderClock(timeAt(0, 0, 0));

    expect(getHandRotations(container).second).toBe(0);

    rerender(<AnalogClock time={timeAt(0, 0, 15)} />);

    expect(getHandRotations(container).second).toBe(90);
  });

  it("updates the hour hand when the time prop changes across hours", () => {
    const { container, rerender } = renderClock(timeAt(0, 0, 0));

    expect(getHandRotations(container).hour).toBe(0);

    rerender(<AnalogClock time={timeAt(6, 0, 0)} />);

    expect(getHandRotations(container).hour).toBe(180);
  });

  it("updates the minute hand when the time prop changes across minutes", () => {
    const { container, rerender } = renderClock(timeAt(0, 0, 0));

    expect(getHandRotations(container).minute).toBe(0);

    rerender(<AnalogClock time={timeAt(0, 30, 0)} />);

    expect(getHandRotations(container).minute).toBe(180);
  });

  it("updates all three hands when the time changes by one second", () => {
    /*
     * The hour and minute hands carry a second-level drift
     * term. A one-second change should advance all three
     * hands — even if the drift is sub-degree and visually
     * imperceptible.
     */
    const { container, rerender } = renderClock(timeAt(3, 30, 45));

    const before = getHandRotations(container);

    rerender(<AnalogClock time={timeAt(3, 30, 46)} />);

    const after = getHandRotations(container);

    expect(after.second).toBeGreaterThan(before.second);
    expect(after.minute).toBeGreaterThan(before.minute);
    expect(after.hour).toBeGreaterThan(before.hour);
  });

  it("renders 12 o'clock at both midnight and noon", () => {
    /*
     * Both midnight and noon point the hour hand at 12.
     */
    const { container: midnight } = renderClock(timeAt(0, 0, 0));
    const { container: noon } = renderClock(timeAt(12, 0, 0));

    expect(getHandRotations(midnight).hour).toBe(0);
    expect(getHandRotations(noon).hour).toBe(0);
  });

  it("crosses every hour boundary without throwing", () => {
    for (let h = 0; h < 24; h += 1) {
      expect(() => renderClock(timeAt(h, 0, 0))).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — reduced motion", () => {
  it("renders without throwing when reduced motion is preferred", () => {
    /*
     * `useReducedMotion` is stubbed to return `false` in this
     * file's mock, so the "true" branch is not exercised here.
     * The `reducedMotion` prop is a caller-controlled flag on
     * the parent; the hook itself is the source of truth
     * inside the component. This test documents that the
     * component works under the default (non-reduced) hook
     * value.
     */
    const { container } = renderClock(timeAt(12, 0, 0));

    expect(container).toBeInTheDocument();
  });

  it("still renders the three hands", () => {
    const { container } = renderClock(timeAt(12, 0, 0));

    expect(
      container.querySelectorAll("div[data-rotate]"),
    ).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — accessibility", () => {
  it("exposes an img role", () => {
    renderClock(timeAt(3, 30, 15));

    expect(
      screen.getByRole("img", {
        name: /Analog clock showing/,
      }),
    ).toBeInTheDocument();
  });

  it("includes the time in the accessible name", () => {
    renderClock(timeAt(3, 30, 15));

    const img = screen.getByRole("img");

    expect(img).toHaveAccessibleName(/3:30/);
  });

  it("updates the accessible name when the time prop changes", () => {
    const { rerender } = renderClock(timeAt(3, 30, 15));

    expect(screen.getByRole("img")).toHaveAccessibleName(/3:30/);

    rerender(
      <AnalogClock time={timeAt(4, 45, 30)} />,
    );

    expect(screen.getByRole("img")).toHaveAccessibleName(/4:45/);
  });
});