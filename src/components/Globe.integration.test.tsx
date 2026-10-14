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
  vi,
} from "vitest";
import * as THREE from "three";

import type { Atmosphere } from "@/lib/atmosphere";
import {
  globeAtmosphereRef,
  lastSampleTimeRef,
  resetGlobeAtmosphereContext,
} from "@/components/globe/globeAtmosphereContext";

/* -------------------------------------------------------------------------- */
/* R3F hook mock — driven by module-scope fixtures                            */
/* -------------------------------------------------------------------------- */

/*
 * `GlobeAtmosphereSampler` reads the camera and the scene from
 * R3F's `useThree` and registers its frame callback with
 * `useFrame`. Both are mocked here so the sampler's sampling
 * pipeline runs against a synthetic scene with a real THREE
 * globe group.
 *
 * ## Why a top-level mock instead of the test-renderer
 *
 * Earlier revisions of this file tried to mount the sampler
 * in `@react-three/test-renderer` so its real R3F hooks would
 * run against a real THREE scene. That strategy requires the
 * test-renderer's `renderer.camera` and `renderer.scene`
 * properties, which are not exposed in every version of the
 * library — the version installed here does not have them.
 *
 * The mock below is the pattern used by
 * `GlobeAtmosphereSampler.integration.test.tsx`, which has
 * been exercising this component successfully. It sidesteps
 * the test-renderer's version-specific API entirely: the
 * sampler's hooks are replaced with stubs that read from
 * module-scope fixtures, and the frame callback is invoked
 * manually from the test.
 *
 * ## Why this is safe for the rest of the file
 *
 * `Globe.tsx` loads `GlobeCanvas` via `next/dynamic`, and
 * this file mocks `@/components/GlobeCanvas` with a plain
 * `<div>` stub. So the real `GlobeCanvas` — and with it the
 * real `<Canvas>` and the real R3F reconciler — never mounts
 * in this file. The `@react-three/fiber` mock below therefore
 * only affects the sampler test; every other test in this
 * file is a plain React-DOM render.
 *
 * ## Why the callback takes a state argument
 *
 * R3F invokes `useFrame` callbacks with a `RootState` object
 * whose `clock.elapsedTime` is seconds since the renderer
 * started. The sampler reads `state.clock.elapsedTime` to
 * drive its throttle. The mock's callback type mirrors that
 * shape so `fireFrame` can hand the sampler a valid state.
 */

const r3fFixtures = {
  camera: new THREE.PerspectiveCamera(),
  globeGroup: new THREE.Object3D(),
  frameCallbacks: [] as Array<
    (state: { clock: { elapsedTime: number } }) => void
  >,
  globeGroupName: "world-clock-globe",
};

r3fFixtures.camera.position.set(0, 0, 3.6);
r3fFixtures.globeGroup.name = r3fFixtures.globeGroupName;

vi.mock("@react-three/fiber", async () => {
  const actual =
    await vi.importActual<typeof import("@react-three/fiber")>(
      "@react-three/fiber",
    );
  return {
    ...actual,
    useThree: () => ({
      camera: r3fFixtures.camera,
      scene: {
        getObjectByName: (name: string) =>
          name === r3fFixtures.globeGroupName
            ? r3fFixtures.globeGroup
            : undefined,
      },
    }),
    useFrame: (
      cb: (state: { clock: { elapsedTime: number } }) => void,
    ) => {
      r3fFixtures.frameCallbacks.push(cb);
    },
  };
});

/* -------------------------------------------------------------------------- */
/* Child mocks                                                                */
/* -------------------------------------------------------------------------- */

/*
 * `Globe.tsx` imports `GlobeCanvas` via `next/dynamic(() =>
 * import("./GlobeCanvas"))`. Vitest's mock registry keys on
 * resolved module paths, so a `vi.mock` for `@/components/GlobeCanvas`
 * intercepts BOTH the alias import from this file and the
 * relative dynamic import inside `Globe.tsx` — they resolve to
 * the same file.
 *
 * The consequence is that the real `next/dynamic` runs, but
 * its loader resolves to this mock. The first render paints
 * the `loading` placeholder; after the promise resolves (a
 * microtask), the mocked canvas mounts. Tests use
 * `findByTestId` / `waitFor` to await that transition.
 */
vi.mock("@/components/GlobeCanvas", () => ({
  default: ({
    reducedMotion,
    selectedLocationId,
    globeTier,
  }: {
    reducedMotion: boolean;
    selectedLocationId: string | null;
    globeTier: string;
  }) => (
    <div
      data-testid="globe-canvas"
      data-reduced-motion={String(reducedMotion)}
      data-selected={String(selectedLocationId)}
      data-tier={globeTier}
    />
  ),
}));

