import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

const cameraPositionLength = { value: 5 };

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    camera: {
      position: {
        length: () => cameraPositionLength.value,
      },
    },
  }),
}));

const frameCallbacks: Array<() => void> = [];

vi.mock("@/lib/r3f-adapters", () => ({
  useFrameAdapter: (cb: () => void) => {
    frameCallbacks.push(cb);
  },
}));

const sunDirection = { x: 0, y: 0, z: 1 };

vi.mock("@/components/globe/solarContext", () => ({
  getSunDirectionInGlobeFrame: () => sunDirection,
}));

import EarthSphere from "@/components/globe/EarthSphere";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fireFrame() {
  for (const cb of frameCallbacks) cb();
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  frameCallbacks.length = 0;
  cameraPositionLength.value = 5;
  sunDirection.x = 0;
  sunDirection.y = 0;
  sunDirection.z = 1;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Repeated frame firing                                                      */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — repeated frame firing", () => {
  it("does not throw when fired across a full rotation of sun directions", () => {
    render(<EarthSphere />);

    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      sunDirection.x = Math.cos(angle);
      sunDirection.y = Math.sin(angle);
      sunDirection.z = 0;
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("survives cardinal and sub-cardinal sun directions", () => {
    render(<EarthSphere />);

    const directions = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 0.577, y: 0.577, z: 0.577 },
      { x: -0.577, y: -0.577, z: -0.577 },
    ];

    for (const dir of directions) {
      sunDirection.x = dir.x;
      sunDirection.y = dir.y;
      sunDirection.z = dir.z;
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("does not throw across a wide sweep of camera distances", () => {
    /*
     * The frame callback reads `camera.position.length()` and
     * writes it through `computeSurfaceOpacity`. Sweeping the
     * distance across the fade band exercises every branch of
     * that function through the frame loop.
     */
    render(<EarthSphere />);

    for (let d = -2; d <= 20; d += 0.25) {
      cameraPositionLength.value = d;
      expect(() => fireFrame()).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Sun direction propagation                                                  */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — sun direction propagation", () => {
  it("the frame callback fires without throwing for any sun direction", () => {
    render(<EarthSphere />);

    const directions = [
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: -1, y: 0, z: 0 },
    ];

    for (const dir of directions) {
      sunDirection.x = dir.x;
      sunDirection.y = dir.y;
      sunDirection.z = dir.z;

      expect(() => fireFrame()).not.toThrow();
    }
  });
});