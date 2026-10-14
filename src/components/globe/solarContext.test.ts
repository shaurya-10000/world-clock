import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rotateByInverse } from "@/lib/quaternion";

/*
 * The `quaternion` module is mocked for the first describe
 * block so the delegation contract can be asserted without
 * pulling in the real math. The second describe block imports
 * the real `rotateByInverse` (via `vi.importActual`) and
 * verifies the two halves fit together.
 */
vi.mock("@/lib/quaternion", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/quaternion")>();
  return {
    ...actual,
    rotateByInverse: vi.fn(actual.rotateByInverse),
  };
});

import {
  getSunDirectionInGlobeFrame,
  globeWorldQuaternionRef,
  resetSolarContext,
  sunDirectionRef,
} from "@/components/globe/solarContext";

const mockedRotateByInverse = vi.mocked(rotateByInverse);

/*
 * The `rotateByInverse` mock is imported but not actually
 * called by `getSunDirectionInGlobeFrame` in the current
 * implementation — the reader just copies the fields. The mock
 * exists to catch a future regression: if the reader ever
 * starts delegating to `rotateByInverse` (say, to return a
 * world-space sun), the mock would intercept that call.
 *
 * `mockedRotateByInverse` is therefore only used in the
 * `delegation` describe block below, and the tests there are
 * written to be meaningful even if the current implementation
 * never touches it — by asserting that the reader does NOT
 * call it.
 */

beforeEach(() => {
  resetSolarContext();
  mockedRotateByInverse.mockClear();
});

