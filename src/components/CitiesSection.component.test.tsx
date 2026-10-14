import { vi } from "vitest";

/* -------------------------------------------------------------------------- */
/* Framer Motion — plain DOM replacements                                     */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* time formatters — fixed strings                                            */
/* -------------------------------------------------------------------------- */

vi.mock("@/lib/time", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/time")>(
      "@/lib/time",
    );

  return {
    ...actual,
    formatShortDate: () => "Jan 15",
    formatTime12: () => "12:00 PM",
  };
});

/* -------------------------------------------------------------------------- */
/* Locations / search — small deterministic catalog                           */
/* -------------------------------------------------------------------------- */

/*
 * The production catalog has ~130 entries. Mounting 130 `CityRow`
 * trees in jsdom costs roughly 800ms per render, which is the
 * entire reason this suite was slow. None of these tests assert
 * anything about catalog size — they assert drawer chrome, row
 * affordances, and result counts. A three-city fixture exercises
 * every code path the tests care about and cuts the render cost
 * by ~40×.
 *
 * The fixture is intentionally shaped to keep the existing
 * assertions meaningful:
 *
 *   - "tokyo"   → exactly one match (used by the count-update
 *                 test).
 *   - "Iceland" → exactly one match (Reykjavík), used by the
 *                 singular-noun count test.
 *   - "san"     → exactly one match (San Francisco), so the
 *                 plural-noun count test needs a different
 *                 query. See the note on that test below.
 *   - ""        → three matches, used by default-render and
 *                 plural-count tests.
 *   - "zzzzz-not-a-place" → zero matches, used by the empty
 *                 state tests.
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

const REYKJAVIK: WorldLocation = {
  id: "reykjavik",
  city: "Reykjavík",
  country: "Iceland",
  timezone: "Atlantic/Reykjavik",
  latitude: 64.1466,
  longitude: -21.9426,
  continent: "europe",
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

const CATALOG: readonly WorldLocation[] = [
  TOKYO,
  REYKJAVIK,
  SAN_FRANCISCO,
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

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

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

import CitiesSection from "@/components/CitiesSection";
import { emit, resetEventBus } from "@/lib/events";
import { resetTimeCache } from "@/lib/time";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

function openDrawer(): void {
  render(
    <CitiesSection
      selectedLocationId={null}
      onLocationSelect={vi.fn()}
    />,
  );

  act(() => {
    emit("cities:open", undefined);
  });
}

beforeEach(() => {
  resetEventBus();
  resetTimeCache();
  resetUseNow();

  /*
   * `useNow` is the only timer-owning module in the tree.
   * Its deps are replaced wholesale here so no real
   * `setInterval` is ever scheduled. Because no real timer
   * is created, fake timers are not needed — Testing
   * Library's `findBy*` polls on the real `setTimeout`,
   * which fires on schedule.
   */
  setUseNowDeps({
    now: () => Date.UTC(2024, 0, 15, 12, 0, 0),
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });

  window.localStorage.clear();
});

