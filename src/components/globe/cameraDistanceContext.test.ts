import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  cameraDistanceRef,
  getCameraDistance,
  resetCameraDistance,
} from "@/components/globe/cameraDistanceContext";
import { INITIAL_CAMERA_DISTANCE } from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetCameraDistance();
});

afterEach(() => {
  resetCameraDistance();
});

/* -------------------------------------------------------------------------- */
/* cameraDistanceRef — initial value                                          */
/* -------------------------------------------------------------------------- */

describe("cameraDistanceRef — initial value", () => {
  it("is initialized to INITIAL_CAMERA_DISTANCE", () => {
    expect(cameraDistanceRef.current).toBe(
      INITIAL_CAMERA_DISTANCE,
    );
  });

  it("is a plain object with a `current` number field", () => {
    expect(cameraDistanceRef).toBeTypeOf("object");
    expect(cameraDistanceRef).not.toBeNull();
    expect(typeof cameraDistanceRef.current).toBe("number");
  });

  it("holds a finite positive number by default", () => {
    expect(Number.isFinite(cameraDistanceRef.current)).toBe(true);
    expect(cameraDistanceRef.current).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* cameraDistanceRef — mutability                                             */
/* -------------------------------------------------------------------------- */

describe("cameraDistanceRef — mutability", () => {
  it("accepts a new number via `.current`", () => {
    cameraDistanceRef.current = 5.8;

    expect(cameraDistanceRef.current).toBe(5.8);
  });

  it("accepts zero", () => {
    /*
     * Zero is a valid distance in the sense that a caller
     * could theoretically write it — the ref does not validate
     * its content. The consumers of the value (the arrival
     * card, surface fade) handle zero without crashing.
     */
    cameraDistanceRef.current = 0;

    expect(cameraDistanceRef.current).toBe(0);
  });

  it("accepts negative numbers", () => {
    /*
     * Negative distances are not produced in production —
     * `position.length()` is always non-negative. The ref
     * does not validate, so a test that writes a negative
     * value sees it back. This pins the "no validation"
     * contract.
     */
    cameraDistanceRef.current = -1;

    expect(cameraDistanceRef.current).toBe(-1);
  });

  it("accepts NaN", () => {
    /*
     * Same reasoning as the negative case: the ref is a
     * storage location, not a validator. A producer that
     * writes NaN is the bug, not this module.
     */
    cameraDistanceRef.current = NaN;

    expect(Number.isNaN(cameraDistanceRef.current)).toBe(true);
  });

  it("accepts Infinity", () => {
    cameraDistanceRef.current = Infinity;

    expect(cameraDistanceRef.current).toBe(Infinity);
  });
});

/* -------------------------------------------------------------------------- */
/* getCameraDistance                                                          */
/* -------------------------------------------------------------------------- */

describe("getCameraDistance", () => {
  it("returns the current ref value", () => {
    expect(getCameraDistance()).toBe(INITIAL_CAMERA_DISTANCE);
  });

  it("reflects a value written directly to the ref", () => {
    cameraDistanceRef.current = 4.2;

    expect(getCameraDistance()).toBe(4.2);
  });

  it("returns a number, not the ref object", () => {
    const result = getCameraDistance();

    expect(typeof result).toBe("number");
    expect(result).not.toBe(cameraDistanceRef);
  });

  it("is deterministic — same state, same value", () => {
    cameraDistanceRef.current = 3.6;

    expect(getCameraDistance()).toBe(3.6);
    expect(getCameraDistance()).toBe(3.6);
    expect(getCameraDistance()).toBe(3.6);
  });

  it("returns the same primitive across calls — numbers are value-typed", () => {
    /*
     * Unlike an object-returning reader, there is no identity
     * to preserve here. Two calls that see the same ref value
     * return the same primitive. A future refactor that
     * returned a fresh `{ value }` wrapper would change the
     * contract.
     */
    const a = getCameraDistance();
    const b = getCameraDistance();

    expect(a).toBe(b);
  });

  it("does not write to the ref", () => {
    cameraDistanceRef.current = 7;

    getCameraDistance();
    getCameraDistance();

    expect(cameraDistanceRef.current).toBe(7);
  });
});

/* -------------------------------------------------------------------------- */
/* resetCameraDistance                                                        */
/* -------------------------------------------------------------------------- */

describe("resetCameraDistance", () => {
  it("restores the initial value after a write", () => {
    cameraDistanceRef.current = 99;

    resetCameraDistance();

    expect(cameraDistanceRef.current).toBe(
      INITIAL_CAMERA_DISTANCE,
    );
  });

  it("is idempotent — calling twice is safe", () => {
    cameraDistanceRef.current = 99;

    resetCameraDistance();
    resetCameraDistance();

    expect(cameraDistanceRef.current).toBe(
      INITIAL_CAMERA_DISTANCE,
    );
  });

  it("does not throw when called with no prior write", () => {
    expect(() => resetCameraDistance()).not.toThrow();
  });

  it("is visible through getCameraDistance after the reset", () => {
    cameraDistanceRef.current = 99;
    resetCameraDistance();

    expect(getCameraDistance()).toBe(INITIAL_CAMERA_DISTANCE);
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-function consistency                                                 */
/* -------------------------------------------------------------------------- */

describe("cross-function consistency", () => {
  it("the writer-visible value and the reader-visible value agree", () => {
    cameraDistanceRef.current = 5.8;

    expect(getCameraDistance()).toBe(cameraDistanceRef.current);
  });

  it("reset brings both views back to INITIAL_CAMERA_DISTANCE", () => {
    cameraDistanceRef.current = 5.8;
    resetCameraDistance();

    expect(getCameraDistance()).toBe(INITIAL_CAMERA_DISTANCE);
    expect(cameraDistanceRef.current).toBe(
      INITIAL_CAMERA_DISTANCE,
    );
  });

  it("survives a write-reset-write cycle", () => {
    cameraDistanceRef.current = 3.6;
    resetCameraDistance();
    cameraDistanceRef.current = 4.2;

    expect(getCameraDistance()).toBe(4.2);
  });

  it("exposes the same ref object across imports", () => {
    /*
     * The ref is a module-level singleton. Two accesses to the
     * binding — even from different files — see the same
     * object. In this test, the two accesses are to the same
     * binding; a future refactor that exported a getter
     * function would break this.
     */
    const a = cameraDistanceRef;
    const b = cameraDistanceRef;

    expect(a).toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* Type-level sanity                                                          */
/* -------------------------------------------------------------------------- */

describe("type-level sanity", () => {
  it("the ref type allows direct `.current` reads and writes", () => {
    const ref: { current: number } = cameraDistanceRef;

    ref.current = 1.23;

    expect(ref.current).toBe(1.23);
  });

  it("getCameraDistance returns a `number`", () => {
    const value: number = getCameraDistance();

    expect(typeof value).toBe("number");
  });

  it("resetCameraDistance returns void", () => {
    const result: void = resetCameraDistance();

    expect(result).toBeUndefined();
  });
});