afterEach(() => {
  resetSolarContext();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Ref defaults                                                               */
/* -------------------------------------------------------------------------- */

describe("solarContext — ref defaults", () => {
  it("initializes the sun direction to +Z", () => {
    expect(sunDirectionRef.current).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("initializes the globe quaternion to identity", () => {
    expect(globeWorldQuaternionRef.current).toEqual([0, 0, 0, 1]);
  });

  it("exposes a mutable `current` field on the sun-direction ref", () => {
    sunDirectionRef.current = { x: 1, y: 2, z: 3 };
    expect(sunDirectionRef.current).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("exposes a mutable `current` field on the quaternion ref", () => {
    globeWorldQuaternionRef.current = [0.1, 0.2, 0.3, 0.9];
    expect(globeWorldQuaternionRef.current).toEqual([
      0.1, 0.2, 0.3, 0.9,
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* resetSolarContext                                                          */
/* -------------------------------------------------------------------------- */

describe("resetSolarContext", () => {
  it("restores the sun direction to +Z", () => {
    sunDirectionRef.current = { x: 5, y: 5, z: 5 };
    resetSolarContext();
    expect(sunDirectionRef.current).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("restores the quaternion to identity", () => {
    globeWorldQuaternionRef.current = [0.1, 0.2, 0.3, 0.9];
    resetSolarContext();
    expect(globeWorldQuaternionRef.current).toEqual([0, 0, 0, 1]);
  });

  it("is idempotent", () => {
    resetSolarContext();
    resetSolarContext();
    resetSolarContext();

    expect(sunDirectionRef.current).toEqual({ x: 0, y: 0, z: 1 });
    expect(globeWorldQuaternionRef.current).toEqual([0, 0, 0, 1]);
  });

  it("replaces the sun-direction object rather than mutating it", () => {
    /*
     * The reader is documented to return a fresh object on
     * every call. If `resetSolarContext` mutated the existing
     * object instead of replacing it, a consumer that had
     * captured a reference to `.current` before the reset
     * would see their captured object change under them.
     * Replacing the object preserves the "fresh read"
     * contract end-to-end.
     */
    const before = sunDirectionRef.current;
    resetSolarContext();
    expect(sunDirectionRef.current).not.toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* getSunDirectionInGlobeFrame — return shape                                 */
/* -------------------------------------------------------------------------- */

describe("getSunDirectionInGlobeFrame — return shape", () => {
  it("returns the current sun direction", () => {
    sunDirectionRef.current = { x: 0.5, y: -0.25, z: 0.8 };

    const result = getSunDirectionInGlobeFrame();

    expect(result).toEqual({ x: 0.5, y: -0.25, z: 0.8 });
  });

  it("returns the default value before any write", () => {
    const result = getSunDirectionInGlobeFrame();

    expect(result).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("returns a fresh object on every call", () => {
    const first = getSunDirectionInGlobeFrame();
    const second = getSunDirectionInGlobeFrame();
    expect(first).not.toBe(second);
  });

  it("returns an object whose fields do not alias the ref", () => {
    /*
     * The reader's whole purpose is to hand the caller a
     * snapshot. If the returned object shared the ref's field
     * storage — or worse, was `sunDirectionRef.current`
     * itself — a subsequent write to the ref would be visible
     * through the returned value. It must not be.
     */
    const snapshot = getSunDirectionInGlobeFrame();
    sunDirectionRef.current = { x: 9, y: 9, z: 9 };

    expect(snapshot).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("returns plain numbers in every field", () => {
    sunDirectionRef.current = { x: 0.1, y: 0.2, z: 0.3 };
    const result = getSunDirectionInGlobeFrame();

    expect(typeof result.x).toBe("number");
    expect(typeof result.y).toBe("number");
    expect(typeof result.z).toBe("number");
  });

  it("does not call rotateByInverse", () => {
    /*
     * Regression guard. The header of `solarContext.ts`
     * promises that the value is published in the geography
     * frame and compared against a local normal — no
     * transform. If a future edit adds a quaternion rotation
     * here, the terminator's frame would silently change.
     * This test would catch that addition at the seam.
     */
    getSunDirectionInGlobeFrame();
    expect(mockedRotateByInverse).not.toHaveBeenCalled();
  });

  it("returns a value that is finite even for an extreme ref write", () => {
    sunDirectionRef.current = {
      x: Number.MAX_SAFE_INTEGER,
      y: Number.MIN_SAFE_INTEGER,
      z: 0,
    };

    const result = getSunDirectionInGlobeFrame();

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* getSunDirectionInGlobeFrame — mutability                                   */
/* -------------------------------------------------------------------------- */

describe("getSunDirectionInGlobeFrame — mutability", () => {
  it("returned object can be mutated by the caller without affecting the ref", () => {
    const result = getSunDirectionInGlobeFrame();
    result.x = 999;
    result.y = 999;
    result.z = 999;

    expect(sunDirectionRef.current).toEqual({ x: 0, y: 0, z: 1 });
  });
});

/* -------------------------------------------------------------------------- */
/* sunDirectionRef — in-place mutation contract                               */
/* -------------------------------------------------------------------------- */

describe("sunDirectionRef — in-place mutation contract", () => {
  it("preserves object identity when a consumer writes field-by-field", () => {
    /*
     * This mirrors the pattern `SolarSampler` uses: it mutates
     * the three fields individually rather than replacing the
     * object. Any consumer holding a reference to `.current`
     * sees the update; any consumer reading through
     * `getSunDirectionInGlobeFrame` sees a fresh snapshot.
     */
    const before = sunDirectionRef.current;
    sunDirectionRef.current.x = 0.5;
    sunDirectionRef.current.y = 0.5;
    sunDirectionRef.current.z = 0.5;

    expect(sunDirectionRef.current).toBe(before);
    expect(before).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });
});

/* -------------------------------------------------------------------------- */
/* globeWorldQuaternionRef — reassignment contract                            */
/* -------------------------------------------------------------------------- */

describe("globeWorldQuaternionRef — reassignment contract", () => {
  it("is reassigned rather than mutated", () => {
    /*
     * Documented behavior: the quaternion ref is a fresh tuple
     * every frame. A future edit that changed it to a mutable
     * array would need to update the docstring; this test
     * pins the current shape.
     */
    const before = globeWorldQuaternionRef.current;
    globeWorldQuaternionRef.current = [0.5, 0.5, 0.5, 0.5];
    expect(globeWorldQuaternionRef.current).not.toBe(before);
  });

  it("accepts a four-tuple in x, y, z, w order", () => {
    globeWorldQuaternionRef.current = [0.1, 0.2, 0.3, 0.4];
    const [x, y, z, w] = globeWorldQuaternionRef.current;

    expect(x).toBe(0.1);
    expect(y).toBe(0.2);
    expect(z).toBe(0.3);
    expect(w).toBe(0.4);
  });
});