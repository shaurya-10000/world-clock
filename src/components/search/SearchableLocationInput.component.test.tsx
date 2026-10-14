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
        const { children, ...rest } = props as Record<
          string,
          unknown
        >;
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

vi.mock("@/lib/time", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/time")>(
      "@/lib/time",
    );

  return {
    ...actual,
    getDecimalHour: () => 12,
  };
});

import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import SearchableLocationInput from "@/components/search/SearchableLocationInput";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetUseNow();
  setUseNowDeps({
    now: () => Date.UTC(2024, 0, 15, 12, 0, 0),
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

function renderInput() {
  return render(
    <SearchableLocationInput
      selectedLocation={null}
      onSelect={vi.fn()}
      reducedMotion={false}
    />,
  );
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — structure", () => {
  it("renders a combobox", () => {
    renderInput();

    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders the search icon as decorative", () => {
    const { container } = renderInput();

    const svgs = container.querySelectorAll(
      'svg[aria-hidden="true"]',
    );
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("wraps everything in a single root element", () => {
    const { container } = renderInput();

    expect(container.children).toHaveLength(1);
  });

  it("renders exactly one combobox when the panel is closed", () => {
    /*
     * The desktop input is always present. The mobile panel
     * input is conditionally rendered — it exists in the DOM
     * only when the panel is open. This pins the closed-state
     * contract so a future refactor that un-conditionally
     * rendered the panel input would fail here.
     */
    renderInput();

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — accessibility", () => {
  it("has an accessible name from aria-label", () => {
    renderInput();

    expect(
      screen.getByRole("combobox", {
        name: "Search a city, country or timezone",
      }),
    ).toBeInTheDocument();
  });

  it("exposes aria-expanded reflecting the dropdown state", () => {
    renderInput();

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("uses a search input type", () => {
    renderInput();

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "type",
      "search",
    );
  });

  it("sets autoComplete off", () => {
    renderInput();

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Width configuration                                                        */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — width configuration", () => {
  it("applies full width by default", () => {
    const { container } = renderInput();

    expect(container.firstElementChild?.className).toContain(
      "w-full",
    );
  });

  it("omits full width when fullWidth is false", () => {
    const { container } = render(
      <SearchableLocationInput
        selectedLocation={null}
        onSelect={vi.fn()}
        reducedMotion={false}
        fullWidth={false}
      />,
    );

    expect(
      container.firstElementChild?.className,
    ).not.toContain("w-full");
  });

  it("applies the provided max-width class", () => {
    const { container } = render(
      <SearchableLocationInput
        selectedLocation={null}
        onSelect={vi.fn()}
        reducedMotion={false}
        maxWidthClassName="max-w-[300px]"
      />,
    );

    expect(container.firstElementChild?.className).toContain(
      "max-w-[300px]",
    );
  });
});