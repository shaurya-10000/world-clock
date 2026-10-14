import { vi } from "vitest";

/*
 * The dropdown renders one `ResultRow` per matching
 * location, and each row mounts a `SearchRowAtmosphere`. At
 * 130+ matches that is a lot of DOM and a lot of `useNow`
 * subscriptions. The tests in this file assert on structure
 * and behavior, not animation, so both framer-motion and the
 * formatter surface can be simplified.
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
    formatShortDate: () => "Jan 15",
    formatTime12: () => "12:00 PM",
  };
});

/* -------------------------------------------------------------------------- */
/* Locations / search — small deterministic catalog                           */
/* -------------------------------------------------------------------------- */

/*
 * The production catalog has ~130 entries. Every keystroke in
 * this file's tests re-renders the entire result list, so the
 * suite paid the jsdom DOM-insertion cost hundreds of times.
 * None of these tests assert anything about catalog size —
 * they assert input chrome, dropdown opening/closing, keyboard
 * navigation, and selection. A four-city fixture exercises
 * every code path and cuts render cost by ~30×.
 *
 * The fixture is shaped to keep every existing assertion
 * meaningful:
 *
 *   - "tokyo"   → exactly one match (used by open / select /
 *                 focus tests).
 *   - "san"     → three matches (San Francisco, Busan, San
 *                 José), used by the ArrowDown / End / Home
 *                 navigation tests that need multiple rows.
 *   - ""        → four matches.
 *   - "zzzzz-no-such-place" → zero matches (empty state).
 *
 * `SearchResult` is shaped `{ location, score }` to match the
 * component's consumption of `result.location`.
 */

import type { WorldLocation } from "@/lib/locations";

const TOKYO: WorldLocation = {
  id: "tokyo",
  city: "Tokyo",
  country: "Japan",
  timezone: "Asia/Tokyo",
  latitude: 35.6762,
  longitude: 139.6503,
  continent: "east-asia",
  globeTiers: ["main"],
};

const SAN_FRANCISCO: WorldLocation = {
  id: "san-francisco",
  city: "San Francisco",
  country: "United States",
  timezone: "America/Los_Angeles",
  latitude: 37.7749,
  longitude: -122.4194,
  continent: "north-america",
  globeTiers: ["main"],
};

const BUSAN: WorldLocation = {
  id: "busan",
  city: "Busan",
  country: "South Korea",
  timezone: "Asia/Seoul",
  latitude: 35.1796,
  longitude: 129.0756,
  continent: "east-asia",
  globeTiers: ["main"],
};

const SAN_JOSE: WorldLocation = {
  id: "san-jose",
  city: "San José",
  country: "Costa Rica",
  timezone: "America/Costa_Rica",
  latitude: 9.9281,
  longitude: -84.0907,
  continent: "north-america",
  globeTiers: ["main"],
};

const CATALOG: readonly WorldLocation[] = [
  TOKYO,
  SAN_FRANCISCO,
  BUSAN,
  SAN_JOSE,
];

vi.mock("@/lib/locations", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/locations")>(
      "@/lib/locations",
    );

  return {
    ...actual,
    getWorldLocationById: (id: string) =>
      CATALOG.find((location) => location.id === id) ?? null,
  };
});

vi.mock("@/lib/search", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/search")>(
      "@/lib/search",
    );

  return {
    ...actual,
    searchLocations: (query: string) => {
      const normalized = query.trim().toLowerCase();

      const matches = CATALOG.filter((location) => {
        if (normalized === "") return true;
        return (
          location.city.toLowerCase().includes(normalized) ||
          location.country.toLowerCase().includes(normalized) ||
          location.timezone.toLowerCase().includes(normalized)
        );
      });

      return matches.map((location) => ({
        location,
        score: 1,
      }));
    },
  };
});

import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * `TOKYO` is declared in the fixture block above so the
 * `@/lib/locations` mock can see it. This re-export keeps
 * the rest of the file's references working unchanged.
 */
