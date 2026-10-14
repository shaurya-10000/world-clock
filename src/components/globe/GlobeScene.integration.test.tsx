import { act, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GlobeTier,
  WorldLocation,
} from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Favorites state                                                            */
/* -------------------------------------------------------------------------- */

const favoritesState = {
  favoritedIds: new Set<string>(),
};

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/globe/EarthSphere", () => ({
  default: () => null,
}));
vi.mock("@/components/globe/RealisticEarthSphere", () => ({
  default: () => null,
}));
vi.mock("@/components/globe/CountryPolygons", () => ({
  default: () => null,
}));
vi.mock("@/components/globe/Terminator", () => ({
  default: () => null,
}));
vi.mock("@/components/globe/SolarSampler", () => ({
  default: () => null,
}));
vi.mock("@/components/globe/GlobeControls", () => ({
  default: () => null,
}));

vi.mock("@/components/globe/GlobeMarker", async () => {
  const React = await import("react");
  return {
    default: ({
      location,
      selected,
      transient,
      favorited,
      onSelect,
    }: {
      location: WorldLocation;
      selected: boolean;
      transient: boolean;
      favorited: boolean;
      onSelect: (location: WorldLocation) => void;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "globe-marker",
          "data-location": location.id,
          "data-selected": String(selected),
          "data-transient": String(transient),
          "data-favorited": String(favorited),
        },
        React.createElement("button", {
          "data-testid": `select-${location.id}`,
          onClick: () => onSelect(location),
        }),
      ),
  };
});

vi.mock("@/components/globe/CityArrivalCard", async () => {
  const React = await import("react");
  return {
    default: ({
      location,
      onClose,
    }: {
      location: { id: string };
      onClose: () => void;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "city-arrival-card",
          "data-location": location.id,
        },
        React.createElement("button", {
          "data-testid": "close-card",
          onClick: onClose,
        }),
      ),
  };
});

vi.mock("@/lib/useFavorites", () => ({
  useFavorites: () => ({
    isFavorite: (id: string) => favoritesState.favoritedIds.has(id),
    favorites: [...favoritesState.favoritedIds],
    toggleFavorite: () => {},
  }),
}));

vi.mock("@/lib/animation-deps", () => ({
  getAnimationDeps: () => ({
    now: () => 0,
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      cb(Number.MAX_SAFE_INTEGER);
      return 1;
    },
    cancelAnimationFrame: () => {},
  }),
}));

/*
 * `3.0` is inside the arrival threshold (3.2), so
 * `useArrivalDistance` reports `true` on the synchronous
 * initial read.
 */
vi.mock("@/components/globe/cameraDistanceContext", () => ({
  getCameraDistance: () => 3.0,
}));

import { fireEvent, screen } from "@testing-library/react";

import GlobeScene from "@/components/globe/GlobeScene";
import {
  getLocationsByGlobeTier,
  WORLD_LOCATIONS,
} from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function markersIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "[data-testid='globe-marker']",
    ),
  );
}

function cardsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "[data-testid='city-arrival-card']",
    ),
  );
}

/**
 * The integration harness.
 *
 * ## Why this is stateful
 *
 * `GlobeScene` is a controlled component — it renders what
 * the `selectedLocationId` prop tells it to, and it reports
 * user selections through `onLocationSelect`. That is the
 * correct design for a scene component: the parent owns the
 * selection state, and the scene reflects it.
 *
 * An integration test that wants to exercise the *callback
 * path* — click a marker, see the card appear — has to
 * provide the parent that owns the state. A no-op
 * `onLocationSelect` cannot: the click fires, the callback
 * runs, and nothing happens because the harness never
 * updates `selectedLocationId`.
 *
 * This wrapper component does exactly what `page.tsx` does
 * in production: it holds the selection in state, passes it
 * down, and lifts updates back up. Every test that drives
 * the callback path therefore exercises the same code path
 * production uses.
 */
function Harness({
  initialSelectedId = null as string | null,
  tier,
}: {
  initialSelectedId?: string | null;
  tier: GlobeTier;
}) {
  const [selectedLocationId, setSelectedLocationId] = useState<
    string | null
  >(initialSelectedId);

  return (
    <GlobeScene
      reducedMotion={false}
      selectedLocationId={selectedLocationId}
      globeTier={tier}
      visualMode="minimal"
      onLocationSelect={(location) => {
        setSelectedLocationId(location.id);
      }}
      onSolarChange={() => {}}
    />
  );
}

/**
 * Render the harness. Returns the standard RTL result, plus
 * a convenience `rerender` that takes a new initial selected
 * id — used by tests that want to force a selection change
 * without going through the callback path.
 */
