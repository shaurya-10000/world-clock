import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as logger from "@/lib/logger";
import {
  __resetQuaternionFailureLog,
  rotateByInverse,
  type QuaternionTuple,
  type Vec3,
} from "@/lib/quaternion";

/* -------------------------------------------------------------------------- */
/* Fixtures & helpers                                                         */
/* -------------------------------------------------------------------------- */

/** The identity quaternion — a no-op rotation. */
const IDENTITY: QuaternionTuple = [0, 0, 0, 1];

/** Build a unit quaternion for a rotation about an arbitrary axis. */
function axisAngle(
  axis: Vec3,
  angleRadians: number,
): QuaternionTuple {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  const ax = axis.x / length;
  const ay = axis.y / length;
  const az = axis.z / length;

  const half = angleRadians / 2;
  const s = Math.sin(half);

  return [ax * s, ay * s, az * s, Math.cos(half)];
}

function magnitude(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function expectVec3Close(
  actual: Vec3,
  expected: Vec3,
  precision = 10,
): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  /*
   * Reset the non-unit-quaternion warning memo between
   * tests.
   *
   * The memo is keyed on the magnitude of the offending
   * quaternion, and it is never cleared by the production
   * code path. Without this reset, the first test in the
   * file that triggers the guard would consume the memo,
   * and every subsequent test that asserts "warns once"
   * would see zero warnings because the magnitude had
   * already been memoized.
   *
   * The memo reset is what makes the contract testable,
   * not what makes it correct. Correctness in production
   * comes from the fact that the guard is only meant to
   * fire once per magnitude for the page lifetime.
   */
  __resetQuaternionFailureLog();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

describe("rotateByInverse — identity quaternion", () => {
  it("leaves any vector unchanged", () => {
    const cases: readonly Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 3, y: -4, z: 12 },
      { x: -0.5, y: 0.25, z: 0.125 },
    ];

    for (const v of cases) {
      expectVec3Close(rotateByInverse(v, IDENTITY), v);
    }
  });

  it("returns a vector with the same magnitude", () => {
    const v = { x: 3, y: 4, z: 12 };
    const rotated = rotateByInverse(v, IDENTITY);

    expect(magnitude(rotated)).toBeCloseTo(magnitude(v), 10);
  });

  it("returns a fresh object, not the input reference", () => {
    const v = { x: 1, y: 2, z: 3 };
    const rotated = rotateByInverse(v, IDENTITY);

    expect(rotated).not.toBe(v);
  });

  it("does not mutate the input vector", () => {
    const v = { x: 1, y: 2, z: 3 };
    const snapshot = { ...v };

    rotateByInverse(v, IDENTITY);

    expect(v).toEqual(snapshot);
  });
});

/* -------------------------------------------------------------------------- */
/* Axis rotations (inverse direction)                                         */
/* -------------------------------------------------------------------------- */

