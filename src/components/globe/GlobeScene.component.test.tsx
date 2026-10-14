import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GlobeTier } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Favorites state — controllable per test                                    */
/* -------------------------------------------------------------------------- */

const favoritesState = {
  favoritedIds: new Set<string>(),
};

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

vi.mock("@/components/globe/EarthSphere", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "earth-sphere" }),
  };
});

vi.mock("@/components/globe/RealisticEarthSphere", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", {
        "data-testid": "realistic-earth-sphere",
      }),
  };
});

vi.mock("@/components/globe/CountryPolygons", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "country-polygons" }),
  };
});

vi.mock("@/components/globe/Terminator", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "terminator" }),
  };
});

vi.mock("@/components/globe/SolarSampler", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement("div", { "data-testid": "solar-sampler" }),
  };
});

vi.mock("@/components/globe/GlobeControls", async () => {
  return {
    default: () => null,
  };
});

vi.mock("@/components/globe/GlobeMarker", async () => {
  const React = await import("react");
  return {
    default: ({
      location,
      selected,
      transient,
      favorited,
    }: {
      location: { id: string };
      selected: boolean;
      transient: boolean;
      favorited: boolean;
    }) =>
      React.createElement("div", {
        "data-testid": "globe-marker",
        "data-location": location.id,
        "data-selected": String(selected),
        "data-transient": String(transient),
        "data-favorited": String(favorited),
      }),
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
      React.createElement("div", {
        "data-testid": "city-arrival-card",
        "data-location": location.id,
        onClick: onClose,
      }),
  };
});

vi.mock("@/lib/useFavorites", () => ({
  useFavorites: () => ({
    isFavorite: (id: string) => favoritesState.favoritedIds.has(id),
    favorites: [...favoritesState.favoritedIds],
    toggleFavorite: () => {},
  }),
}));

/*
 * `3.0` is inside the arrival threshold (3.2), so
 * `useArrivalDistance` reports `true` on the synchronous
 * initial read. The card renders on the very first commit.
 */
vi.mock("@/components/globe/cameraDistanceContext", () => ({
  getCameraDistance: () => 3.0,
}));

import GlobeScene from "@/components/globe/GlobeScene";

interface Options {
  selectedLocationId?: string | null;
  globeTier?: GlobeTier;
  reducedMotion?: boolean;
  visualMode?: "minimal" | "realistic";
}

function renderScene(opts: Options = {}) {
  return render(
    <GlobeScene
      reducedMotion={opts.reducedMotion ?? false}
      selectedLocationId={opts.selectedLocationId ?? null}
      globeTier={opts.globeTier ?? "major"}
      visualMode={opts.visualMode ?? "minimal"}
      onLocationSelect={() => {}}
      onSolarChange={() => {}}
    />,
  );
}

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