function renderScene(
  tier: GlobeTier,
  initialSelectedId: string | null = null,
) {
  return render(
    <Harness initialSelectedId={initialSelectedId} tier={tier} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  favoritesState.favoritedIds.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — selection", () => {
  it("adds a transient marker when the selected id is not in the current tier", () => {
    const majorIds = new Set(
      getLocationsByGlobeTier("major").map((l) => l.id),
    );
    const outsideMajor = WORLD_LOCATIONS.find(
      (l) => !majorIds.has(l.id),
    );

    if (!outsideMajor) {
      throw new Error(
        "This test requires the catalog to contain at least one location outside the 'major' tier",
      );
    }

    const { container } = renderScene("major", outsideMajor.id);

    const selected = markersIn(container).find(
      (m) => m.dataset.selected === "true",
    );

    expect(selected).toBeDefined();
    expect(selected?.dataset.location).toBe(outsideMajor.id);
    expect(selected?.dataset.transient).toBe("true");
  });

  it("does not mark a selected location as transient when it is in the current tier", () => {
    const inside = getLocationsByGlobeTier("major")[0];
    if (!inside) {
      throw new Error("no major-tier location available");
    }

    const { container } = renderScene("major", inside.id);

    const selected = markersIn(container).find(
      (m) => m.dataset.selected === "true",
    );

    expect(selected).toBeDefined();
    expect(selected?.dataset.location).toBe(inside.id);
    expect(selected?.dataset.transient).toBe("false");
  });
});

