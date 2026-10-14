import { describe, expect, it } from "vitest";

import { computeIndicatorOffset } from "@/components/clock/ControlBar";

/* -------------------------------------------------------------------------- */
/* First-option position                                                      */
/* -------------------------------------------------------------------------- */

describe("computeIndicatorOffset — first position", () => {
  it("returns 0% for the first option", () => {
    expect(computeIndicatorOffset(0)).toBe("0%");
  });

  it("returns 0% for a negative index", () => {
    /*
     * `findIndex` returns -1 when the active value is not in
     * the options list — e.g. when the parent passed a
     * `mode` value that does not appear in `MODE_OPTIONS`.
     * Treating that as "first option" is the safe fallback:
     * the indicator sits on the first button rather than
     * disappearing.
     */
    expect(computeIndicatorOffset(-1)).toBe("0%");
  });

  it("returns 0% for any negative index", () => {
    expect(computeIndicatorOffset(-2)).toBe("0%");
    expect(computeIndicatorOffset(-100)).toBe("0%");
  });
});

/* -------------------------------------------------------------------------- */
/* Second-option position                                                     */
/* -------------------------------------------------------------------------- */

describe("computeIndicatorOffset — second position", () => {
  it("returns the offset expression for the second option", () => {
    expect(computeIndicatorOffset(1)).toBe("calc(100% + 2px)");
  });

  it("returns the offset expression for any index above zero", () => {
    /*
     * The control is defined for exactly two options, but
     * the function should not misbehave if a future variant
     * uses more — indices above zero all map to the same
     * expression because the indicator is a fixed half-width
     * that has only two valid resting positions.
     */
    expect(computeIndicatorOffset(2)).toBe("calc(100% + 2px)");
    expect(computeIndicatorOffset(5)).toBe("calc(100% + 2px)");
    expect(computeIndicatorOffset(100)).toBe("calc(100% + 2px)");
  });
});

/* -------------------------------------------------------------------------- */
/* Boundaries                                                                 */
/* -------------------------------------------------------------------------- */

describe("computeIndicatorOffset — boundaries", () => {
  it("uses `<= 0` — index 0 and negative indices share the first position", () => {
    /*
     * The comparison is `<= 0`, not `< 0`. Index 0 is the
     * first option; a negative index is the fallback. Both
     * resolve to the same offset. A refactor to `< 0` would
     * regress index 0 to the second position.
     */
    expect(computeIndicatorOffset(0)).toBe(
      computeIndicatorOffset(-1),
    );
  });

  it("uses `<= 0` — index 1 is the first value that moves the indicator", () => {
    expect(computeIndicatorOffset(0)).not.toBe(
      computeIndicatorOffset(1),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Return type                                                                */
/* -------------------------------------------------------------------------- */

describe("computeIndicatorOffset — return type", () => {
  it("returns only the two documented literals", () => {
    /*
     * The function's return type is a literal union of two
     * strings. This test asserts that no third value leaks
     * out — a future refactor that returned a computed
     * string based on the index would fail here.
     */
    const valid = new Set(["0%", "calc(100% + 2px)"]);

    for (const index of [-100, -1, 0, 1, 2, 5, 100]) {
      expect(valid.has(computeIndicatorOffset(index))).toBe(true);
    }
  });

  it("is deterministic — same input, same output", () => {
    for (const index of [-1, 0, 1, 2]) {
      expect(computeIndicatorOffset(index)).toBe(
        computeIndicatorOffset(index),
      );
    }
  });
});