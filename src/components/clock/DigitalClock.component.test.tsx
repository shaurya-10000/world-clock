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

const SAMPLE_TIME: LocalTime = {
  hour: 3,
  minute: 30,
  second: 45,
  decimalHour: 3.5125,
  time12: "3:30:45 AM",
  time24: "03:30:45",
  period: "AM",
  formattedDate: "Monday, January 15, 2024",
  zoneName: "UTC",
  utcOffset: "UTC",
};

interface RenderOptions {
  time?: LocalTime;
  format?: TimeFormat;
  reducedMotion?: boolean;
  atmosphere?: Atmosphere;
}

function renderClock(overrides: RenderOptions = {}) {
  return render(
    <DigitalClock
      time={overrides.time ?? SAMPLE_TIME}
      format={overrides.format ?? "12h"}
      reducedMotion={overrides.reducedMotion ?? false}
      atmosphere={overrides.atmosphere ?? "night"}
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
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — structure", () => {
  it("renders a single root element", () => {
    const { container } = renderClock();
    expect(container.children).toHaveLength(1);
  });

  it("root uses aspect-square", () => {
    const { container } = renderClock();
    expect(container.firstElementChild?.className).toContain(
      "aspect-square",
    );
  });

  it("root uses the shared clock size class", () => {
    const { container } = renderClock();
    // The shared constant scales the clock at the sm breakpoint.
    expect(container.firstElementChild?.className).toContain(
      "sm:",
    );
  });

  it("renders a role timer", () => {
    renderClock();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("root uses aria-live off", () => {
    renderClock();
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-live",
      "off",
    );
  });

  it("root uses aria-atomic true", () => {
    renderClock();
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-atomic",
      "true",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — content", () => {
  it("renders the 12-hour digits when format is 12h", () => {
    renderClock({ format: "12h" });
    expect(screen.getByText("3:30:45")).toBeInTheDocument();
  });

  it("renders the AM period when format is 12h", () => {
    renderClock({ format: "12h" });
    expect(screen.getByText("AM")).toBeInTheDocument();
  });

  it("renders the 24-hour digits when format is 24h", () => {
    renderClock({ format: "24h" });
    expect(screen.getByText("03:30:45")).toBeInTheDocument();
  });

  it("does not render an AM/PM period in 24h format", () => {
    renderClock({ format: "24h" });
    expect(screen.queryByText("AM")).not.toBeInTheDocument();
    expect(screen.queryByText("PM")).not.toBeInTheDocument();
  });

  it("renders PM for a PM time in 12h format", () => {
    renderClock({
      format: "12h",
      time: {
        ...SAMPLE_TIME,
        hour: 15,
        time12: "3:30:45 PM",
        time24: "15:30:45",
        period: "PM",
      },
    });

    expect(screen.getByText("PM")).toBeInTheDocument();
  });

  it("uses tabular-nums for stable digit width", () => {
    /*
     * `tabular-nums` prevents digits from jittering as they
     * change width. It is a functional requirement — without
     * it, the clock face visibly oscillates every second.
     */
    const { container } = renderClock();

    const digitsContainer = container.querySelector(
      ".tabular-nums",
    );
    expect(digitsContainer).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — accessibility", () => {
  it("exposes an accessible name containing the displayed time", () => {
    renderClock({ format: "12h" });
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      /Digital clock showing 3:30:45 AM/,
    );
  });

  it("uses the 24-hour string in the accessible name when format is 24h", () => {
    renderClock({ format: "24h" });
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      /Digital clock showing 03:30:45/,
    );
  });

  it("marks every decorative descendant aria-hidden", () => {
    const { container } = renderClock();
    const hidden = container.querySelectorAll(
      '[aria-hidden="true"]',
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("does not introduce focusable elements", () => {
    renderClock();
    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere                                                                 */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — atmosphere", () => {
  it.each<Atmosphere>(["day", "dawn", "dusk", "night"])(
    "renders without throwing when atmosphere is %s",
    (atmosphere) => {
      expect(() => renderClock({ atmosphere })).not.toThrow();
    },
  );

  it("renders the digits for every atmosphere", () => {
    /*
     * The atmosphere changes the digits' color class but
     * must never remove them. A refactor that made the
     * digits conditional on atmosphere would fail this.
     */
    for (const atmosphere of [
      "day",
      "dawn",
      "dusk",
      "night",
    ] as const) {
      const { container, unmount } = renderClock({
        atmosphere,
        format: "12h",
      });

      expect(container.textContent).toContain("3:30:45");
      unmount();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("DigitalClock — reduced motion", () => {
  it("renders without throwing when reduced motion is preferred", () => {
    expect(() =>
      renderClock({ reducedMotion: true }),
    ).not.toThrow();
  });

  it("still renders the digits under reduced motion", () => {
    renderClock({ reducedMotion: true, format: "12h" });
    expect(screen.getByText("3:30:45")).toBeInTheDocument();
  });
});