beforeEach(() => {
  vi.clearAllMocks();
  favoritesState.favoritedIds.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — composition", () => {
  it("renders the minimal EarthSphere, CountryPolygons, and Terminator in minimal mode", () => {
    const { container } = renderScene({ visualMode: "minimal" });
    expect(
      container.querySelector("[data-testid='earth-sphere']"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-testid='realistic-earth-sphere']",
      ),
    ).toBeNull();
    expect(
      container.querySelector("[data-testid='country-polygons']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid='terminator']"),
    ).not.toBeNull();
  });

  it("renders the RealisticEarthSphere instead of EarthSphere in realistic mode", () => {
    const { container } = renderScene({ visualMode: "realistic" });
    expect(
      container.querySelector(
        "[data-testid='realistic-earth-sphere']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid='earth-sphere']"),
    ).toBeNull();
  });

  it("renders SolarSampler", () => {
    const { container } = renderScene();
    expect(
      container.querySelector("[data-testid='solar-sampler']"),
    ).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Markers — count                                                            */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — markers", () => {
  it("renders at least one marker", () => {
    const { container } = renderScene();
    expect(markersIn(container).length).toBeGreaterThan(0);
  });

  it("marks the selected marker when its id is passed", () => {
    const { container } = renderScene({
      selectedLocationId: "new-york",
    });

    const selected = markersIn(container).find(
      (el) => el.dataset.selected === "true",
    );

    expect(selected).toBeDefined();
    expect(selected?.dataset.location).toBe("new-york");
  });

  it("marks no marker as selected when no id is passed", () => {
    const { container } = renderScene({ selectedLocationId: null });

    const selected = markersIn(container).filter(
      (el) => el.dataset.selected === "true",
    );

    expect(selected).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Marker state composition                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — marker state composition", () => {
  it("marks a selected in-tier location as transient=false", () => {
    const { container } = renderScene({
      globeTier: "major",
      selectedLocationId: "new-york",
    });

    const selected = markersIn(container).find(
      (el) => el.dataset.selected === "true",
    );

    expect(selected).toBeDefined();
    expect(selected?.dataset.location).toBe("new-york");
    expect(selected?.dataset.transient).toBe("false");
  });

  it("marks a selected out-of-tier location as transient=true", () => {
    const { container } = renderScene({
      globeTier: "major",
      selectedLocationId: "boston",
    });

    const selected = markersIn(container).find(
      (el) => el.dataset.selected === "true",
    );

    expect(selected).toBeDefined();
    expect(selected?.dataset.location).toBe("boston");
    expect(selected?.dataset.transient).toBe("true");
  });

  it("marks a selected in-tier location under the 'all' tier as transient=false", () => {
    const { container } = renderScene({
      globeTier: "all",
      selectedLocationId: "boston",
    });

    const selected = markersIn(container).find(
      (el) => el.dataset.selected === "true",
    );

    expect(selected).toBeDefined();
    expect(selected?.dataset.transient).toBe("false");
  });

  it("marks no non-selected marker as transient", () => {
    const { container } = renderScene({
      globeTier: "major",
      selectedLocationId: null,
    });

    for (const marker of markersIn(container)) {
      expect(marker.dataset.transient).toBe("false");
    }
  });

  it("marks favorited locations with favorited=true", () => {
    favoritesState.favoritedIds.add("new-york");
    favoritesState.favoritedIds.add("london");

    const { container } = renderScene({
      globeTier: "all",
      selectedLocationId: null,
    });

    const newYork = markersIn(container).find(
      (el) => el.dataset.location === "new-york",
    );
    const london = markersIn(container).find(
      (el) => el.dataset.location === "london",
    );
    const tokyo = markersIn(container).find(
      (el) => el.dataset.location === "tokyo",
    );

    expect(newYork?.dataset.favorited).toBe("true");
    expect(london?.dataset.favorited).toBe("true");
    expect(tokyo?.dataset.favorited).toBe("false");
  });

  it("marks no marker as favorited when the favorites set is empty", () => {
    const { container } = renderScene({
      globeTier: "major",
      selectedLocationId: null,
    });

    for (const marker of markersIn(container)) {
      expect(marker.dataset.favorited).toBe("false");
    }
  });

  it("favorited and selected are independent axes", () => {
    favoritesState.favoritedIds.add("new-york");
    favoritesState.favoritedIds.add("london");

    const { container } = renderScene({
      globeTier: "all",
      selectedLocationId: "new-york",
    });

    const byId = (id: string): HTMLElement | undefined =>
      markersIn(container).find(
        (el) => el.dataset.location === id,
      );

    const ny = byId("new-york");
    const london = byId("london");
    const tokyo = byId("tokyo");

    expect(ny?.dataset.selected).toBe("true");
    expect(ny?.dataset.favorited).toBe("true");

    expect(london?.dataset.selected).toBe("false");
    expect(london?.dataset.favorited).toBe("true");

    expect(tokyo?.dataset.selected).toBe("false");
    expect(tokyo?.dataset.favorited).toBe("false");
  });
});

/* -------------------------------------------------------------------------- */
/* Arrival card visibility                                                    */
/* -------------------------------------------------------------------------- */

describe("GlobeScene — arrival card visibility", () => {
  it("renders exactly one CityArrivalCard when a location is selected and the camera is close", () => {
    const { container } = renderScene({
      selectedLocationId: "new-york",
    });

    expect(cardsIn(container)).toHaveLength(1);
  });

  it("renders no CityArrivalCard when nothing is selected", () => {
    const { container } = renderScene();
    expect(cardsIn(container)).toHaveLength(0);
  });

  it("renders the card on the very first commit — no frame is required", () => {
    /*
     * The synchronous initial read in `useArrivalDistance`
     * means the card is present in the first commit. An
     * earlier version of the hook deferred the first read
     * behind a `requestAnimationFrame`, which left the card
     * absent until one frame had fired.
     *
     * This test does not advance any timers or frames. If the
     * hook ever reintroduces the deferral without keeping the
     * synchronous read, this test fails.
     */
    const { container } = renderScene({
      selectedLocationId: "new-york",
    });

    expect(cardsIn(container)).toHaveLength(1);
  });

  it("hides the card after dismissal", () => {
    const { container } = renderScene({
      selectedLocationId: "new-york",
    });

    expect(cardsIn(container)).toHaveLength(1);

    /*
     * The mock's `CityArrivalCard` fires `onClose` when
     * clicked. That call reaches `handleCardClose`, which
     * records `dismissedForId`.
     *
     * The click is wrapped in `act()` because `card?.click()`
     * uses the native DOM `.click()`, which bypasses RTL's
     * `fireEvent` wrapper. The click itself works — the
     * handler fires — but React does not flush the resulting
     * state update into the DOM before this test's next
     * assertion unless we explicitly tell it to.
     */
    const card = cardsIn(container)[0];
    expect(card).toBeDefined();

    act(() => {
      card?.click();
    });

    expect(cardsIn(container)).toHaveLength(0);
  });

  it("does not re-show the card on a plain rerender after dismissal", () => {
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

    const card = cardsIn(container)[0];
    expect(card).toBeDefined();

    act(() => {
      card?.click();
    });

    expect(cardsIn(container)).toHaveLength(0);

    /*
     * A rerender that does not go through
     * `handleLocationSelect` must not resurrect a dismissed
     * card. Only an explicit re-selection clears
     * `dismissedForId`.
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

  it("does not render the card when the camera is far from the arrival threshold", async () => {
    /*
     * Override the camera-distance mock for this single test
     * so `useArrivalDistance` reports `false`. A distance
     * well above `ARRIVAL_DISTANCE_THRESHOLD` (3.2) is the
     * "user is browsing, not focused on a city" case.
     */
    vi.resetModules();
    vi.doMock("@/components/globe/cameraDistanceContext", () => ({
      getCameraDistance: () => 8.0,
    }));

    const { default: GlobeSceneFar } = await import(
      "@/components/globe/GlobeScene"
    );

    const { container } = render(
      <GlobeSceneFar
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