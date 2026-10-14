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
/* Fake camera and frame loop                                                 */
/* -------------------------------------------------------------------------- */

const cameraPositionLength = { value: 5 };

/**
 * Registered frame callbacks in registration order.
 *
 * The mock **appends** every call to `useFrame`. R3F's real
 * `useFrame` replaces the previous callback when the new one
 * has a different identity, but the mock's shape is what
 * makes the identity observable: if the component's callback
 * is stable, every entry in this array is the same function
 * reference.
 */
const frameCallbacks: Array<() => void> = [];

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    camera: {
      position: {
        length: () => cameraPositionLength.value,
      },
    },
  }),
  useFrame: (cb: () => void) => {
    frameCallbacks.push(cb);
  },
}));

import CameraDistanceSampler from "@/components/globe/CameraDistanceSampler";
import {
  cameraDistanceRef,
  resetCameraDistance,
} from "@/components/globe/cameraDistanceContext";
import { INITIAL_CAMERA_DISTANCE } from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fireFrame(): void {
  for (const cb of frameCallbacks) cb();
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  frameCallbacks.length = 0;
  cameraPositionLength.value = 5;
  resetCameraDistance();
  vi.clearAllMocks();
});

afterEach(() => {
  resetCameraDistance();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

describe("CameraDistanceSampler — mount", () => {
  it("renders null", () => {
    const { container } = render(<CameraDistanceSampler />);

    expect(container.firstChild).toBeNull();
  });

  it("registers exactly one frame callback", () => {
    render(<CameraDistanceSampler />);

    expect(frameCallbacks).toHaveLength(1);
  });

  it("does not write to the ref during render", () => {
    expect(cameraDistanceRef.current).toBe(
      INITIAL_CAMERA_DISTANCE,
    );

    render(<CameraDistanceSampler />);

    expect(cameraDistanceRef.current).toBe(
      INITIAL_CAMERA_DISTANCE,
    );
  });

  it("does not introduce DOM", () => {
    const { container } = render(<CameraDistanceSampler />);

    expect(container.children).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("does not introduce focusable elements", () => {
    render(<CameraDistanceSampler />);

    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );

    expect(focusable).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Frame writes                                                               */
/* -------------------------------------------------------------------------- */

describe("CameraDistanceSampler — frame writes", () => {
  it("writes the camera's position length to the ref on each frame", () => {
    cameraPositionLength.value = 3.6;

    render(<CameraDistanceSampler />);

    fireFrame();

    expect(cameraDistanceRef.current).toBe(3.6);
  });

  it("updates the ref when the camera moves between frames", () => {
    cameraPositionLength.value = 3.6;

    render(<CameraDistanceSampler />);

    fireFrame();
    expect(cameraDistanceRef.current).toBe(3.6);

    cameraPositionLength.value = 5.8;

    fireFrame();
    expect(cameraDistanceRef.current).toBe(5.8);
  });

  it("writes zero when the camera is at the origin", () => {
    cameraPositionLength.value = 0;

    render(<CameraDistanceSampler />);

    fireFrame();

    expect(cameraDistanceRef.current).toBe(0);
  });

  it("overwrites any previous ref value on the first frame", () => {
    cameraDistanceRef.current = 999;
    cameraPositionLength.value = 3.6;

    render(<CameraDistanceSampler />);
    fireFrame();

    expect(cameraDistanceRef.current).toBe(3.6);
  });

  it("handles each distance in the camera ladder", () => {
    const distances = [2.6, 2.9, 3.2, 3.6, 4.2, 5.0, 5.8];

    render(<CameraDistanceSampler />);

    for (const d of distances) {
      cameraPositionLength.value = d;
      fireFrame();

      expect(cameraDistanceRef.current).toBe(d);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Callback stability                                                         */
/* -------------------------------------------------------------------------- */

describe("CameraDistanceSampler — callback stability", () => {
  it("registers a callback with a stable identity across renders", () => {
    /*
     * The frame callback is memoized with `useCallback([])`, so
     * every call to `useFrame` receives the same function
     * reference. The mock appends every call to `frameCallbacks`
     * — the entries may have different lengths across renders
     * if the component re-renders, but every entry should be
     * the same function object.
     *
     * This is the real contract that matters for R3F: it keys
     * its internal subscription on callback identity, so a
     * stable callback means R3F does not re-subscribe the
     * frame loop.
     */
    const { rerender } = render(<CameraDistanceSampler />);

    const firstCallback = frameCallbacks[0];

    rerender(<CameraDistanceSampler />);
    rerender(<CameraDistanceSampler />);
    rerender(<CameraDistanceSampler />);

    for (const cb of frameCallbacks) {
      expect(cb).toBe(firstCallback);
    }
  });

  it("the registered callback keeps writing on every frame after re-render", () => {
    const { rerender } = render(<CameraDistanceSampler />);

    rerender(<CameraDistanceSampler />);

    cameraPositionLength.value = 4.2;
    fireFrame();

    expect(cameraDistanceRef.current).toBe(4.2);
  });

  it("does not leave stale callbacks that write outdated values", () => {
    /*
     * Because the callback identity is stable, firing every
     * entry in the array is equivalent to firing just the
     * first one — they are all the same function. This test
     * confirms no stale closure was captured that would write
     * a value from an earlier render's perspective.
     */
    cameraPositionLength.value = 3.6;

    const { rerender } = render(<CameraDistanceSampler />);

    cameraPositionLength.value = 5.8;
    rerender(<CameraDistanceSampler />);

    fireFrame();

    expect(cameraDistanceRef.current).toBe(5.8);
  });
});

/* -------------------------------------------------------------------------- */
/* Unmount                                                                    */
/* -------------------------------------------------------------------------- */

describe("CameraDistanceSampler — unmount", () => {
  it("unmounts without throwing", () => {
    const { unmount } = render(<CameraDistanceSampler />);

    expect(() => unmount()).not.toThrow();
  });

  it("does not crash if the captured callback fires after unmount", () => {
    const { unmount } = render(<CameraDistanceSampler />);

    const captured = [...frameCallbacks];

    unmount();

    expect(() => {
      for (const cb of captured) cb();
    }).not.toThrow();
  });
});