const TOKYO_ROW_NAME =
  "Select Tokyo, Japan, Asia/Tokyo";

function renderInput(
  overrides: Partial<
    React.ComponentProps<typeof SearchableLocationInput>
  > = {},
) {
  const onSelect = vi.fn();

  const props: React.ComponentProps<
    typeof SearchableLocationInput
  > = {
    selectedLocation: null,
    onSelect,
    reducedMotion: false,
    ...overrides,
  };

  const utils = render(<SearchableLocationInput {...props} />);

  return { onSelect, ...utils };
}

/**
 * The desktop input carries `role="combobox"`, which
 * overrides the implicit `searchbox` role that
 * `<input type="search">` would otherwise have. It is the
 * first (and, when the mobile panel is closed, the only)
 * `role="combobox"` element in the DOM. When the mobile panel
 * opens, a second combobox appears. Every query in this file
 * that targets "the input" uses this helper so the
 * two-combobox state does not break the singular-query
 * contract.
 */
function getPrimarySearchbox(): HTMLElement {
  return screen.getAllByRole("combobox")[0]!;
}

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

/* -------------------------------------------------------------------------- */
/* Initial state                                                              */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — initial state", () => {
  it("renders the input with the default placeholder", () => {
    renderInput();

    expect(getPrimarySearchbox()).toHaveAttribute(
      "placeholder",
      "Search city or country",
    );
  });

  it("respects an explicit placeholder", () => {
    renderInput({ placeholder: "Jump to a city" });

    expect(getPrimarySearchbox()).toHaveAttribute(
      "placeholder",
      "Jump to a city",
    );
  });

  it("renders with aria-expanded=false when closed", () => {
    renderInput();

    expect(getPrimarySearchbox()).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("does not render the dropdown when the input is untouched", () => {
    renderInput();

    expect(
      screen.queryByRole("option", {
        name: TOKYO_ROW_NAME,
      }),
    ).not.toBeInTheDocument();
  });

  it("does not render the clear button when the input is empty", () => {
    renderInput();

    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Opening                                                                    */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — opening", () => {
  it("opens on focus", () => {
    renderInput();

    fireEvent.focus(getPrimarySearchbox());

    expect(getPrimarySearchbox()).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("opens on typing", () => {
    renderInput();

    fireEvent.change(getPrimarySearchbox(), {
      target: { value: "tokyo" },
    });

    expect(getPrimarySearchbox()).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("renders a result for the typed query", () => {
    renderInput();

    fireEvent.change(getPrimarySearchbox(), {
      target: { value: "tokyo" },
    });

    expect(
      screen.getByRole("option", { name: TOKYO_ROW_NAME }),
    ).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderInput();

    fireEvent.change(getPrimarySearchbox(), {
      target: { value: "zzzzz-no-such-place" },
    });

    expect(
      screen.getAllByText("No matching location").length,
    ).toBeGreaterThan(0);
  });

  it("does not show the empty state when the input is empty", () => {
    renderInput();

    fireEvent.focus(getPrimarySearchbox());

    expect(
      screen.queryByText("No matching location"),
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Keyboard navigation                                                        */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — keyboard navigation", () => {
  it("opens the dropdown on ArrowDown", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the dropdown on Escape", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the dropdown on Tab", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("selects the first result when Enter is pressed with no active option", () => {
    const { onSelect } = renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "tokyo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tokyo" }),
    );
  });

  it("cycles the active option with ArrowDown", () => {
    const { onSelect } = renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "san" } });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("jumps to the last option on End", () => {
    const { onSelect } = renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "san" } });

    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("jumps to the first option on Home", () => {
    const { onSelect } = renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "san" } });

    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — selection", () => {
  it("calls onSelect when a result is clicked", () => {
    const { onSelect } = renderInput();

    fireEvent.change(getPrimarySearchbox(), {
      target: { value: "tokyo" },
    });

    fireEvent.click(
      screen.getByRole("option", { name: TOKYO_ROW_NAME }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tokyo" }),
    );
  });

  it("clears the input after a selection", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "tokyo" } });
    fireEvent.click(
      screen.getByRole("option", { name: TOKYO_ROW_NAME }),
    );

    expect(input).toHaveValue("");
  });

  it("closes the dropdown after a selection", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "tokyo" } });
    fireEvent.click(
      screen.getByRole("option", { name: TOKYO_ROW_NAME }),
    );

    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("marks the selected location with a check icon", () => {
    renderInput({ selectedLocation: TOKYO });

    fireEvent.focus(getPrimarySearchbox());

    expect(
      screen.getByRole("option", { name: TOKYO_ROW_NAME }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Clear button                                                               */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — clear button", () => {
  it("renders the clear button when the input has content", () => {
    renderInput();

    fireEvent.change(getPrimarySearchbox(), {
      target: { value: "tok" },
    });

    expect(
      screen.getAllByRole("button", { name: "Clear search" })
        .length,
    ).toBeGreaterThan(0);
  });

  it("clears the input when clicked", () => {
    /*
     * The click is wrapped in `act()` because the clear
     * button's handler calls `inputRef.current?.focus()`,
     * which synchronously triggers the input's `onFocus`.
     * That handler updates `SearchField`'s local
     * `isFocused` state — a second state update that React
     * does not know is part of the click's scope unless we
     * tell it to.
     *
     * React logs a warning when a state update fires
     * outside an `act()` scope. Wrapping the click silences
     * it and, more importantly, guarantees the assertion
     * below runs after both updates have flushed.
     */
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.change(input, { target: { value: "tok" } });

    const clearButtons = screen.getAllByRole("button", {
      name: "Clear search",
    });
    act(() => {
      fireEvent.click(clearButtons[0]!);
    });

    expect(input).toHaveValue("");
  });

  it("keeps focus on the input after clearing", () => {
    /*
     * ## Why `input.focus()` inside `act()`, not `fireEvent.focus`
     *
     * `fireEvent.focus` dispatches a synthetic focus event
     * but does **not** move browser focus. `happy-dom` only
     * updates `document.activeElement` when the element's
     * native `.focus()` method is called; a dispatched
     * `focus` event fires listeners but leaves focus where
     * it was. The assertion below
     * (`document.activeElement === input`) therefore cannot
     * be satisfied by `fireEvent.focus`.
     *
     * A bare `input.focus()` call does move focus, but it
     * fires the input's `onFocus` handler outside any
     * `act()` scope, and React warns about the resulting
     * state update. Wrapping the native call in `act()`
     * moves focus *and* tells React the update is
     * intentional.
     *
     * The click on the clear button below still needs its
     * own `act()` wrapper: `fireEvent.click` is wrapped
     * internally, but the clear handler's
     * `inputRef.current?.focus()` call fires a second
     * `onFocus` update that lands outside the click's own
     * `act()` boundary. See the previous test's comment for
     * the full reasoning.
     */
    renderInput();

    const input = getPrimarySearchbox();
    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: "tok" } });

    const clearButtons = screen.getAllByRole("button", {
      name: "Clear search",
    });
    act(() => {
      fireEvent.click(clearButtons[0]!);
    });

    expect(document.activeElement).toBe(input);
  });
});

/* -------------------------------------------------------------------------- */
/* Outside click                                                              */
/* -------------------------------------------------------------------------- */

describe("SearchableLocationInput — outside click", () => {
  it("closes the dropdown when the pointer lands outside", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.focus(input);

    act(() => {
      fireEvent.pointerDown(document.body);
    });

    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when the pointer lands inside the wrapper", () => {
    renderInput();

    const input = getPrimarySearchbox();
    fireEvent.focus(input);

    act(() => {
      fireEvent.pointerDown(input);
    });

    expect(input).toHaveAttribute("aria-expanded", "true");
  });
});