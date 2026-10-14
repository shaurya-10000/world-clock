import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  globeAtmosphereRef,
  lastSampleTimeRef,
  resetGlobeAtmosphereContext,
  SAMPLE_INTERVAL_MS,
} from "@/components/globe/globeAtmosphereContext";
import type { Atmosphere } from "@/lib/atmosphere";

/*
 * ## Scope
 *
 * This is a pure module — no React, no R3F, no THREE. The
 * entire surface is three mutable values and one reset
 * function. The tests here pin the default values, the
 * mutation contract, and the reset behavior. There is no
 * component or integration test for this file; the refs are
 * exercised through their consumers.
 */

beforeEach(() => {
  resetGlobeAtmosphereContext();
});

afterEach(() => {
  resetGlobeAtmosphereContext();
});

/* -------------------------------------------------------------------------- */
/* SAMPLE_INTERVAL_MS                                                         */
/* -------------------------------------------------------------------------- */

describe("SAMPLE_INTERVAL_MS", () => {
  it("is a positive number", () => {
    expect(SAMPLE_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("is an integer number of milliseconds", () => {
    /*
     * The sampler compares `now - lastSampleTimeRef.current >=
     * SAMPLE_INTERVAL_MS`. A fractional value would work but
     * would be an odd choice for a named throttle.
     */
    expect(Number.isInteger(SAMPLE_INTERVAL_MS)).toBe(true);
  });

  it("is short enough to feel responsive", () => {
    /*
     * A throttle over a second would produce a visible delay
     * between the user dragging the globe and the background
     * changing. The sampler is tuned well under that.
     */
    expect(SAMPLE_INTERVAL_MS).toBeLessThanOrEqual(1000);
  });

  it("is long enough to skip most frames", () => {
    /*
     * At 60 Hz, a frame is ~16.7 ms. The throttle should be
     * several frames' worth of time so the sampler is not
     * doing the `nearestCity` scan every frame.
     */
    expect(SAMPLE_INTERVAL_MS).toBeGreaterThanOrEqual(100);
  });
});

/* -------------------------------------------------------------------------- */
/* globeAtmosphereRef                                                         */
/* -------------------------------------------------------------------------- */

describe("globeAtmosphereRef", () => {
  it("initializes to null", () => {
    /*
     * `null` means "the sampler has not yet produced a value".
     * It is not the same as any particular atmosphere — a
     * consumer that reads `null` should fall back to its own
     * approximation (typically `solarState.dominantAtmosphere`)
     * rather than assume a default like `"night"`.
     *
     * An earlier version initialized to `"night"`, which
     * produced a spurious `"night"` publish on mount: a globe
     * loaded at noon would briefly flash a nighttime
     * background. See the module header for the full history.
     */
    expect(globeAtmosphereRef.current).toBeNull();
  });

  it("accepts every member of the Atmosphere union", () => {
    const values: Atmosphere[] = ["dawn", "day", "dusk", "night"];
    for (const value of values) {
      globeAtmosphereRef.current = value;
      expect(globeAtmosphereRef.current).toBe(value);
    }
  });

  it("accepts null as an explicit write", () => {
    /*
     * A consumer that wants to reset the ref to "no sample
     * yet" (e.g. a future scene-remount handler) can write
     * `null`. The type is `Atmosphere | null`, not just
     * `Atmosphere`, so this is legal.
     */
    globeAtmosphereRef.current = "day";
    globeAtmosphereRef.current = null;
    expect(globeAtmosphereRef.current).toBeNull();
  });

  it("can round-trip from a real value back to null", () => {
    /*
     * The nullable type is only useful if writing `null`
     * after a real value works. This is the transition a
     * scene-remount handler would perform.
     */
    globeAtmosphereRef.current = "dawn";
    globeAtmosphereRef.current = null;
    globeAtmosphereRef.current = "dusk";

    expect(globeAtmosphereRef.current).toBe("dusk");
  });

  it("has a mutable `current` field", () => {
    globeAtmosphereRef.current = "dusk";
    expect(globeAtmosphereRef.current).toBe("dusk");
  });

  it("holds a value whose type is null or one of the four atmospheres", () => {
    /*
     * The ref is a plain object with a `current` property. It
     * is not a `useRef` — reading `.current` from outside a
     * React render does not trigger a re-render, which is the
     * entire point of the module.
     */
    const valid: (Atmosphere | null)[] = [
      null,
      "dawn",
      "day",
      "dusk",
      "night",
    ];
    expect(valid).toContain(globeAtmosphereRef.current);
  });
});

/* -------------------------------------------------------------------------- */
/* lastSampleTimeRef                                                          */
/* -------------------------------------------------------------------------- */

describe("lastSampleTimeRef", () => {
  it("initializes to 0", () => {
    expect(lastSampleTimeRef.current).toBe(0);
  });

  it("has a mutable `current` field", () => {
    lastSampleTimeRef.current = 1234.5;
    expect(lastSampleTimeRef.current).toBe(1234.5);
  });

  it("accepts fractional millisecond values", () => {
    /*
     * The sampler multiplies `state.clock.elapsedTime` by 1000
     * to convert seconds to milliseconds. That conversion can
     * produce a fractional value if the clock's `elapsedTime`
     * is not an integer — which is common in practice.
     */
    lastSampleTimeRef.current = 0.016 * 1000;
    expect(lastSampleTimeRef.current).toBeCloseTo(16, 6);
  });

  it("accepts a large value without overflow", () => {
    lastSampleTimeRef.current = Number.MAX_SAFE_INTEGER;
    expect(lastSampleTimeRef.current).toBe(Number.MAX_SAFE_INTEGER);
  });
});

/* -------------------------------------------------------------------------- */
/* resetGlobeAtmosphereContext                                                */
/* -------------------------------------------------------------------------- */

describe("resetGlobeAtmosphereContext", () => {
  it("restores the atmosphere to null", () => {
    globeAtmosphereRef.current = "dawn";
    resetGlobeAtmosphereContext();
    expect(globeAtmosphereRef.current).toBeNull();
  });

  it("restores the sample time to 0", () => {
    lastSampleTimeRef.current = 9999;
    resetGlobeAtmosphereContext();
    expect(lastSampleTimeRef.current).toBe(0);
  });

  it("resets both refs in one call", () => {
    globeAtmosphereRef.current = "day";
    lastSampleTimeRef.current = 500;
    resetGlobeAtmosphereContext();

    expect(globeAtmosphereRef.current).toBeNull();
    expect(lastSampleTimeRef.current).toBe(0);
  });

  it("is idempotent", () => {
    resetGlobeAtmosphereContext();
    resetGlobeAtmosphereContext();
    resetGlobeAtmosphereContext();

    expect(globeAtmosphereRef.current).toBeNull();
    expect(lastSampleTimeRef.current).toBe(0);
  });

  it("does not replace the ref objects themselves", () => {
    /*
     * Consumers hold a reference to `globeAtmosphereRef` (the
     * object with `.current`), not to the value inside it. A
     * reset that replaced the object would break those
     * references. The reset mutates `.current` in place.
     */
    const beforeAtmosphere = globeAtmosphereRef;
    const beforeSampleTime = lastSampleTimeRef;

    resetGlobeAtmosphereContext();

    expect(globeAtmosphereRef).toBe(beforeAtmosphere);
    expect(lastSampleTimeRef).toBe(beforeSampleTime);
  });

  it("can be called before any consumer has written a value", () => {
    /* A fresh reset on already-initial state is a no-op. */
    expect(() => resetGlobeAtmosphereContext()).not.toThrow();
    expect(globeAtmosphereRef.current).toBeNull();
    expect(lastSampleTimeRef.current).toBe(0);
  });

  it("restores null even after a real value was written multiple times", () => {
    /*
     * Exercises the reset across several distinct states. Any
     * sequence of writes must terminate in `null`.
     */
    globeAtmosphereRef.current = "dawn";
    resetGlobeAtmosphereContext();

    globeAtmosphereRef.current = "day";
    globeAtmosphereRef.current = "dusk";
    resetGlobeAtmosphereContext();

    expect(globeAtmosphereRef.current).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Write contract                                                             */
/* -------------------------------------------------------------------------- */

/*
 * ## Why this block exists
 *
 * The ref is a module-level value with two writers-in-principle:
 *
 *   1. `GlobeAtmosphereSampler` writes a real `Atmosphere`
 *      every time it produces a sample.
 *
 *   2. Test code (and, hypothetically, a future
 *      scene-remount handler) can write `null` to signal
 *      "no sample yet".
 *
 * Consumers rely on the distinction between "sampled night"
 * and "no sample yet" — see `Globe.tsx`'s poller, which skips
 * the parent callback when the ref is `null`. The tests below
 * pin the two distinct states and their transitions.
 */

describe("globeAtmosphereContext — write contract", () => {
  it("distinguishes 'sampled night' from 'no sample yet'", () => {
    /*
     * The two states are different values. A consumer that
     * wants to know whether the sampler has run can check for
     * `null`; a consumer that wants the current atmosphere can
     * use the value directly.
     */
    globeAtmosphereRef.current = null;
    const noSampleYet = globeAtmosphereRef.current;

    globeAtmosphereRef.current = "night";
    const sampledNight = globeAtmosphereRef.current;

    expect(noSampleYet).toBeNull();
    expect(sampledNight).toBe("night");
    expect(noSampleYet).not.toBe(sampledNight);
  });

  it("starts in the 'no sample yet' state", () => {
    /*
     * A fresh module load — and a fresh reset — both begin at
     * `null`, not at any particular atmosphere. This is the
     * "no sample yet" state.
     */
    expect(globeAtmosphereRef.current).toBeNull();

    resetGlobeAtmosphereContext();

    expect(globeAtmosphereRef.current).toBeNull();
  });

  it("transitions from null to a real value and back", () => {
    /*
     * The full lifecycle a consumer might observe:
     *   no sample → sampled day → reset → no sample
     *   → sampled dusk
     *
     * Each step is a valid state transition and the ref
     * always holds a defined value.
     */
    expect(globeAtmosphereRef.current).toBeNull();

    globeAtmosphereRef.current = "day";
    expect(globeAtmosphereRef.current).toBe("day");

    resetGlobeAtmosphereContext();
    expect(globeAtmosphereRef.current).toBeNull();

    globeAtmosphereRef.current = "dusk";
    expect(globeAtmosphereRef.current).toBe("dusk");
  });
});

/* -------------------------------------------------------------------------- */
/* Independence of the two refs                                               */
/* -------------------------------------------------------------------------- */

describe("globeAtmosphereContext — ref independence", () => {
  it("the two refs do not share state", () => {
    /*
     * Writing one ref must not affect the other. This is
     * trivially true for two separate module exports, but the
     * assertion pins it against a future refactor that might
     * merge the two into a single object with two fields — a
     * change that would silently couple the atmosphere value
     * to the throttle.
     */
    globeAtmosphereRef.current = "dawn";
    expect(lastSampleTimeRef.current).toBe(0);

    lastSampleTimeRef.current = 500;
    expect(globeAtmosphereRef.current).toBe("dawn");
  });

  it("resetting one ref does not clear the other", () => {
    /*
     * `resetGlobeAtmosphereContext` resets both. But a future
     * helper that reset only one should not affect the other.
     * This is a documentation test: it pins the expectation
     * that the two refs are independent.
     */
    globeAtmosphereRef.current = "day";
    lastSampleTimeRef.current = 1000;

    /* Simulate resetting only the atmosphere. */
    globeAtmosphereRef.current = null;

    expect(globeAtmosphereRef.current).toBeNull();
    expect(lastSampleTimeRef.current).toBe(1000);
  });
});