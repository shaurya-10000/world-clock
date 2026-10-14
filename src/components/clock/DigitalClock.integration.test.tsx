import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Atmosphere } from "@/lib/atmosphere";
import type { LocalTime, TimeFormat } from "@/lib/time";

vi.mock("framer-motion", async () => {
  const React = await import("react");

  const makeMotionDiv = () => {
    const Component = React.forwardRef<
      HTMLDivElement,
      Record<string, unknown>
    >((props, ref) => {
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
      return React.createElement("div", {
        ...rest,
        ref,
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

import DigitalClock from "@/components/clock/DigitalClock";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Builds a `LocalTime` fixture with a correctly converted
 * 12-hour string. Hours above 12 are folded into 1–12 so the
 * `time12` field matches what the real `getLocalTime` returns.
 */
function timeAt(
  hour: number,
  minute: number,
  second: number,
  period: "AM" | "PM" = "AM",
): LocalTime {
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return {
    hour,
    minute,
    second,
    decimalHour: hour + minute / 60 + second / 3600,
    time12: `${hour12}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} ${period}`,
    time24: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
    period,
    formattedDate: "Monday, January 15, 2024",
    zoneName: "UTC",
    utcOffset: "UTC",
  };
}

interface RenderOptions {
  time: LocalTime;
  format?: TimeFormat;
  atmosphere?: Atmosphere;
  reducedMotion?: boolean;
}

function renderClock({
  time,
  format = "12h",
  atmosphere = "night",
  reducedMotion = false,
}: RenderOptions) {
  return render(
    <DigitalClock
      time={time}
      format={format}
      reducedMotion={reducedMotion}
      atmosphere={atmosphere}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Time updates                                                               */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — time updates", () => {
  it("updates the displayed digits when the time prop changes", () => {
    const { rerender } = renderClock({ time: timeAt(3, 30, 45) });

    expect(screen.getByText("3:30:45")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(3, 30, 46)}
        format="12h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("3:30:46")).toBeInTheDocument();
    expect(screen.queryByText("3:30:45")).not.toBeInTheDocument();
  });

  it("updates the accessible name when the time prop changes", () => {
    const { rerender } = renderClock({ time: timeAt(3, 30, 45) });

    expect(screen.getByRole("timer")).toHaveAccessibleName(
      /3:30:45 AM/,
    );

    rerender(
      <DigitalClock
        time={timeAt(3, 30, 46)}
        format="12h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByRole("timer")).toHaveAccessibleName(
      /3:30:46 AM/,
    );
  });

  it("updates the AM/PM period when crossing noon", () => {
    const { rerender } = renderClock({
      time: timeAt(11, 59, 59, "AM"),
    });

    expect(screen.getByText("AM")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(12, 0, 0, "PM")}
        format="12h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("PM")).toBeInTheDocument();
    expect(screen.queryByText("AM")).not.toBeInTheDocument();
  });

  it("updates the AM/PM period when crossing midnight", () => {
    const { rerender } = renderClock({
      time: timeAt(23, 59, 59, "PM"),
    });

    expect(screen.getByText("PM")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(0, 0, 0, "AM")}
        format="12h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("AM")).toBeInTheDocument();
    expect(screen.queryByText("PM")).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Format switching                                                           */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — format switching", () => {
  it("switches from 12h to 24h when the format prop changes", () => {
    const { rerender } = renderClock({
      time: timeAt(15, 30, 45, "PM"),
      format: "12h",
    });

    expect(screen.getByText("3:30:45")).toBeInTheDocument();
    expect(screen.getByText("PM")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(15, 30, 45, "PM")}
        format="24h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("15:30:45")).toBeInTheDocument();
    expect(screen.queryByText("PM")).not.toBeInTheDocument();
  });

  it("switches from 24h to 12h when the format prop changes", () => {
    const { rerender } = renderClock({
      time: timeAt(15, 30, 45, "PM"),
      format: "24h",
    });

    expect(screen.getByText("15:30:45")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(15, 30, 45, "PM")}
        format="12h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("3:30:45")).toBeInTheDocument();
    expect(screen.getByText("PM")).toBeInTheDocument();
  });

  it("updates the accessible name when switching formats", () => {
    const { rerender } = renderClock({
      time: timeAt(15, 30, 45, "PM"),
      format: "12h",
    });

    expect(screen.getByRole("timer")).toHaveAccessibleName(
      /3:30:45 PM/,
    );

    rerender(
      <DigitalClock
        time={timeAt(15, 30, 45, "PM")}
        format="24h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByRole("timer")).toHaveAccessibleName(
      /15:30:45/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere transitions                                                     */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — atmosphere transitions", () => {
  it("renders across all atmospheres without losing the time", () => {
    const atmospheres: Atmosphere[] = [
      "day",
      "dawn",
      "dusk",
      "night",
    ];
    const { rerender } = renderClock({
      time: timeAt(3, 30, 45),
      atmosphere: atmospheres[0],
    });

    for (const atmosphere of atmospheres.slice(1)) {
      rerender(
        <DigitalClock
          time={timeAt(3, 30, 45)}
          format="12h"
          reducedMotion={false}
          atmosphere={atmosphere}
        />,
      );
      expect(screen.getByText("3:30:45")).toBeInTheDocument();
    }
  });

  it("preserves the digits across an atmosphere transition", () => {
    /*
     * Changing atmosphere must not lose the digits. Sample
     * every ordered pair of atmospheres.
     */
    const atmospheres: Atmosphere[] = [
      "night",
      "day",
      "dawn",
      "dusk",
    ];

    const { rerender } = renderClock({
      time: timeAt(15, 30, 45, "PM"),
      atmosphere: atmospheres[0],
      format: "12h",
    });

    for (const atmosphere of atmospheres.slice(1)) {
      rerender(
        <DigitalClock
          time={timeAt(15, 30, 45, "PM")}
          format="12h"
          reducedMotion={false}
          atmosphere={atmosphere}
        />,
      );
      expect(screen.getByText("3:30:45")).toBeInTheDocument();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — reduced motion", () => {
  it("crosses the reduced-motion boundary without losing the digits", () => {
    const { rerender } = renderClock({
      time: timeAt(3, 30, 45),
      reducedMotion: false,
    });

    expect(screen.getByText("3:30:45")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(3, 30, 45)}
        format="12h"
        reducedMotion={true}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("3:30:45")).toBeInTheDocument();

    rerender(
      <DigitalClock
        time={timeAt(3, 30, 45)}
        format="12h"
        reducedMotion={false}
        atmosphere="night"
      />,
    );

    expect(screen.getByText("3:30:45")).toBeInTheDocument();
  });
});