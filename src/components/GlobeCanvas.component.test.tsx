import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ReactNode } from "react";

import GlobeCanvas from "@/components/GlobeCanvas";

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The R3F canvas and the scene are the two heavy children.
 * Mocking both keeps this file focused on what `GlobeCanvas`
 * itself contributes to the DOM: sizing, touch-action, and
 * the wrapper that holds the canvas.
 */
vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    children,
    style,
  }: {
    children: ReactNode;
    style: Record<string, unknown>;
  }) => (
    <div
      data-testid="r3f-canvas"
      style={{
        width: style.width as string,
        height: style.height as string,
        touchAction: style.touchAction as string,
      }}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/components/globe/GlobeScene", () => ({
  default: () => <div data-testid="globe-scene" />,
}));

vi.mock("@/components/globe/CameraDistanceSampler", () => ({
  default: () => <div data-testid="camera-distance-sampler" />,
}));

vi.mock("@/components/globe/GlobeAtmosphereSampler", () => ({
  default: () => <div data-testid="globe-atmosphere-sampler" />,
}));

vi.mock("@/components/globe/CameraDriver", () => ({
  default: ({ distance }: { distance: number }) => (
    <div data-testid="camera-driver" data-distance={distance} />
  ),
}));

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCanvas(
  overrides: Partial<
    React.ComponentProps<typeof GlobeCanvas>
  > = {},
) {
  const props: React.ComponentProps<typeof GlobeCanvas> = {
    reducedMotion: false,
    selectedLocationId: null,
    globeTier: "major",
    visualMode: "minimal",
    onLocationSelect: vi.fn(),
    onSolarChange: vi.fn(),
    ...overrides,
  };

  const utils = render(<GlobeCanvas {...props} />);

  return { props, ...utils };
}

/* -------------------------------------------------------------------------- */
/* Rendered output                                                            */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvas — rendered output", () => {
  it("renders the canvas wrapper", () => {
    renderCanvas();

    expect(
      screen.getByTestId("r3f-canvas"),
    ).toBeInTheDocument();
  });

  it("renders the scene inside the canvas", () => {
    renderCanvas();

    const canvas = screen.getByTestId("r3f-canvas");
    const scene = screen.getByTestId("globe-scene");

    expect(canvas.contains(scene)).toBe(true);
  });

  it("renders nothing else at the top level", () => {
    const { container } = renderCanvas();

    expect(container.children).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Children                                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvas — children", () => {
  it("renders the camera distance sampler", () => {
    renderCanvas();

    expect(
      screen.getByTestId("camera-distance-sampler"),
    ).toBeInTheDocument();
  });

  it("renders the globe atmosphere sampler", () => {
    renderCanvas();

    expect(
      screen.getByTestId("globe-atmosphere-sampler"),
    ).toBeInTheDocument();
  });

  it("renders the camera driver", () => {
    renderCanvas();

    expect(
      screen.getByTestId("camera-driver"),
    ).toBeInTheDocument();
  });

  it("passes the camera distance to the driver", () => {
    renderCanvas({ cameraDistance: 4.2 });

    expect(screen.getByTestId("camera-driver")).toHaveAttribute(
      "data-distance",
      "4.2",
    );
  });

  it("uses the initial camera distance when none is given", () => {
    /*
     * The default is `INITIAL_CAMERA_DISTANCE` from
     * `globe/constants`. We don't hardcode the numeric value
     * here — the driver receives whatever the default is, and
     * the constant is verified in `globe/constants.test.ts`.
     * This test asserts the pass-through, not the value.
     */
    renderCanvas();

    const driver = screen.getByTestId("camera-driver");
    const distance = driver.getAttribute("data-distance");

    expect(distance).not.toBeNull();
    expect(Number(distance)).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Canvas sizing and touch-action                                             */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvas — sizing and touch", () => {
  it("canvas fills its parent width", () => {
    renderCanvas();

    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas.style.width).toBe("100%");
  });

  it("canvas fills its parent height", () => {
    renderCanvas();

    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas.style.height).toBe("100%");
  });

  it("canvas sets touchAction to none", () => {
    /*
     * `touchAction: "none"` is what makes the globe rotatable
     * on touch devices. Any other value lets the browser
     * intercept vertical drags as page scroll, which is the
     * classic "the globe won't rotate on mobile" failure.
     */
    renderCanvas();

    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas.style.touchAction).toBe("none");
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvas — accessibility", () => {
  it("does not introduce focusable elements", () => {
    renderCanvas();

    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not introduce a landmark role", () => {
    /*
     * The canvas is a leaf decoration. The parent region
     * (`components/Globe.tsx`) supplies the accessible name
     * for the whole globe surface, so the canvas itself
     * must not announce anything.
     */
    renderCanvas();

    expect(document.querySelector("main")).toBeNull();
    expect(document.querySelector("section")).toBeNull();
    expect(document.querySelector("aside")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Stability                                                                  */
/* -------------------------------------------------------------------------- */

describe("GlobeCanvas — stability", () => {
  it("renders without throwing for every tier", () => {
    expect(() => renderCanvas({ globeTier: "major" })).not.toThrow();
    expect(() => renderCanvas({ globeTier: "all" })).not.toThrow();
  });

  it("renders with a selected location", () => {
    expect(() =>
      renderCanvas({ selectedLocationId: "tokyo" }),
    ).not.toThrow();
  });

  it("renders with reduced motion on", () => {
    expect(() =>
      renderCanvas({ reducedMotion: true }),
    ).not.toThrow();
  });

  it("renders for every visual mode", () => {
    expect(() =>
      renderCanvas({ visualMode: "minimal" }),
    ).not.toThrow();
    expect(() =>
      renderCanvas({ visualMode: "realistic" }),
    ).not.toThrow();
  });
});