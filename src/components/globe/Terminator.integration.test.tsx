import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * Integration scope: the component's relationship with
 * `solarContext`. The frame callback reads the shared ref,
 * rotates a quaternion, and writes it onto the ring's
 * `quaternion` property. The adapter and solarContext mocks
 * are minimal; the important thing is that the values flow
 * through the component.
 */

const frameCallbacks: Array<() => void> = [];
const sunDirection = { x: 0, y: 0, z: 1 };

vi.mock("@/lib/r3f-adapters", () => ({
  useFrameAdapter: (cb: () => void) => {
    frameCallbacks.push(cb);
  },
  useThreeAdapter: () => ({
    camera: { position: { x: 0, y: 0, z: 5 } },
  }),
}));

vi.mock("@/components/globe/solarContext", () => ({
  getSunDirectionInGlobeFrame: () => sunDirection,
}));

import Terminator from "@/components/globe/Terminator";

function fireFrame(): void {
  for (const cb of frameCallbacks) cb();
}

beforeEach(() => {
  frameCallbacks.length = 0;
  sunDirection.x = 0;
  sunDirection.y = 0;
  sunDirection.z = 1;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Robustness across sun directions                                           */
/* -------------------------------------------------------------------------- */

describe("Terminator — full rotation of the sun", () => {
  it("does not throw across a full rotation in the XZ plane", () => {
    render(<Terminator />);

    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      sunDirection.x = Math.cos(angle);
      sunDirection.y = 0;
      sunDirection.z = Math.sin(angle);
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("does not throw across a full rotation in the XY plane", () => {
    render(<Terminator />);

    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      sunDirection.x = Math.cos(angle);
      sunDirection.y = Math.sin(angle);
      sunDirection.z = 0;
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("does not throw across a full rotation in the YZ plane", () => {
    render(<Terminator />);

    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      sunDirection.x = 0;
      sunDirection.y = Math.cos(angle);
      sunDirection.z = Math.sin(angle);
      expect(() => fireFrame()).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Cardinal directions                                                        */
/* -------------------------------------------------------------------------- */

describe("Terminator — cardinal sun directions", () => {
  it("handles every cardinal direction without throwing", () => {
    render(<Terminator />);

    for (const dir of [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]) {
      sunDirection.x = dir.x;
      sunDirection.y = dir.y;
      sunDirection.z = dir.z;
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("handles sub-cardinal directions without throwing", () => {
    render(<Terminator />);

    for (const dir of [
      { x: 0.577, y: 0.577, z: 0.577 },
      { x: -0.577, y: -0.577, z: -0.577 },
      { x: 0.707, y: 0, z: 0.707 },
      { x: 0, y: 0.707, z: 0.707 },
    ]) {
      sunDirection.x = dir.x;
      sunDirection.y = dir.y;
      sunDirection.z = dir.z;
      expect(() => fireFrame()).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Repeated-frame stability                                                   */
/* -------------------------------------------------------------------------- */

describe("Terminator — repeated-frame stability", () => {
  it("stays stable across 120 frames of the same direction", () => {
    render(<Terminator />);
    sunDirection.x = 0.5;
    sunDirection.y = 0.5;
    sunDirection.z = 0.5;

    expect(() => {
      for (let i = 0; i < 120; i += 1) fireFrame();
    }).not.toThrow();
  });

  it("survives alternation between two opposite directions", () => {
    /*
     * A pathological case that would break an implementation
     * using `setFromUnitVectors` with a stale scratch vector:
     * if the implementation reused a cached quaternion without
     * recomputing, alternating directions would leave the
     * quaternion in an inconsistent state. We assert only that
     * nothing throws; the visual correctness is the frame
     * callback's concern.
     */
    render(<Terminator />);

    for (let i = 0; i < 40; i += 1) {
      sunDirection.x = i % 2 === 0 ? 1 : -1;
      sunDirection.y = 0;
      sunDirection.z = 0;
      expect(() => fireFrame()).not.toThrow();
    }
  });

  it("survives a sun direction that is zero length without throwing", () => {
    /*
     * The solar sampler should never publish a zero-length
     * direction — `getSunDirection` returns a normalized
     * vector. But the component is a consumer of a shared
     * ref, and a shared ref can be corrupted by a bug in
     * another consumer. `computeRingQuaternion` normalizes
     * internally; three's `Vector3.normalize` treats a
     * zero-length vector as `(0, 0, 0)`, and
     * `setFromUnitVectors` handles that gracefully. Pin that
     * the component does not throw.
     */
    render(<Terminator />);
    sunDirection.x = 0;
    sunDirection.y = 0;
    sunDirection.z = 0;

    expect(() => fireFrame()).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

describe("Terminator — lifecycle", () => {
  it("unmounts cleanly", () => {
    const { unmount } = render(<Terminator />);
    fireFrame();
    expect(() => unmount()).not.toThrow();
  });

  it("does not fire stale frame callbacks after unmount", () => {
    /*
     * The adapter holds callbacks in the module-level
     * `frameCallbacks` array. After unmount the component's
     * callback should no longer be invoked by the R3F loop —
     * but our test harness captures callbacks eagerly, so we
     * only assert that firing them post-unmount does not
     * throw. This documents the pattern and would catch a
     * future edit that made the callback touch a disposed
     * THREE resource.
     */
    const { unmount } = render(<Terminator />);
    unmount();
    expect(() => fireFrame()).not.toThrow();
  });

  it("handles a remount after unmount", () => {
    const first = render(<Terminator />);
    first.unmount();

    frameCallbacks.length = 0;
    expect(() => render(<Terminator />)).not.toThrow();
    expect(() => fireFrame()).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple instances                                                         */
/* -------------------------------------------------------------------------- */

describe("Terminator — multiple instances", () => {
  it("mounts two terminators without throwing", () => {
    expect(() =>
      render(
        <>
          <Terminator />
          <Terminator />
        </>,
      ),
    ).not.toThrow();
  });

  it("registers two frame callbacks, one per instance", () => {
    render(
      <>
        <Terminator />
        <Terminator />
      </>,
    );
    expect(frameCallbacks).toHaveLength(2);
  });

  it("fires both callbacks without cross-talk", () => {
    render(
      <>
        <Terminator />
        <Terminator />
      </>,
    );

    sunDirection.x = 0.5;
    sunDirection.y = 0.5;
    sunDirection.z = 0.5;

    expect(() => fireFrame()).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* BufferGeometry disposal                                                    */
/* -------------------------------------------------------------------------- */

describe("Terminator — resource disposal", () => {
  it("disposes every BufferGeometry it built on unmount", () => {
    /*
     * Instrument `THREE.BufferGeometry.prototype.dispose` to
     * count calls during the unmount. The component builds
     * three geometries (ring, spike, tip) but the ring is
     * disabled by default — only the spike and tip geometries
     * are allocated, so two disposals are expected.
     */
    const originalDispose = THREE.BufferGeometry.prototype.dispose;
    const disposeSpy = vi.fn();

    THREE.BufferGeometry.prototype.dispose = function patchedDispose(
      this: THREE.BufferGeometry,
    ) {
      disposeSpy();
      return originalDispose.call(this);
    };

    const { unmount } = render(<Terminator />);
    unmount();

    THREE.BufferGeometry.prototype.dispose = originalDispose;

    /*
     * Two geometries: the spike and the tip. The ring
     * geometry is not built when `SHOW_TERMINATOR_RING` is
     * false (the default).
     */
    expect(disposeSpy).toHaveBeenCalledTimes(2);
  });
});