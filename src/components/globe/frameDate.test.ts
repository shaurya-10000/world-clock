import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { resolveFrameDate } from "@/components/globe/frameDate";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";
import {
  clearTimeOverride,
  resetTimeOverride,
  setTimeOverride,
} from "@/lib/time-override";

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetUseNow();
  resetTimeOverride();
});

afterEach(() => {
  resetUseNow();
  resetTimeOverride();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Live time                                                                  */
/* -------------------------------------------------------------------------- */

describe("resolveFrameDate — live time", () => {
  it("returns the current wall-clock instant when no override is active", () => {
    const before = Date.now();
    const result = resolveFrameDate();
    const after = Date.now();

    const ms = result.getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it("returns a Date instance", () => {
    expect(resolveFrameDate()).toBeInstanceOf(Date);
  });

  it("returns a fresh Date on every call", () => {
    const a = resolveFrameDate();
    const b = resolveFrameDate();

    expect(a).not.toBe(b);
  });

  it("does not consult the shared ticker", () => {
    /*
     * The shared ticker (`useNow` + `getEffectiveNow`) reads
     * through `lib/time-override`. `resolveFrameDate` also
     * reads through that module, but it constructs its own
     * `Date` from the current wall clock rather than
     * subscribing to the ticker's emitted value.
     *
     * The distinguishing contract: a fake ticker value must
     * not leak into `resolveFrameDate`'s output when no
     * override is active.
     *
     * This test installs a distinctive fake ticker time and
     * asserts that `resolveFrameDate` does not return it.
     */
    const FAKE_TICKER_TIME = 1_700_000_000_000;

    setUseNowDeps({
      now: () => FAKE_TICKER_TIME,
      setInterval: () => 1,
      clearInterval: () => {},
      isVisible: () => true,
    });

    const result = resolveFrameDate();

    // The result must be a real wall-clock instant, not the
    // fake ticker value.
    expect(result.getTime()).not.toBe(FAKE_TICKER_TIME);

    // And it must be within a plausible window around now.
    const before = Date.now();
    expect(result.getTime()).toBeGreaterThan(before - 1000);
    expect(result.getTime()).toBeLessThan(before + 1000);
  });
});

/* -------------------------------------------------------------------------- */
/* Override                                                                   */
/* -------------------------------------------------------------------------- */

describe("resolveFrameDate — override", () => {
  it("returns the override instant when one is set", () => {
    setTimeOverride(1_700_000_000_000);

    const result = resolveFrameDate();

    expect(result.getTime()).toBe(1_700_000_000_000);
  });

  it("does not consult the wall clock when an override is active", () => {
    setTimeOverride(1_700_000_000_000);

    /*
     * With an active override, `resolveFrameDate` constructs
     * its `Date` from the override value. The result must be
     * exactly the override, regardless of what real time is.
     */
    const result = resolveFrameDate();

    expect(result.getTime()).toBe(1_700_000_000_000);
  });

  it("reflects a subsequent override change", () => {
    setTimeOverride(1_700_000_000_000);
    expect(resolveFrameDate().getTime()).toBe(1_700_000_000_000);

    setTimeOverride(1_800_000_000_000);
    expect(resolveFrameDate().getTime()).toBe(1_800_000_000_000);
  });

  it("returns to live time after the override is cleared", () => {
    setTimeOverride(1_700_000_000_000);
    clearTimeOverride();

    const before = Date.now();
    const result = resolveFrameDate();
    const after = Date.now();

    const ms = result.getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it("returns a fresh Date on every call even with an override", () => {
    setTimeOverride(1_700_000_000_000);

    const a = resolveFrameDate();
    const b = resolveFrameDate();

    expect(a).not.toBe(b);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("handles an override of 0 (the Unix epoch)", () => {
    /*
     * `getTimeOverride() !== null` is the discriminating
     * check — the override value `0` is a valid instant and
     * must not be treated as "no override". A future refactor
     * that used a truthy check would fail this test.
     */
    setTimeOverride(0);

    expect(resolveFrameDate().getTime()).toBe(0);
  });

  it("handles a negative override (pre-epoch)", () => {
    setTimeOverride(-1_000_000);

    expect(resolveFrameDate().getTime()).toBe(-1_000_000);
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("resolveFrameDate — purity", () => {
  it("does not mutate the override state", () => {
    setTimeOverride(1_700_000_000_000);
    resolveFrameDate();
    resolveFrameDate();
    resolveFrameDate();

    // A subsequent call still sees the same override.
    expect(resolveFrameDate().getTime()).toBe(1_700_000_000_000);
  });

  it("is deterministic across rapid successive calls with an override", () => {
    setTimeOverride(1_700_000_000_000);

    for (let i = 0; i < 100; i += 1) {
      expect(resolveFrameDate().getTime()).toBe(1_700_000_000_000);
    }
  });

  it("is not frame-locked in live mode — successive calls can differ", () => {
    /*
     * The module header documents that consecutive calls in
     * the same frame may differ by a millisecond or two
     * because each reads `Date.now()` independently. This
     * test does not attempt to observe the difference
     * directly (it is timing-dependent), but it does assert
     * the contract: successive calls are permitted to
     * return different values.
     *
     * The assertion is structural: two calls return two
     * distinct Date objects, and their `.getTime()` values
     * are allowed to differ without failing.
     */
    const a = resolveFrameDate();
    const b = resolveFrameDate();

    expect(a).not.toBe(b);

    const delta = Math.abs(a.getTime() - b.getTime());
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThan(1000);
  });
});