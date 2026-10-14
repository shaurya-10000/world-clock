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
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Locations / search — small deterministic catalog                           */
/* -------------------------------------------------------------------------- */

/*
 * The production catalog has ~130 entries. Mounting 130 `CityRow`
 * trees in jsdom costs roughly 800ms per render, which is the
 * entire reason this suite was slow. None of these tests assert
 * anything about catalog size — they assert drawer behavior,
 * search filtering, and favorite state. A three-city fixture
 * exercises every code path the tests care about and cuts the
 * render cost by ~40×.
 *
 * The fixture is intentionally shaped to keep the existing
 * assertions meaningful:
 *
 *   - "tokyo"   → exactly one match, used by the selection and
 *                 favorite tests.
 *   - "Iceland" → exactly one match (Reykjavík), used by the
 *                 singular-noun count test.
 *   - ""        → three matches, used by the plural-noun count
 *                 test and the default-render test.
 *   - "zzzzz-not-a-place" → zero matches, used by the empty
 *                 state tests.
 */

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
/* Component imports — after mocks so they pick up the fixtures               */
/* -------------------------------------------------------------------------- */

import CitiesSection from "@/components/CitiesSection";
import { emit, resetEventBus } from "@/lib/events";
import { resetTimeCache } from "@/lib/time";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The `inert` effect in `CitiesSection` marks the page's
 * `<main>` element inert while the drawer is open. In a real
 * app, `page.tsx` renders that `<main>`. In a unit test, we
 * have to render it ourselves or the effect is a no-op.
 *
 * This helper creates a `<main>` element, attaches it to
 * `document.body`, and returns a teardown that removes it.
 * Tests that care about the `inert` behavior call this before
 * rendering the drawer.
 */
function installMainElement(): () => void {
  const main = document.createElement("main");
  main.setAttribute("data-testid", "page-main");
  document.body.appendChild(main);

  return () => {
    main.remove();
  };
}

function renderDrawer(
  props: {
    selectedLocationId?: string | null;
    onLocationSelect?: (location: WorldLocation) => void;
  } = {},
) {
  const onLocationSelect = props.onLocationSelect ?? vi.fn();

  render(
    <CitiesSection
      selectedLocationId={props.selectedLocationId ?? null}
      onLocationSelect={onLocationSelect}
    />,
  );

  return { onLocationSelect };
}