afterEach(() => {
  resetEventBus();
  resetUseNow();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Rendered output                                                            */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — rendered output", () => {
  it("renders the drawer heading", async () => {
    openDrawer();
    expect(
      await screen.findByRole("heading", { name: "Cities" }),
    ).toBeInTheDocument();
  });

  it("renders the brand tag", async () => {
    openDrawer();
    expect(await screen.findByText("World Clock")).toBeInTheDocument();
  });

  it("renders the search field with a placeholder", async () => {
    openDrawer();
    const input = await screen.findByRole("searchbox", {
      name: "Search cities",
    });
    expect(input).toHaveAttribute(
      "placeholder",
      "SEARCH CITY OR COUNTRY",
    );
  });

  it("renders the results count", async () => {
    openDrawer();
    await screen.findByRole("dialog");
    expect(
      screen.getByTestId("cities-results-count"),
    ).toHaveTextContent(/\d+ Locations?$/);
  });

  it("renders the live indicator", async () => {
    openDrawer();
    expect(await screen.findByText("Live")).toBeInTheDocument();
  });

  it("renders at least one city row", async () => {
    openDrawer();
    const selects = await screen.findAllByRole("button", {
      name: /^Select /,
    });
    expect(selects.length).toBeGreaterThan(0);
  });

  it("renders the close button", async () => {
    openDrawer();
    expect(
      await screen.findByRole("button", { name: "Close cities" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Dialog semantics                                                           */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — dialog semantics", () => {
  it("has role=dialog", async () => {
    openDrawer();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal=true", async () => {
    openDrawer();
    expect(await screen.findByRole("dialog")).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("has an accessible name", async () => {
    openDrawer();
    expect(
      await screen.findByRole("dialog", { name: "Cities" }),
    ).toBeInTheDocument();
  });

  it("renders a presentation backdrop", async () => {
    openDrawer();
    expect(
      await screen.findByRole("presentation"),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* City rows                                                                  */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — city rows", () => {
  it("each row exposes a select button with an accessible name", async () => {
    openDrawer();
    const selects = await screen.findAllByRole("button", {
      name: /^Select /,
    });
    for (const button of selects) {
      expect(button.getAttribute("aria-label")).toMatch(/^Select .+/);
    }
  });

  it("each row exposes a favorite button", async () => {
    openDrawer();
    const hearts = await screen.findAllByRole("button", {
      name: /(Add|Remove) .+ (to|from) favorites/,
    });
    expect(hearts.length).toBeGreaterThan(0);
  });

  it("favorite buttons expose aria-pressed", async () => {
    openDrawer();
    const hearts = await screen.findAllByRole("button", {
      name: /(Add|Remove) .+ (to|from) favorites/,
    });
    for (const heart of hearts) {
      expect(heart).toHaveAttribute("aria-pressed");
    }
  });

  it("shows an empty state when there are no results", async () => {
    openDrawer();
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "zzzzz-not-a-place" } },
    );

    expect(
      await screen.findByText("No locations found"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Try another city or country/),
    ).toBeInTheDocument();
  });

  it("the empty state keeps a minimum height", async () => {
    /*
     * The empty state is sized with `min-h-64` so the drawer
     * does not collapse to a thin strip below the search
     * field when there are no matches.
     */
    openDrawer();
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "zzzzz-not-a-place" } },
    );

    const emptyText = await screen.findByText("No locations found");
    const emptyContainer =
      emptyText.closest(".min-h-64") ??
      emptyText.parentElement?.closest(".min-h-64");

    expect(emptyContainer).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Results count                                                              */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — results count", () => {
  it("updates the count when the query changes", async () => {
    openDrawer();
    await screen.findByRole("dialog");

    const initialText =
      screen.getByTestId("cities-results-count").textContent ??
      "";
    const initialNum = parseInt(
      initialText.match(/(\d+)/)?.[1] ?? "0",
      10,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    const filteredText =
      screen.getByTestId("cities-results-count").textContent ??
      "";
    const filteredNum = parseInt(
      filteredText.match(/(\d+)/)?.[1] ?? "0",
      10,
    );

    expect(filteredNum).toBeLessThan(initialNum);
  });

  it("uses the singular noun when exactly one match remains", async () => {
    openDrawer();
    await screen.findByRole("dialog");

    /*
     * `"Iceland"` matches exactly one location — Reykjavík.
     * No other catalogued city in the fixture has `"iceland"`
     * in its city name, country name, or timezone. This is a
     * stable single-match query.
     */
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "Iceland" } },
    );

    expect(
      screen.getByTestId("cities-results-count"),
    ).toHaveTextContent("1 Location");
  });

  it("uses the plural noun for multiple matches", async () => {
    openDrawer();
    await screen.findByRole("dialog");

    /*
     * The no-query state has three matches, so the plural
     * branch fires. This avoids coupling the test to a
     * specific substring query whose match count depends on
     * the fixture — a query like `"san"` would now return
     * exactly one match (San Francisco) and the singular
     * branch, not the plural one.
     */
    expect(
      screen.getByTestId("cities-results-count"),
    ).toHaveTextContent(/^\d+ Locations$/);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — accessibility", () => {
  it("search input has an aria-label", async () => {
    openDrawer();
    expect(
      await screen.findByRole("searchbox", { name: "Search cities" }),
    ).toBeInTheDocument();
  });

  it("close button has an aria-label", async () => {
    openDrawer();
    expect(
      await screen.findByRole("button", { name: "Close cities" }),
    ).toBeInTheDocument();
  });

  it("the drawer contains exactly one heading", async () => {
    openDrawer();
    const dialog = await screen.findByRole("dialog");
    const headings = dialog.querySelectorAll(
      "h1, h2, h3, h4, h5, h6",
    );
    expect(headings).toHaveLength(1);
  });

  it("interactive elements are reachable by role", async () => {
    openDrawer();
    expect(await screen.findByRole("searchbox")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Close cities" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — reduced motion", () => {
  it("does not throw when matchMedia reports reduced motion", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }) as MediaQueryList,
    );

    expect(() => openDrawer()).not.toThrow();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});