vi.mock("@/components/globe/GlobeCanvasBoundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="canvas-boundary">{children}</div>
  ),
}));

vi.mock("@/components/search/SearchableLocationInput", () => ({
  default: ({
    selectedLocation,
    onSelect,
    ariaLabel,
  }: {
    selectedLocation: WorldLocation | null;
    onSelect: (location: WorldLocation) => void;
    ariaLabel: string;
  }) => (
    <div
      data-testid="search"
      data-selected={selectedLocation?.id ?? ""}
    >
      <button
        data-testid="mock-search-select"
        aria-label={ariaLabel}
        onClick={() =>
          onSelect({
            id: "tokyo",
            city: "Tokyo",
            country: "Japan",
            timezone: "Asia/Tokyo",
            latitude: 35.6762,
            longitude: 139.6503,
            continent: "east-asia",
            globeTiers: ["main"],
          })
        }
      />
    </div>
  ),
}));

vi.mock("@/components/globe/VisualModeToggle", () => ({
  default: () => <div data-testid="visual-mode-toggle" />,
  VISUAL_MODES: [
    { value: "minimal", label: "Minimal" },
    { value: "realistic", label: "Realistic" },
  ],
}));

vi.mock("@/components/globe/AstronomicalEventPicker", () => ({
  default: () => <div data-testid="astronomical-picker" />,
}));

vi.mock("@/components/globe/TimeOverrideBanner", () => ({
  default: () => <div data-testid="time-override-banner" />,
}));

vi.mock("@/components/globe/GlobeSizeToggle", () => ({
  default: () => <div data-testid="globe-size-toggle" />,
}));

vi.mock("@/lib/useVisualMode", () => ({
  useVisualMode: () => ({
    visualMode: "minimal",
    setVisualMode: vi.fn(),
  }),
}));

vi.mock("@/components/globe/useAstronomicalEventPicker", () => ({
  useAstronomicalEventPicker: () => ({
    events: [],
    activeEventId: null,
    dispatch: vi.fn(),
  }),
}));

import Globe from "@/components/Globe";
import GlobeAtmosphereSampler from "@/components/globe/GlobeAtmosphereSampler";
import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* matchMedia helper                                                          */
/* -------------------------------------------------------------------------- */

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  });
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function renderGlobe(
  overrides: Partial<React.ComponentProps<typeof Globe>> = {},
) {
  const props: React.ComponentProps<typeof Globe> = {
    selectedLocationId: null,
    onLocationSelect: vi.fn(),
    solarState: null,
    onSolarChange: vi.fn(),
    ...overrides,
  };

  render(<Globe {...props} />);
  return props;
}

/**
 * Wait for `next/dynamic` to resolve the mocked canvas and
 * return it. Every test that inspects canvas-level props goes
 * through this helper.
 */
async function findCanvas(): Promise<HTMLElement> {
  return screen.findByTestId("globe-canvas");
}

/**
 * Fire every captured frame callback with an R3F-shaped state
 * object. `GlobeAtmosphereSampler` registers its callback via
 * `useFrame`; the mock pushes it to
 * `r3fFixtures.frameCallbacks`. Calling this is equivalent to
 * advancing one R3F frame at the given elapsed time.
 *
 * `elapsedTime` is in seconds, matching R3F's
 * `state.clock.elapsedTime`.
 */
function fireFrame(elapsedTime: number): void {
  for (const cb of r3fFixtures.frameCallbacks) {
    cb({ clock: { elapsedTime } });
  }
}

beforeEach(() => {
  installMatchMedia(false);
  resetGlobeAtmosphereContext();
  vi.useFakeTimers({ shouldAdvanceTime: true });

  r3fFixtures.frameCallbacks.length = 0;
  r3fFixtures.camera.position.set(0, 0, 3.6);
  r3fFixtures.globeGroup.name = r3fFixtures.globeGroupName;
  r3fFixtures.globeGroup.quaternion.set(0, 0, 0, 1);
});