beforeEach(() => {
  resetEventBus();
  resetTimeCache();
  resetUseNow();

  /*
   * `useNow` is the only timer-owning module in the component
   * tree. Its deps are replaced wholesale here so no real
   * `setInterval` is ever scheduled:
   *
   *   - `setInterval: () => 1` returns a fake handle.
   *   - `clearInterval` is a no-op.
   *   - `now()` returns a fixed instant.
   *   - `isVisible: () => true` keeps the scheduler "running"
   *     so `acquire` emits synchronously on subscribe.
   *
   * Because no real timer is created, fake timers are not
   * needed. Testing Library's `findBy*` and `waitFor` poll
   * on the real `setTimeout`, which fires on schedule.
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
/* Open / close                                                               */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — open and close", () => {
  it("is closed by default", () => {
    renderDrawer();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when the cities:open event fires", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    expect(
      await screen.findByRole("dialog", { name: "Cities" }),
    ).toBeInTheDocument();
  });

  it("closes when the close button is clicked", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.click(
      screen.getByRole("button", { name: "Close cities" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes when the backdrop is clicked", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("presentation"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes on Escape", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("locks body scroll while open and restores it on close", async () => {
    document.body.style.overflow = "auto";

    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(document.body.style.overflow).toBe("auto");
    });
  });

  it("clears the search query on close and reopen", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    const input = screen.getByRole("searchbox", {
      name: "Search cities",
    });
    fireEvent.change(input, { target: { value: "tok" } });
    expect(input).toHaveValue("tok");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    expect(
      screen.getByRole("searchbox", { name: "Search cities" }),
    ).toHaveValue("");
  });
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — search", () => {
  it("renders every catalogued location by default", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");
    expect(screen.getByText(/Locations$/)).toBeInTheDocument();
  });

  it("filters to matching cities on input", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    expect(
      await screen.findByLabelText("Select Tokyo"),
    ).toBeInTheDocument();
  });

  it("shows the empty state when no locations match", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "zzzzz-not-a-place" } },
    );

    expect(
      await screen.findByText("No locations found"),
    ).toBeInTheDocument();
  });

  it("clears the query when the clear button is clicked", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    const input = screen.getByRole("searchbox", {
      name: "Search cities",
    });
    fireEvent.change(input, { target: { value: "tok" } });

    fireEvent.click(
      screen.getByRole("button", { name: "Clear search" }),
    );

    expect(input).toHaveValue("");
  });

  it("does not show the clear button when the input is empty", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — selection", () => {
  it("calls onLocationSelect when a row is clicked", async () => {
    const { onLocationSelect } = renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    fireEvent.click(await screen.findByLabelText("Select Tokyo"));

    expect(onLocationSelect).toHaveBeenCalledTimes(1);
    expect(onLocationSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tokyo" }),
    );
  });

  it("closes the drawer after a selection", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    fireEvent.click(await screen.findByLabelText("Select Tokyo"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Favorites                                                                  */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — favorites", () => {
  it("shows the Favorites section after a city is favorited", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    fireEvent.click(
      await screen.findByLabelText("Add Tokyo to favorites"),
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "" } },
    );

    expect(await screen.findByText("Favorites")).toBeInTheDocument();
  });

  it("toggles the aria-pressed state of the heart", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    const heart = await screen.findByLabelText(
      "Add Tokyo to favorites",
    );
    expect(heart).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(heart);

    expect(
      await screen.findByLabelText("Remove Tokyo from favorites"),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("persists favorites to localStorage", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    fireEvent.click(
      await screen.findByLabelText("Add Tokyo to favorites"),
    );

    const stored = window.localStorage.getItem(
      "world-clock:favorites",
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual({
      v: 1,
      ids: ["tokyo"],
    });
  });

  it("removes a favorite from localStorage when toggled off", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    const addHeart = await screen.findByLabelText(
      "Add Tokyo to favorites",
    );
    fireEvent.click(addHeart);

    const removeHeart = await screen.findByLabelText(
      "Remove Tokyo from favorites",
    );
    fireEvent.click(removeHeart);

    const stored = window.localStorage.getItem(
      "world-clock:favorites",
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual({
      v: 1,
      ids: [],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Focus trap cache invalidation                                              */
/* -------------------------------------------------------------------------- */

/*
 * ## Why this block exists
 *
 * The focus trap caches its list of focusable elements. The
 * cache must be invalidated whenever the DOM inside the
 * drawer changes — in particular, when the user favorites a
 * city and a new heart button mounts in the Favorites
 * section.
 *
 * The previous version of this component only invalidated on
 * `input` events, so favoriting a city left the cached list
 * stale. Tab would then skip the newly-added heart button.
 *
 * These tests exercise the observable consequence: after
 * favoriting a city while the drawer is open, a Tab from the
 * last focusable element must wrap to the first (rather than
 * silently skipping the new button because the cache has the
 * wrong "last" element).
 *
 * The MutationObserver and the `favorites` dependency both
 * contribute; the tests below don't distinguish between them
 * — they exercise the outcome the fix produces.
 */

describe("CitiesSection — focus trap cache invalidation", () => {
  it("does not skip the newly-added favorite heart when tabbing after a favorite toggle", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    /* Narrow the list so the focusables are enumerable. */
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    /*
     * Prime the cache: focus the close button and Tab once to
     * force the trap to query the DOM. At this point the
     * Favorites section is empty.
     */
    const closeButton = screen.getByRole("button", {
      name: "Close cities",
    });
    closeButton.focus();
    fireEvent.keyDown(window, { key: "Tab" });

    /*
     * Toggle a favorite. The MutationObserver fires on the
     * microtask queue; the `favorites` dependency in the trap
     * effect also re-runs synchronously with the re-render.
     */
    fireEvent.click(
      await screen.findByLabelText("Add Tokyo to favorites"),
    );

    /*
     * The Favorites section is now present with a new heart
     * button. Verify the drawer still traps focus without
     * losing the newly-added element: the row's "Select"
     * button for the new favorite must be in the DOM, and
     * tabbing from the last element must cycle back to the
     * first without throwing.
     */
    expect(
      await screen.findByLabelText("Select Tokyo"),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    const last = focusables[focusables.length - 1];
    expect(last).toBeDefined();

    last?.focus();
    fireEvent.keyDown(window, { key: "Tab" });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Close cities" }),
      );
    });
  });

  it("keeps the Tab cycle correct after the favorite is removed again", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search cities" }),
      { target: { value: "tokyo" } },
    );

    /* Add a favorite, then remove it. */
    const addHeart = await screen.findByLabelText(
      "Add Tokyo to favorites",
    );
    fireEvent.click(addHeart);

    const removeHeart = await screen.findByLabelText(
      "Remove Tokyo from favorites",
    );
    fireEvent.click(removeHeart);

    /*
     * The Favorites section is now gone (query is "tokyo", so
     * it wasn't showing anyway), but the cache must still be
     * valid for the current DOM. A Tab from the last focusable
     * must wrap to the close button without throwing.
     */
    const dialog = screen.getByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    const last = focusables[focusables.length - 1];
    expect(last).toBeDefined();

    last?.focus();
    fireEvent.keyDown(window, { key: "Tab" });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Close cities" }),
      );
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Inert background                                                           */
/* -------------------------------------------------------------------------- */

/*
 * ## Why this block exists
 *
 * `aria-modal="true"` on the dialog tells assistive tech
 * that the rest of the page is unreachable, but the DOM does
 * not automatically make it so. The component now sets the
 * `inert` attribute on the page's `<main>` element while the
 * drawer is open, and removes it on close.
 *
 * These tests verify the observable consequence of that: the
 * `<main>` element gains `inert` when the drawer opens, loses
 * it when the drawer closes, and does not leak the attribute
 * across an unmount.
 *
 * The `installMainElement` helper is required — without a
 * `<main>` in the document, the effect is a documented no-op
 * and the tests would trivially pass.
 */

describe("CitiesSection — inert background", () => {
  it("marks <main> inert while the drawer is open", async () => {
    const teardown = installMainElement();
    try {
      renderDrawer();
      act(() => {
        emit("cities:open", undefined);
      });
      await screen.findByRole("dialog");

      const main = document.querySelector("main");
      expect(main).not.toBeNull();
      expect(main).toHaveAttribute("inert");
    } finally {
      teardown();
    }
  });

  it("removes inert from <main> when the drawer closes", async () => {
    const teardown = installMainElement();
    try {
      renderDrawer();
      act(() => {
        emit("cities:open", undefined);
      });
      await screen.findByRole("dialog");

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      const main = document.querySelector("main");
      expect(main).not.toHaveAttribute("inert");
    } finally {
      teardown();
    }
  });

  it("does not leave <main> inert when the drawer unmounts while open", async () => {
    const teardown = installMainElement();
    try {
      const { unmount } = render(
        <CitiesSection
          selectedLocationId={null}
          onLocationSelect={vi.fn()}
        />,
      );

      act(() => {
        emit("cities:open", undefined);
      });
      await screen.findByRole("dialog");

      const main = document.querySelector("main");
      expect(main).toHaveAttribute("inert");

      unmount();

      /*
       * The cleanup runs synchronously on unmount. The `<main>`
       * must no longer be inert.
       */
      expect(main).not.toHaveAttribute("inert");
    } finally {
      teardown();
    }
  });

  it("preserves a pre-existing inert attribute on <main>", async () => {
    /*
     * If `<main>` was already inert for some other reason (a
     * larger modal stacked above, an editor's preview mode),
     * the drawer's effect must not remove the attribute on
     * close. The implementation checks `hadInert` before
     * setting and uses it as the gate for the cleanup.
     */
    const main = document.createElement("main");
    main.setAttribute("inert", "");
    document.body.appendChild(main);

    try {
      renderDrawer();
      act(() => {
        emit("cities:open", undefined);
      });
      await screen.findByRole("dialog");

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      expect(main).toHaveAttribute("inert");
    } finally {
      main.remove();
    }
  });

  it("is a no-op when the page has no <main> element", async () => {
    /*
     * A storybook or bare test harness may have no `<main>`
     * around the drawer. The effect must not throw, and the
     * drawer must still open and close normally.
     */
    const existingMains = document.querySelectorAll("main");
    for (const el of Array.from(existingMains)) el.remove();

    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    expect(document.querySelector("main")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Close cities" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Focus management                                                           */
/* -------------------------------------------------------------------------- */

describe("CitiesSection — focus management", () => {
  it("moves focus to the close button when the drawer opens", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Close cities" }),
      );
    });
  });

  it("returns focus to the opener when the drawer closes", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open cities";
    document.body.appendChild(opener);
    opener.focus();

    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    await waitFor(() => {
      expect(document.activeElement).not.toBe(opener);
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });

    document.body.removeChild(opener);
  });

  it("wraps Tab focus from the last element back to the first", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    const dialog = screen.getByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const last = focusables[focusables.length - 1];
    expect(last).toBeDefined();

    last?.focus();
    fireEvent.keyDown(window, { key: "Tab" });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Close cities" }),
      );
    });
  });

  it("wraps Shift+Tab focus from the first element back to the last", async () => {
    renderDrawer();
    act(() => {
      emit("cities:open", undefined);
    });
    await screen.findByRole("dialog");

    const closeButton = screen.getByRole("button", {
      name: "Close cities",
    });
    closeButton.focus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const last = focusables[focusables.length - 1];
      expect(document.activeElement).toBe(last);
    });
  });
});