describe("rotateByInverse — single-axis rotations", () => {
  /*
   * These tests use the *inverse* rotation direction by
   * design. `rotateByInverse(v, q)` is `q⁻¹ · v · q`, so a
   * quaternion encoding a +90° rotation about an axis
   * produces a −90° rotation of the vector.
   */

  it("rotates +90° about Z by −90° when applied as inverse", () => {
    const q = axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    const rotated = rotateByInverse({ x: 1, y: 0, z: 0 }, q);

    expectVec3Close(rotated, { x: 0, y: -1, z: 0 });
  });

  it("rotates +90° about X by −90° when applied as inverse", () => {
    const q = axisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    const rotated = rotateByInverse({ x: 0, y: 1, z: 0 }, q);

    expectVec3Close(rotated, { x: 0, y: 0, z: -1 });
  });

  it("rotates +90° about Y by −90° when applied as inverse", () => {
    const q = axisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const rotated = rotateByInverse({ x: 0, y: 0, z: 1 }, q);

    expectVec3Close(rotated, { x: -1, y: 0, z: 0 });
  });

  it("rotates 180° about Z to the negated vector", () => {
    const q = axisAngle({ x: 0, y: 0, z: 1 }, Math.PI);
    const rotated = rotateByInverse({ x: 1, y: 0, z: 0 }, q);

    expectVec3Close(rotated, { x: -1, y: 0, z: 0 });
  });

  it("performs a 360° rotation as the identity", () => {
    const q = axisAngle({ x: 0, y: 0, z: 1 }, Math.PI * 2);
    const rotated = rotateByInverse({ x: 1, y: 0, z: 0 }, q);

    expectVec3Close(rotated, { x: 1, y: 0, z: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* Invariants                                                                 */
/* -------------------------------------------------------------------------- */

describe("rotateByInverse — invariants", () => {
  it("preserves the magnitude of the input vector", () => {
    const v = { x: 3, y: 4, z: 12 };
    const expected = magnitude(v);

    const rotations: readonly QuaternionTuple[] = [
      axisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 4),
      axisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 3),
      axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 6),
      axisAngle({ x: 1, y: 1, z: 1 }, Math.PI / 2),
      axisAngle({ x: -2, y: 5, z: 3 }, 1.234),
    ];

    for (const q of rotations) {
      expect(magnitude(rotateByInverse(v, q))).toBeCloseTo(
        expected,
        10,
      );
    }
  });

  it("is the inverse of the forward rotation", () => {
    const q = axisAngle({ x: 1, y: 1, z: 0 }, Math.PI / 3);
    const qConjugate: QuaternionTuple = [-q[0], -q[1], -q[2], q[3]];

    const v: Vec3 = { x: 1, y: 2, z: 3 };
    const once = rotateByInverse(v, q);
    const twice = rotateByInverse(once, qConjugate);

    expectVec3Close(twice, v);
  });

  it("composes as expected: two small rotations equal the sum", () => {
    const qForward = axisAngle(
      { x: 0, y: 0, z: 1 },
      Math.PI / 4,
    );
    const qBackward = axisAngle(
      { x: 0, y: 0, z: 1 },
      -Math.PI / 4,
    );

    const v: Vec3 = { x: 1, y: 0, z: 0 };
    const once = rotateByInverse(v, qForward);
    const twice = rotateByInverse(once, qBackward);

    expectVec3Close(twice, v);
  });

  it("rotates the zero vector to the zero vector", () => {
    const q = axisAngle({ x: 1, y: 1, z: 1 }, 1.5);
    const rotated = rotateByInverse({ x: 0, y: 0, z: 0 }, q);

    expect(rotated).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("is a pure rotation for every unit quaternion", () => {
    const q = axisAngle({ x: 1, y: 2, z: 3 }, 0.7);

    const vectors: readonly Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: -2, y: 5, z: -3 },
    ];

    for (const v of vectors) {
      expect(magnitude(rotateByInverse(v, q))).toBeCloseTo(
        magnitude(v),
        10,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Anti-symmetry                                                              */
/* -------------------------------------------------------------------------- */

describe("rotateByInverse — anti-symmetry about the axis", () => {
  it("rotates the axis vector to itself (axis is fixed)", () => {
    const axis: Vec3 = { x: 1, y: 2, z: 3 };
    const q = axisAngle(axis, 1.1);

    const rotated = rotateByInverse(axis, q);

    expectVec3Close(rotated, axis);
  });

  it("component perpendicular to the axis flips sign for ±the same angle", () => {
    const q = axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    const qInverse = axisAngle(
      { x: 0, y: 0, z: 1 },
      -Math.PI / 2,
    );

    const v: Vec3 = { x: 1, y: 0, z: 0 };
    const forward = rotateByInverse(v, q);
    const backward = rotateByInverse(v, qInverse);

    expect(forward.z).toBeCloseTo(backward.z, 10);
    expect(forward.x).toBeCloseTo(-backward.x, 10);
    expect(forward.y).toBeCloseTo(-backward.y, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* Numerical robustness                                                       */
/* -------------------------------------------------------------------------- */

describe("rotateByInverse — numerical behavior", () => {
  it("is stable across many compositions", () => {
    const q = axisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 1000);

    let v: Vec3 = { x: 1, y: 0, z: 0 };
    for (let i = 0; i < 1000; i++) {
      v = rotateByInverse(v, q);
    }

    expect(magnitude(v)).toBeCloseTo(1, 8);
  });

  it("preserves magnitude under the identity quaternion", () => {
    const q: QuaternionTuple = [0, 0, 0, 1];
    const v: Vec3 = { x: 0.1, y: 0.2, z: 0.3 };

    const rotated = rotateByInverse(v, q);

    expect(magnitude(rotated)).toBeCloseTo(magnitude(v), 10);
  });

  it("handles a quaternion with negative w (double cover)", () => {
    /*
     * `[x, y, z, w]` and `[-x, -y, -z, -w]` represent the
     * same rotation. The function must produce the same
     * output for both. This is a load-bearing property —
     * three.js can hand back either form.
     */
    const q: QuaternionTuple = axisAngle(
      { x: 0, y: 0, z: 1 },
      Math.PI / 3,
    );
    const qNeg: QuaternionTuple = [-q[0], -q[1], -q[2], -q[3]];

    const v: Vec3 = { x: 1, y: 2, z: 3 };

    expectVec3Close(
      rotateByInverse(v, q),
      rotateByInverse(v, qNeg),
    );
  });

  it("handles very small rotation angles without NaN", () => {
    const q = axisAngle({ x: 1, y: 0, z: 0 }, 1e-10);
    const v: Vec3 = { x: 1, y: 2, z: 3 };

    const rotated = rotateByInverse(v, q);

    expect(Number.isNaN(rotated.x)).toBe(false);
    expect(Number.isNaN(rotated.y)).toBe(false);
    expect(Number.isNaN(rotated.z)).toBe(false);
    expectVec3Close(rotated, v, 6);
  });
});

/* -------------------------------------------------------------------------- */
/* Dev-mode non-unit warning                                                  */
/* -------------------------------------------------------------------------- */

describe("rotateByInverse — dev-mode non-unit guard", () => {
  it("warns when the quaternion is not unit-length", () => {
    /*
     * The guard is gated on `NODE_ENV !== "production"`,
     * which is true under Vitest. The logger's own level
     * policy may suppress the actual console call — we spy
     * on `logWarn` directly, which is called before the
     * logger's level check.
     */
    const warn = vi
      .spyOn(logger, "logWarn")
      .mockImplementation(() => {});

    /*
     * Doubling every component gives |q|² === 4, well
     * outside the epsilon.
     */
    const nonUnit: QuaternionTuple = [0, 0, 0, 2];

    rotateByInverse({ x: 1, y: 0, z: 0 }, nonUnit);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("non-unit");
  });

  it("does not warn for a unit quaternion", () => {
    const warn = vi
      .spyOn(logger, "logWarn")
      .mockImplementation(() => {});

    const q = axisAngle({ x: 1, y: 2, z: 3 }, 1.1);

    rotateByInverse({ x: 1, y: 0, z: 0 }, q);

    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn for the identity quaternion", () => {
    const warn = vi
      .spyOn(logger, "logWarn")
      .mockImplementation(() => {});

    rotateByInverse({ x: 1, y: 2, z: 3 }, IDENTITY);

    expect(warn).not.toHaveBeenCalled();
  });

  it("still returns a result when the guard fires", () => {
    /*
     * The guard warns but must not throw or return early.
     * A dev-mode mistake should be visible, not fatal.
     */
    vi.spyOn(logger, "logWarn").mockImplementation(() => {});

    const nonUnit: QuaternionTuple = [0, 0, 0, 2];

    const result = rotateByInverse({ x: 1, y: 2, z: 3 }, nonUnit);

    expect(result).toBeDefined();
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });

  /*
   * ## Memo behavior
   *
   * The fix to `lib/quaternion.ts` changed the warning from
   * "fires on every non-unit call" to "fires once per
   * distinct magnitude." The two tests below pin that
   * contract. They are the reason `afterEach` calls
   * `__resetQuaternionFailureLog` — without the reset, the
   * second test in the block would see zero warnings
   * because the first test had already memoized the
   * magnitude.
   */

  it("warns only once for repeated calls with the same magnitude", () => {
    const warn = vi
      .spyOn(logger, "logWarn")
      .mockImplementation(() => {});

    const nonUnit: QuaternionTuple = [0, 0, 0, 2];

    rotateByInverse({ x: 1, y: 0, z: 0 }, nonUnit);
    rotateByInverse({ x: 0, y: 1, z: 0 }, nonUnit);
    rotateByInverse({ x: 0, y: 0, z: 1 }, nonUnit);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns separately for two distinct magnitudes", () => {
    const warn = vi
      .spyOn(logger, "logWarn")
      .mockImplementation(() => {});

    /* |q|² === 4 */
    rotateByInverse({ x: 1, y: 0, z: 0 }, [0, 0, 0, 2]);

    /* |q|² === 9 */
    rotateByInverse({ x: 1, y: 0, z: 0 }, [0, 0, 0, 3]);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not warn for a very slightly non-unit quaternion within tolerance", () => {
    /*
     * A quaternion produced by composing many unit
     * quaternions can drift slightly off unit length. The
     * guard's epsilon is `1e-3` on |q|², so a drift of
     * `1e-7` on each component should pass without a
     * warning. This test exists so a future tightening of
     * the epsilon is a deliberate choice, not a silent
     * regression that spams the console with warnings for
     * benign drift.
     */
    const warn = vi
      .spyOn(logger, "logWarn")
      .mockImplementation(() => {});

    const nearlyUnit: QuaternionTuple = [
      1e-7,
      1e-7,
      1e-7,
      1,
    ];

    rotateByInverse({ x: 1, y: 0, z: 0 }, nearlyUnit);

    expect(warn).not.toHaveBeenCalled();
  });
});