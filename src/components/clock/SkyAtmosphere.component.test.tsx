import { render } from "@testing-library/react";
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

  const makeMotionEl = (tag: React.ElementType) => {
    const Component = React.forwardRef<
      HTMLElement,
      Record<string, unknown>
    >((props, ref) => {
      const {
        animate: _animate,
        initial: _initial,
        exit: _exit,
        transition: _transition,
        style,
        ...rest
      } = props as Record<string, unknown>;
      void _animate;
      void _initial;
      void _exit;
      void _transition;
      return React.createElement(tag, {
        ...rest,
        ref,
        style,
      } as React.HTMLAttributes<HTMLElement>);
    });
    Component.displayName = "motion";
    return Component;
  };

  return {
    motion: {
      div: makeMotionEl("div"),
      span: makeMotionEl("span"),
    },
    useReducedMotion: () => false,
    AnimatePresence: ({
      children,
    }: {
      children: React.ReactNode;
    }) => React.createElement(React.Fragment, null, children),
  };
});

import SkyAtmosphere from "@/components/clock/SkyAtmosphere";
import { STARS } from "@/components/clock/constants";

function timeAt(decimalHour: number): LocalTime {
  return {
    hour: Math.floor(decimalHour),
    minute: 0,
    second: 0,
    decimalHour,
    time12: "",
    time24: "",
    period: "AM",
    formattedDate: "",
    zoneName: "",
    utcOffset: "",
  };
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

describe("SkyAtmosphere — structure", () => {
  it("renders a single root element", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );
    expect(container.children).toHaveLength(1);
  });

  it("root is aria-hidden", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );
    expect(container.firstElementChild).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("root is pointer-events-none and sits behind the clock", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).toContain("pointer-events-none");
    expect(cls).toContain("-z-20");
    expect(cls).toContain("absolute");
    expect(cls).toContain("inset-0");
    expect(cls).toContain("overflow-hidden");
  });

  it("does not introduce focusable elements", () => {
    render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );
    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("renders four cloud layers", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );

    /*
     * Clouds render inside the layer with class `z-20`. The
     * horizon glow also lives at `z-20`, so we cannot query
     * by z alone. Instead we look for `rounded-full` on the
     * cloud's child divs — only clouds use `blur-[7px]`.
     */
    const cloudBlurs = container.querySelectorAll(
      ".blur-\\[7px\\]",
    );
    expect(cloudBlurs).toHaveLength(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("SkyAtmosphere — accessibility", () => {
  it("does not expose any text content", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );
    expect(container.textContent).toBe("");
  });

  it("does not expose any roles", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );
    expect(container.querySelectorAll("[role]")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Atmosphere variants                                                        */
/* -------------------------------------------------------------------------- */

describe("SkyAtmosphere — atmosphere variants", () => {
  it.each<[string, number]>([
    ["day", 12],
    ["dawn", 6],
    ["dusk", 19],
    ["night", 23],
  ])("renders without throwing in %s", (_label, hour) => {
    expect(() =>
      render(
        <SkyAtmosphere time={timeAt(hour)} reducedMotion={false} />,
      ),
    ).not.toThrow();
  });

  it("renders stars during night, dawn, and dusk", () => {
    /*
     * The `AnimatePresence` wrapper mounts the star field
     * when the atmosphere is one of night, dawn, or dusk.
     * During day, the star field is unmounted entirely.
     *
     * We check by counting the number of star spans by
     * rounded-full class — the star count is fixed at the
     * STARS.length constant.
     */
    for (const hour of [6, 19, 23]) {
      const { container, unmount } = render(
        <SkyAtmosphere time={timeAt(hour)} reducedMotion={false} />,
      );

      /*
       * Stars render as `<motion.span>` (mocked to `<span>`)
       * with `bg-white` and `rounded-full`. The cloud
       * highlight lobes also use `bg-white/NN` and
       * `rounded-full`, but on `<div>` elements. Query
       * spans specifically.
       */
      const starSpans = container.querySelectorAll(
        "span.bg-white",
      );

      expect(starSpans.length).toBe(STARS.length);

      unmount();
    }
  });

  it("does not render stars during day", () => {
    const { container } = render(
      <SkyAtmosphere time={timeAt(12)} reducedMotion={false} />,
    );

    const starSpans = container.querySelectorAll(
      "span.bg-white",
    );

    expect(starSpans).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("SkyAtmosphere — reduced motion", () => {
  it("renders without throwing when reduced motion is preferred", () => {
    expect(() =>
      render(
        <SkyAtmosphere time={timeAt(12)} reducedMotion={true} />,
      ),
    ).not.toThrow();
  });

  it("still renders the star field when reduced motion is on", () => {
    /*
     * Reduced motion disables animation but does not remove
     * the star field — the stars render statically. This
     * pins the contract: `reducedMotion` never changes the
     * structure, only the animation.
     */
    const { container } = render(
      <SkyAtmosphere time={timeAt(23)} reducedMotion={true} />,
    );

    const starSpans = container.querySelectorAll("span.bg-white");

    expect(starSpans.length).toBe(STARS.length);
  });
});