/* -------------------------------------------------------------------------- */
/* Tier changes                                                               */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — tier changes", () => {
  it("renders more markers for the 'all' tier than for the 'major' tier", () => {
    const major = renderScene("major", null);
    const all = renderScene("all", null);

    expect(markersIn(all.container).length).toBeGreaterThan(
      markersIn(major.container).length,
    );
  });

  it("renders exactly the tier's location count as markers", () => {
    const major = renderScene("major", null);
    expect(markersIn(major.container).length).toBe(
      getLocationsByGlobeTier("major").length,
    );

    const all = renderScene("all", null);
    expect(markersIn(all.container).length).toBe(
      getLocationsByGlobeTier("all").length,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Marker state across tier changes                                           */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — marker state across tier changes", () => {
  it("appends exactly one extra marker when a transient is present", () => {
    const majorIds = new Set(
      getLocationsByGlobeTier("major").map((l) => l.id),
    );
    const outsideMajor = WORLD_LOCATIONS.find(
      (l) => !majorIds.has(l.id),
    );
    if (!outsideMajor) {
      throw new Error(
        "This test requires the catalog to contain an out-of-tier city",
      );
    }

    const { container } = renderScene("major", outsideMajor.id);

    expect(markersIn(container).length).toBe(
      getLocationsByGlobeTier("major").length + 1,
    );
  });

  it("keeps the transient marker when switching to a tier that still excludes it", () => {
    const majorIds = new Set(
      getLocationsByGlobeTier("major").map((l) => l.id),
    );
    const outsideMajor = WORLD_LOCATIONS.find(
      (l) => !majorIds.has(l.id),
    );
    if (!outsideMajor) {
      throw new Error(
        "This test requires the catalog to contain an out-of-tier city",
      );
    }

    const { container, rerender } = renderScene(
      "major",
      outsideMajor.id,
    );

    rerender(
      <Harness initialSelectedId={outsideMajor.id} tier="major" />,
    );

    const selected = markersIn(container).find(
      (m) => m.dataset.selected === "true",
    );

    expect(selected?.dataset.transient).toBe("true");
    expect(markersIn(container).length).toBe(
      getLocationsByGlobeTier("major").length + 1,
    );
  });

  it("removes the transient flag when switching to a tier that includes the selection", () => {
    const majorIds = new Set(
      getLocationsByGlobeTier("major").map((l) => l.id),
    );
    const outsideMajor = WORLD_LOCATIONS.find(
      (l) => !majorIds.has(l.id),
    );
    if (!outsideMajor) {
      throw new Error(
        "This test requires the catalog to contain an out-of-tier city",
      );
    }

    const { container, rerender } = renderScene(
      "major",
      outsideMajor.id,
    );

    rerender(
      <Harness initialSelectedId={outsideMajor.id} tier="all" />,
    );

    const selected = markersIn(container).find(
      (m) => m.dataset.selected === "true",
    );

    expect(selected?.dataset.transient).toBe("false");
    expect(markersIn(container).length).toBe(
      getLocationsByGlobeTier("all").length,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Favorited reflects the favorites hook                                      */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — favorited reflects the favorites hook", () => {
  it("sets favorited=true on exactly the cities in the favorites set", () => {
    favoritesState.favoritedIds.add("new-york");
    favoritesState.favoritedIds.add("london");

    const { container } = renderScene("all", null);

    const favorited = markersIn(container).filter(
      (m) => m.dataset.favorited === "true",
    );
    const favoritedIds = favorited
      .map((m) => m.dataset.location)
      .sort();

    expect(favoritedIds).toEqual(["london", "new-york"]);
  });

  it("updates the favorited flags on a rerender after the set changes", () => {
    const { container, rerender } = renderScene("all", null);

    expect(
      markersIn(container).filter(
        (m) => m.dataset.favorited === "true",
      ).length,
    ).toBe(0);

    favoritesState.favoritedIds.add("tokyo");

    rerender(<Harness initialSelectedId={null} tier="all" />);

    const tokyo = markersIn(container).find(
      (m) => m.dataset.location === "tokyo",
    );

    expect(tokyo?.dataset.favorited).toBe("true");
  });

  it("clears favorited when the city is removed from the set on a rerender", () => {
    favoritesState.favoritedIds.add("tokyo");

    const { container, rerender } = renderScene("all", null);

    const before = markersIn(container).find(
      (m) => m.dataset.location === "tokyo",
    );
    expect(before?.dataset.favorited).toBe("true");

    favoritesState.favoritedIds.delete("tokyo");

    rerender(<Harness initialSelectedId={null} tier="all" />);

    const after = markersIn(container).find(
      (m) => m.dataset.location === "tokyo",
    );
    expect(after?.dataset.favorited).toBe("false");
  });
});

/* -------------------------------------------------------------------------- */
/* Card visibility across dismiss and re-select                               */
/* -------------------------------------------------------------------------- */

/*
 * ## Why these tests use the stateful harness
 *
 * The bug being tested — "dismiss the card, then re-select
 * the same city, and the card stays hidden" — lives in the
 * interaction between the dismiss handler and the select
 * handler. Both live on `GlobeScene`.
 *
 * To exercise that interaction end-to-end, the test has to
 * deliver a real selection through `onLocationSelect`, which
 * only the harness can do. A test that drives
 * `selectedLocationId` through props would never enter the
 * `handleLocationSelect` code path at all.
 *
 * The dismiss click is wrapped in `act()` because the mock
 * fires `onClose` through a native `.click()` call that
 * bypasses RTL's `fireEvent` wrapper. Without the wrapper,
 * React does not flush the resulting state update before
 * the assertion.
 */

describe("GlobeScene — card visibility across dismiss and re-select", () => {
  it("re-shows the card when the same city is selected again after dismissal", () => {
    renderScene("major", null);

    /*
     * Select New York via the mock's select button. This
     * calls the real `handleLocationSelect`, which clears
     * `dismissedForId` and calls the harness's
     * `onLocationSelect`, which sets `selectedLocationId`.
     */
    fireEvent.click(screen.getByTestId("select-new-york"));

    /* The card is present on the next commit. */
    expect(cardsIn(document.body)).toHaveLength(1);

    /* Dismiss the card via its close button. */
    act(() => {
      fireEvent.click(screen.getByTestId("close-card"));
    });

    expect(cardsIn(document.body)).toHaveLength(0);

    /*
     * Re-select the same city. Under the old
     * `cardVisible`-boolean implementation, this would not
     * re-show the card because the selection state did not
     * change. Under the new `dismissedForId` model, the
     * re-selection clears the dismissal and the card
     * re-appears.
     */
    fireEvent.click(screen.getByTestId("select-new-york"));

    expect(cardsIn(document.body)).toHaveLength(1);
  });

  it("re-shows the card when a different city is selected after dismissal", () => {
    renderScene("major", null);

    fireEvent.click(screen.getByTestId("select-new-york"));
    expect(cardsIn(document.body)).toHaveLength(1);

    act(() => {
      fireEvent.click(screen.getByTestId("close-card"));
    });
    expect(cardsIn(document.body)).toHaveLength(0);

    /*
     * Select a different city. The new model re-shows the
     * card because `handleLocationSelect` clears
     * `dismissedForId`.
     */
    fireEvent.click(screen.getByTestId("select-london"));

    expect(cardsIn(document.body)).toHaveLength(1);
  });

  it("does not re-show the card on a plain rerender after dismissal", () => {
    /*
     * The complement of the previous test: a rerender that
     * does not go through `handleLocationSelect` must not
     * resurrect a dismissed card.
     *
     * This test cannot use the stateful harness because the
     * harness would implicitly own the selection and any
     * prop change would go through the harness's state. A
     * bare `render(<GlobeScene ... />)` with a fixed
     * `selectedLocationId` is the correct shape: the
     * selection is stable across renders, and only an
     * explicit `handleLocationSelect` would clear the
     * dismissal.
     */
    const { container, rerender } = render(
      <GlobeScene
        reducedMotion={false}
        selectedLocationId="new-york"
        globeTier="major"
        visualMode="minimal"
        onLocationSelect={() => {}}
        onSolarChange={() => {}}
      />,
    );

    expect(cardsIn(container)).toHaveLength(1);

    act(() => {
      fireEvent.click(screen.getByTestId("close-card"));
    });

    expect(cardsIn(container)).toHaveLength(0);

    /*
     * Rerender with the exact same props. The dismissal
     * must persist — no `handleLocationSelect` was called,
     * so `dismissedForId` is still `"new-york"` and
     * `showCard` is `false`.
     */
    rerender(
      <GlobeScene
        reducedMotion={false}
        selectedLocationId="new-york"
        globeTier="major"
        visualMode="minimal"
        onLocationSelect={() => {}}
        onSolarChange={() => {}}
      />,
    );

    expect(cardsIn(container)).toHaveLength(0);
  });
});