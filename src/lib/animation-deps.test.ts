import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getAnimationDeps,
  resetAnimationDeps,
  setAnimationDeps,
} from "@/lib/animation-deps";

/*
 * The module maintains a module-level singleton that any test
 * can mutate. Every test below that calls `setAnimationDeps`
 * must restore the production values afterward, or the next
 * test file that imports the module will see a fake.
 */
afterEach(() => {
  resetAnimationDeps();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* getAnimationDeps                                                           */
/* -------------------------------------------------------------------------- */

describe("getAnimationDeps", () => {
  it("returns the production primitives by default", () => {
    const deps = getAnimationDeps();

    expect(deps.now).toBeTypeOf("function");
    expect(deps.requestAnimationFrame).toBeTypeOf("function");
    expect(deps.cancelAnimationFrame).toBeTypeOf("function");
  });

  it("returns a live reference — subsequent sets are reflected", () => {
    const fakeNow = vi.fn(() => 1234);

    setAnimationDeps({ now: fakeNow });

    expect(getAnimationDeps().now).toBe(fakeNow);
  });

  it("returns the same object identity across calls when unchanged", () => {
    /*
     * Callers depend on this: `getAnimationDeps()` is called
     * once and the result is held for the duration of an
     * animation. If the identity changed on every call,
     * consumers would need to re-read it every frame.
     */
    const first = getAnimationDeps();
    const second = getAnimationDeps();

    expect(first).toBe(second);
  });

  it("returns the same object identity across calls after a set", () => {
    setAnimationDeps({ now: vi.fn() });

    expect(getAnimationDeps()).toBe(getAnimationDeps());
  });
});

/* -------------------------------------------------------------------------- */
/* setAnimationDeps                                                           */
/* -------------------------------------------------------------------------- */

describe("setAnimationDeps", () => {
  it("replaces the specified primitive", () => {
    const fakeNow = vi.fn(() => 500);

    setAnimationDeps({ now: fakeNow });

    expect(getAnimationDeps().now()).toBe(500);
  });

  it("leaves unspecified primitives at their production values", () => {
    const productionRaf = getAnimationDeps().requestAnimationFrame;

    setAnimationDeps({ now: vi.fn() });

    /*
     * `requestAnimationFrame` was not mentioned in the patch,
     * so it should still be the function that was captured
     * when the module first loaded.
     */
    expect(getAnimationDeps().requestAnimationFrame).toBe(
      productionRaf,
    );
  });

  it("applies successive patches cumulatively against production", () => {
    /*
     * Each call to `setAnimationDeps` rebuilds the object
     * from `productionDeps` plus the new patch. It does not
     * merge against the previous `deps`, so a second patch
     * that omits a key will reset that key to production.
     */
    const fakeNow = vi.fn(() => 100);
    const fakeRaf = vi.fn(() => 1);

    setAnimationDeps({ now: fakeNow });
    setAnimationDeps({ requestAnimationFrame: fakeRaf });

    const deps = getAnimationDeps();

    expect(deps.requestAnimationFrame).toBe(fakeRaf);

    /*
     * `now` was reset back to production because the second
     * call did not include it. This is intentional: the
     * alternative — cumulative merging — would make fakes
     * persist across test cases in ways that are hard to
     * reason about.
     */
    expect(deps.now).not.toBe(fakeNow);
  });

  it("accepts an empty patch without error", () => {
    setAnimationDeps({});

    expect(getAnimationDeps().now).toBeTypeOf("function");
  });

  it("creates a new deps object identity on each set", () => {
    const before = getAnimationDeps();

    setAnimationDeps({ now: vi.fn() });

    expect(getAnimationDeps()).not.toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* resetAnimationDeps                                                         */
/* -------------------------------------------------------------------------- */

describe("resetAnimationDeps", () => {
  it("restores all primitives to production values", () => {
    const productionRaf =
      getAnimationDeps().requestAnimationFrame;
    const productionCaf =
      getAnimationDeps().cancelAnimationFrame;
    const productionNow = getAnimationDeps().now;

    setAnimationDeps({
      requestAnimationFrame: vi.fn(),
      cancelAnimationFrame: vi.fn(),
      now: vi.fn(),
    });

    resetAnimationDeps();

    const deps = getAnimationDeps();

    expect(deps.requestAnimationFrame).toBe(productionRaf);
    expect(deps.cancelAnimationFrame).toBe(productionCaf);
    expect(deps.now).toBe(productionNow);
  });

  it("is idempotent — calling twice is safe", () => {
    resetAnimationDeps();
    resetAnimationDeps();

    expect(getAnimationDeps().now).toBeTypeOf("function");
  });

  it("restores the exact production reference after any set", () => {
    /*
     * `resetAnimationDeps` assigns `deps = productionDeps`.
     * Two resets in a row — with a set in between — must
     * produce the same reference both times.
     */
    resetAnimationDeps();
    const first = getAnimationDeps();

    setAnimationDeps({ now: vi.fn() });
    resetAnimationDeps();
    const second = getAnimationDeps();

    expect(first).toBe(second);
  });
});

/* -------------------------------------------------------------------------- */
/* Integration with requestAnimationFrame                                     */
/* -------------------------------------------------------------------------- */

describe("deps integration", () => {
  it("routes requestAnimationFrame through the current deps", () => {
    const handle = 42;
    const fakeRaf = vi.fn(() => handle);

    setAnimationDeps({
      requestAnimationFrame: fakeRaf,
    });

    const callback = vi.fn();
    const result =
      getAnimationDeps().requestAnimationFrame(callback);

    expect(fakeRaf).toHaveBeenCalledTimes(1);
    expect(fakeRaf).toHaveBeenCalledWith(callback);
    expect(result).toBe(handle);
  });

  it("routes cancelAnimationFrame through the current deps", () => {
    const fakeCaf = vi.fn();

    setAnimationDeps({
      cancelAnimationFrame: fakeCaf,
    });

    getAnimationDeps().cancelAnimationFrame(7);

    expect(fakeCaf).toHaveBeenCalledWith(7);
  });

  it("routes now through the current deps", () => {
    const fakeNow = vi.fn(() => 99);

    setAnimationDeps({ now: fakeNow });

    expect(getAnimationDeps().now()).toBe(99);
    expect(fakeNow).toHaveBeenCalledTimes(1);
  });

  it("all three primitives can be replaced in one call", () => {
    const fakeRaf = vi.fn(() => 1);
    const fakeCaf = vi.fn();
    const fakeNow = vi.fn(() => 100);

    setAnimationDeps({
      requestAnimationFrame: fakeRaf,
      cancelAnimationFrame: fakeCaf,
      now: fakeNow,
    });

    const deps = getAnimationDeps();

    expect(deps.requestAnimationFrame).toBe(fakeRaf);
    expect(deps.cancelAnimationFrame).toBe(fakeCaf);
    expect(deps.now).toBe(fakeNow);
  });
});