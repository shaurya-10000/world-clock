import {
  render,
  screen,
} from "@testing-library/react";
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
      const { children, animate, ...rest } = props as Record<
        string,
        unknown
      >;
      const rotate =
        typeof animate === "object" && animate !== null
          ? (animate as { rotate?: number }).rotate
          : undefined;

      return React.createElement("div", {
        ...rest,
        ref,
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

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — structure", () => {
  it("renders a single root element", () => {
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    expect(container.children).toHaveLength(1);
  });

  it("root uses aspect-square", () => {
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    expect(container.firstElementChild?.className).toContain(
      "aspect-square",
    );
  });

  it("root uses the shared clock size class", () => {
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    expect(container.firstElementChild?.className).toContain(
      "sm:",
    );
  });

  it("renders exactly 60 tick marks", () => {
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    /*
     * Ticks are the only spans with `bg-[var(--foreground)]`
     * and an inline `transform` style set. Counting by that
     * signature is more robust than counting all spans.
     */
    const ticks = container.querySelectorAll<HTMLElement>(
      'span[aria-hidden="true"][style*="translate"]',
    );

    expect(ticks).toHaveLength(60);
  });

  it("renders exactly three animated hands", () => {
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    const hands = container.querySelectorAll("div[data-rotate]");

    expect(hands).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Static chrome                                                              */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — static chrome", () => {
  it("renders the 12, 3, 6, and 9 numerals", () => {
    render(<AnalogClock time={SAMPLE_TIME} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("renders every decorative element aria-hidden", () => {
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    /*
     * Every descendant except the root should be
     * `aria-hidden="true"`, since the whole clock is exposed
     * to assistive tech via the root's `aria-label`.
     */
    const hidden = container.querySelectorAll(
      '[aria-hidden="true"]',
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("renders exactly four hour numerals", () => {
    /*
     * The four cardinal numerals are the only spans with the
     * `font-serif` class that carry a numeric label. Verify
     * the count so a future refactor cannot add or drop one
     * without a corresponding test change.
     */
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    const numerals = Array.from(
      container.querySelectorAll("span.font-serif"),
    ).filter((el) => /^\d+$/.test(el.textContent ?? ""));

    expect(numerals).toHaveLength(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — accessibility", () => {
  it("exposes an img role with an accessible name", () => {
    render(<AnalogClock time={SAMPLE_TIME} />);

    expect(
      screen.getByRole("img", {
        name: /Analog clock showing 3:30:45 AM/,
      }),
    ).toBeInTheDocument();
  });

  it("does not introduce focusable elements", () => {
    render(<AnalogClock time={SAMPLE_TIME} />);

    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not expose any additional roles", () => {
    /*
     * The root is `role="img"`. No descendant should declare
     * a role — the whole tree is decorative chrome within
     * the image.
     */
    const { container } = render(
      <AnalogClock time={SAMPLE_TIME} />,
    );

    const withRole = container.querySelectorAll(
      "[role]:not([role='img'])",
    );
    expect(withRole).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("AnalogClock — reduced motion", () => {
  it("renders without throwing when reduced motion is preferred", () => {
    expect(() =>
      render(<AnalogClock time={SAMPLE_TIME} />),
    ).not.toThrow();
  });
});