afterEach(() => {
  resetGlobeAtmosphereContext();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Initial state                                                              */
/* -------------------------------------------------------------------------- */

describe("Globe — initial state", () => {
  it("defaults to the major tier", async () => {
    renderGlobe();

    const canvas = await findCanvas();
    expect(canvas.getAttribute("data-tier")).toBe("major");
  });

  it("marks Major Cities as checked", () => {
    renderGlobe();

    expect(
      screen.getByRole("radio", { name: /Major Cities/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("marks All Cities as unchecked", () => {
    renderGlobe();

    expect(
      screen.getByRole("radio", { name: /All Cities/ }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

/* -------------------------------------------------------------------------- */
/* Tier switching                                                             */
/* -------------------------------------------------------------------------- */

describe("Globe — tier switching", () => {
  it("switches to the all tier on click", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("propagates the selected tier to the canvas", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("updates aria-checked when switching", () => {
    renderGlobe();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    expect(
      screen.getByRole("radio", { name: /All Cities/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: /Major Cities/ }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

/* -------------------------------------------------------------------------- */
/* Keyboard navigation                                                        */
/* -------------------------------------------------------------------------- */

describe("Globe — keyboard navigation", () => {
  it("moves to the next tier on ArrowRight", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("wraps to the first tier on ArrowRight at the end", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowRight",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "major",
      );
    });
  });

  it("moves to the previous tier on ArrowLeft", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowLeft",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("moves forward on ArrowDown", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowDown",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("moves backward on ArrowUp", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "ArrowUp",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("jumps to the first tier on Home", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.click(
      screen.getByRole("radio", { name: /All Cities/ }),
    );

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "Home",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "major",
      );
    });
  });

  it("jumps to the last tier on End", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "End",
    });

    await waitFor(() => {
      expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
        "data-tier",
        "all",
      );
    });
  });

  it("ignores unrelated keys", async () => {
    renderGlobe();
    await findCanvas();

    fireEvent.keyDown(screen.getByRole("radiogroup"), {
      key: "Enter",
    });

    expect(screen.getByTestId("globe-canvas")).toHaveAttribute(
      "data-tier",
      "major",
    );
  });

  it("ignores Tab (does not prevent default)", async () => {
    /*
     * The handler returns early for keys it does not
     * recognize, without calling `preventDefault`. That is
     * what lets Tab move focus out of the radiogroup
     * normally, which is required for a usable keyboard
     * experience.
     */
    renderGlobe();
    await findCanvas();

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });

    screen.getByRole("radiogroup").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Search input                                                               */
/* -------------------------------------------------------------------------- */

describe("Globe — search input", () => {
  it("passes the resolved selected location to the search input", () => {
    renderGlobe({ selectedLocationId: "tokyo" });

    expect(screen.getByTestId("search")).toHaveAttribute(
      "data-selected",
      "tokyo",
    );
  });

  it("passes null when no location is selected", () => {
    renderGlobe({ selectedLocationId: null });

    expect(screen.getByTestId("search")).toHaveAttribute(
      "data-selected",
      "",
    );
  });

  it("passes null when the selected id is not in the active tier", () => {
    /*
     * The `selectedLocationId` is resolved against the
     * *visible* tier. A location that exists in the catalog
     * but not in the current tier is treated as unselected.
     */
    renderGlobe({ selectedLocationId: "not-a-real-id" });

    expect(screen.getByTestId("search")).toHaveAttribute(
      "data-selected",
      "",
    );
  });

  it("forwards selections from the search input upward", () => {
    const onLocationSelect = vi.fn();
    renderGlobe({ onLocationSelect });

    fireEvent.click(screen.getByTestId("mock-search-select"));

    expect(onLocationSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tokyo" }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("Globe — reduced motion", () => {
  it("starts with reducedMotion=false when the media query is false", async () => {
    installMatchMedia(false);
    renderGlobe();

    const canvas = await findCanvas();
    expect(canvas).toHaveAttribute("data-reduced-motion", "false");
  });

  it("reports reducedMotion=true when the media query matches", async () => {
    installMatchMedia(true);
    renderGlobe();

    const canvas = await findCanvas();
    expect(canvas).toHaveAttribute("data-reduced-motion", "true");
  });
});

/* -------------------------------------------------------------------------- */
/* onAtmosphereChange — integration with the real sampler                     */
/* -------------------------------------------------------------------------- */

/*
 * ## What this block tests, and what it does not
 *
 * `Globe.tsx` polls `globeAtmosphereRef` at
 * `SAMPLE_INTERVAL_MS` and calls `onAtmosphereChange` when the
 * value changes. `GlobeAtmosphereSampler` is the writer.
 *
 * The unit test (`Globe.component.test.tsx`) verifies the
 * poller against a manually-driven ref. This integration test
 * verifies the two halves against each other: mount the real
 * sampler, fire a frame through its `useFrame` callback, and
 * confirm the value flows through to the parent.
 *
 * ## What is not asserted
 *
 * The specific `Atmosphere` value. `sampleGlobeAtmosphere`
 * classifies by local hour at the nearest catalogued city,
 * which depends on the current wall-clock time at the moment
 * the test runs. Asserting on the value would make the suite
 * pass or fail depending on when it was executed. The
 * assertion is on the *contract*: whatever the sampler writes
 * reaches the parent.
 *
 * ## How the sampler is driven
 *
 * The R3F hooks (`useThree`, `useFrame`) are mocked at the
 * top of this file. `useThree` returns a synthetic camera and
 * a synthetic scene whose `getObjectByName` returns a real
 * THREE globe group. `useFrame` pushes the sampler's frame
 * callback into `r3fFixtures.frameCallbacks`; the `fireFrame`
 * helper invokes them with an R3F-shaped state object.
 *
 * This is the same strategy as
 * `GlobeAtmosphereSampler.integration.test.tsx`, which is why
 * it is reliable across `@react-three/test-renderer` versions
 * — it does not depend on any test-renderer-specific API.
 */

describe("Globe — onAtmosphereChange integration with the sampler", () => {
  it("does not call onAtmosphereChange until the sampler has produced a value", async () => {
    /*
     * `resetGlobeAtmosphereContext` (in `beforeEach`) sets the
     * ref to `null`. No sampler is mounted, so the poller
     * must not fire.
     */
    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onAtmosphereChange).not.toHaveBeenCalled();
  });

  it("forwards the sampler's value through to onAtmosphereChange", async () => {
    /*
     * Mount the sampler in a plain React-DOM render. The
     * mocked `useThree` / `useFrame` hooks drive it against
     * the module-scope fixtures.
     */
    render(<GlobeAtmosphereSampler />);

    fireFrame(0);

    /*
     * The sampler has now written to the ref. Read whatever it
     * produced.
     */
    const samplerValue = globeAtmosphereRef.current;
    expect(samplerValue).not.toBeNull();

    const received: Atmosphere[] = [];
    renderGlobe({
      onAtmosphereChange: (a) => {
        if (a !== null) received.push(a);
      },
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(received).toEqual([samplerValue]);
  });

  it("tracks a change written to the ref by the sampler between polls", async () => {
    /*
     * Simulate the sampler writing twice with different
     * values across two poll cycles. The callback must see
     * both, in order.
     */
    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    /* First sample — day. */
    globeAtmosphereRef.current = "day";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    /* Second sample — night. */
    globeAtmosphereRef.current = "night";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onAtmosphereChange.mock.calls).toEqual([
      ["day"],
      ["night"],
    ]);
  });

  it("does not emit when the sampler writes the same value again", async () => {
    /*
     * The sampler is throttled and often writes the same
     * `Atmosphere` across consecutive samples — the local
     * hour rarely changes between two 250 ms ticks. The
     * poller must deduplicate.
     */
    const onAtmosphereChange = vi.fn();
    renderGlobe({ onAtmosphereChange });

    globeAtmosphereRef.current = "day";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    globeAtmosphereRef.current = "day";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    globeAtmosphereRef.current = "day";
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onAtmosphereChange).toHaveBeenCalledTimes(1);
  });

  it("cleans up its poll interval and does not leak values after unmount", async () => {
    const onAtmosphereChange = vi.fn();
    const { unmount } = render(
      <Globe
        selectedLocationId={null}
        onLocationSelect={vi.fn()}
        solarState={null}
        onSolarChange={vi.fn()}
        onAtmosphereChange={onAtmosphereChange}
      />,
    );

    unmount();

    globeAtmosphereRef.current = "day";
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onAtmosphereChange).not.toHaveBeenCalled();
  });

  it("resets the sampler context on the next test (fixture hygiene)", () => {
    /*
     * A meta-test: after the previous tests, the ref may have
     * been written. `resetGlobeAtmosphereContext` in
     * `afterEach` returns it to `null`. This test confirms
     * the reset ran.
     */
    expect(globeAtmosphereRef.current).toBeNull();
    expect(lastSampleTimeRef.current).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("Globe — accessibility", () => {
  it("region has an accessible name", () => {
    renderGlobe();

    expect(
      screen.getByRole("region", {
        name: /Interactive 3D world globe/,
      }),
    ).toBeInTheDocument();
  });

  it("tier selector exposes a radiogroup", () => {
    renderGlobe();

    expect(
      screen.getByRole("radiogroup", { name: "Globe display mode" }),
    ).toBeInTheDocument();
  });

  it("the active tier is the only one with tabIndex=0", () => {
    renderGlobe();

    const majorTab = screen.getByRole("radio", {
      name: /Major Cities/,
    });
    const allTab = screen.getByRole("radio", {
      name: /All Cities/,
    });

    expect(majorTab).toHaveAttribute("tabindex", "0");
    expect(allTab).toHaveAttribute("tabindex", "-1");
  });
});