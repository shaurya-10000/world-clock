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
/* Stable fake camera                                                         */
/* -------------------------------------------------------------------------- */

/*
 * The mock for `useThree` returns a stable camera object.
 *
 * In production, R3F returns the same camera object for the
 * component's lifetime — `useThree`'s `camera` field is
 * stable. Returning a fresh object on every call (the naive
 * mock) would make `[camera, distance]` in the effect's
 * dependency array change on every render, re-running the
 * effect unconditionally and defeating the "only re-run when
 * distance changes" contract the component relies on.
 *
 * The object is built once at module scope and reused for
 * every call to `useThree`.
 */
const cameraState = {
  length: 5,
};

const fakeCamera = {
  position: {
    length: () => cameraState.length,
    setLength: vi.fn(),
    set: vi.fn(),
  },
  updateProjectionMatrix: vi.fn(),
};

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({ camera: fakeCamera }),
}));

import CameraDriver from "@/components/globe/CameraDriver";

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  cameraState.length = 5;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Normal path                                                                */
/* -------------------------------------------------------------------------- */

describe("CameraDriver — normal path", () => {
  it("renders null", () => {
    const { container } = render(<CameraDriver distance={3.6} />);

    expect(container.firstChild).toBeNull();
  });

  it("calls setLength with the distance on mount", () => {
    render(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledTimes(1);
    expect(fakeCamera.position.setLength).toHaveBeenCalledWith(3.6);
  });

  it("calls setLength with a different distance on re-render", () => {
    const { rerender } = render(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledWith(3.6);

    rerender(<CameraDriver distance={5.2} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledWith(5.2);
    expect(fakeCamera.position.setLength).toHaveBeenCalledTimes(2);
  });

  it("does not call setLength again when the distance does not change", () => {
    const { rerender } = render(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledTimes(1);

    rerender(<CameraDriver distance={3.6} />);
    rerender(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledTimes(1);
  });

  it("calls setLength for zero distance when the camera is not at the origin", () => {
    render(<CameraDriver distance={0} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledWith(0);
    expect(fakeCamera.position.set).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Degenerate path                                                            */
/* -------------------------------------------------------------------------- */

describe("CameraDriver — degenerate path", () => {
  it("calls set(0, 0, distance) when the camera is at the origin", () => {
    cameraState.length = 0;

    render(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.set).toHaveBeenCalledTimes(1);
    expect(fakeCamera.position.set).toHaveBeenCalledWith(0, 0, 3.6);
  });

  it("does not call setLength when the camera is at the origin", () => {
    cameraState.length = 0;

    render(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.setLength).not.toHaveBeenCalled();
  });

  it("uses the current distance prop in the degenerate path", () => {
    cameraState.length = 0;

    render(<CameraDriver distance={9.0} />);

    expect(fakeCamera.position.set).toHaveBeenCalledWith(0, 0, 9.0);
  });
});

/* -------------------------------------------------------------------------- */
/* Distance changes                                                           */
/* -------------------------------------------------------------------------- */

describe("CameraDriver — distance changes", () => {
  it("reacts to every distance value in the ladder", () => {
    const distances = [2.6, 2.9, 3.2, 3.6, 4.2, 5.0, 5.8];

    const { rerender } = render(
      <CameraDriver distance={distances[0] as number} />,
    );

    for (let i = 1; i < distances.length; i += 1) {
      rerender(<CameraDriver distance={distances[i] as number} />);
    }

    expect(fakeCamera.position.setLength).toHaveBeenCalledTimes(
      distances.length,
    );

    for (const d of distances) {
      expect(fakeCamera.position.setLength).toHaveBeenCalledWith(d);
    }
  });

  it("switches from the degenerate path to the normal path when the camera moves off the origin", () => {
    cameraState.length = 0;

    const { rerender } = render(<CameraDriver distance={3.6} />);

    expect(fakeCamera.position.set).toHaveBeenCalledTimes(1);

    cameraState.length = 5;

    rerender(<CameraDriver distance={4.2} />);

    expect(fakeCamera.position.setLength).toHaveBeenCalledWith(4.2);
  });
});

/* -------------------------------------------------------------------------- */
/* Side effects                                                               */
/* -------------------------------------------------------------------------- */

describe("CameraDriver — side effects", () => {
  it("does not introduce DOM", () => {
    const { container } = render(<CameraDriver distance={3.6} />);

    expect(container.children).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  it("does not introduce focusable elements", () => {
    render(<CameraDriver distance={3.6} />);

    const focusable = document.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );

    expect(focusable).toHaveLength(0);
  });
});