import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  AUTO_ROTATE_RESUME_DELAY_MS,
  AUTO_ROTATE_SPEED,
  DRAG_SENSITIVITY,
  MOMENTUM_DECAY_PER_SECOND,
  MOMENTUM_MIN_VELOCITY,
  NORTH_RESET_DURATION,
  WHEEL_STEP_DELTA,
} from "@/components/globe/constants";

/*
 * ## Why this file has no imports from GlobeControls itself
 *
 * `GlobeControls.tsx` exports a single React component plus a
 * type. It has no pure helpers to unit test in isolation —
 * every piece of logic lives inside the frame callback, the
 * pointer handlers, or the imperative handle, all of which
 * need the R3F adapter seam to run.
 *
 * The interesting invariants here are the constants the
 * component depends on: the momentum decay factor, the drag
 * sensitivity, the auto-rotate threshold, and so on. Those are
 * shared with `Globe.tsx` and would be easy to mistune without
 * noticing.
 *
 * The remaining behaviors — pointer capture, velocity
 * estimation, and the frame loop's four modes — are covered by
 * `GlobeControls.component.test.tsx` and
 * `GlobeControls.integration.test.tsx`.
 */

describe("GlobeControls — drag sensitivity", () => {
  it("uses a positive sensitivity", () => {
    expect(DRAG_SENSITIVITY).toBeGreaterThan(0);
  });

  it("uses a sensitivity small enough that a full-width drag is under one full turn", () => {
    /*
     * A full-width drag on a typical desktop is roughly 900
     * pixels. At `DRAG_SENSITIVITY` radians per pixel, that
     * drag produces `900 * DRAG_SENSITIVITY` radians of
     * rotation. The interaction model is tuned so that a
     * full-width drag is roughly half a turn (`Math.PI`
     * radians), which is what makes the globe feel like a
     * physical object being pulled.
     *
     * The upper bound guards against a sensitivity so large
     * that a small drag would spin the globe multiple turns.
     */
    const fullWidthDragRadians = 900 * DRAG_SENSITIVITY;
    expect(fullWidthDragRadians).toBeLessThan(2 * Math.PI);
    expect(fullWidthDragRadians).toBeGreaterThan(Math.PI / 4);
  });
});

describe("GlobeControls — momentum", () => {
  it("uses a decay factor between 0 and 1", () => {
    /*
     * `MOMENTUM_DECAY_PER_SECOND` is applied as
     * `velocity *= decay^dt`. A decay of 0 would kill momentum
     * instantly (no glide); a decay of 1 would never decay
     * (infinite glide). Both extremes are wrong, so the test
     * pins the interval.
     */
    expect(MOMENTUM_DECAY_PER_SECOND).toBeGreaterThan(0);
    expect(MOMENTUM_DECAY_PER_SECOND).toBeLessThan(1);
  });

  it("decays velocity to a small fraction after one second", () => {
    /*
     * The component is tuned so momentum is a short, tactile
     * glide rather than a slow drift. After one second the
     * velocity should be a tiny fraction of its release value.
     */
    expect(MOMENTUM_DECAY_PER_SECOND).toBeLessThan(0.1);
  });

  it("uses a positive minimum velocity threshold", () => {
    /*
     * The threshold is what stops the frame loop after a
     * momentum tail. A zero threshold would let the asymptotic
     * decay run forever at an imperceptible rate; a negative
     * threshold would be a bug.
     */
    expect(MOMENTUM_MIN_VELOCITY).toBeGreaterThan(0);
  });

  it("uses a minimum velocity small enough to be imperceptible", () => {
    /*
     * `MOMENTUM_MIN_VELOCITY` is in radians per second. A
     * threshold above ~0.05 rad/s would be visible as a
     * sudden stop; the component is tuned below that.
     */
    expect(MOMENTUM_MIN_VELOCITY).toBeLessThan(0.05);
  });
});

describe("GlobeControls — auto-rotate", () => {
  it("uses a positive auto-rotate speed", () => {
    expect(AUTO_ROTATE_SPEED).toBeGreaterThan(0);
  });

  it("auto-rotates slowly enough to feel like an idle drift", () => {
    /*
     * A speed of π/8 rad/s would rotate the globe once every
     * 16 seconds, which is the boundary of "distracting". The
     * component is tuned well under that.
     */
    expect(AUTO_ROTATE_SPEED).toBeLessThan(Math.PI / 8);
  });

  it("uses a resume delay of at least a second", () => {
    /*
     * The delay is what stops auto-rotate from fighting the
     * user during brief pauses between drags. A sub-second
     * delay would feel twitchy.
     */
    expect(AUTO_ROTATE_RESUME_DELAY_MS).toBeGreaterThanOrEqual(1000);
  });

  it("uses a resume delay short enough to feel responsive", () => {
    /*
     * A delay longer than ~10 seconds would make the globe
     * feel asleep between interactions.
     */
    expect(AUTO_ROTATE_RESUME_DELAY_MS).toBeLessThan(10_000);
  });
});

describe("GlobeControls — wheel zoom", () => {
  it("uses a positive wheel step threshold", () => {
    expect(WHEEL_STEP_DELTA).toBeGreaterThan(0);
  });

  it("uses a threshold high enough to filter trackpad inertia", () => {
    /*
     * Browsers report `WheelEvent.deltaY` in different units
     * depending on the input device and OS. The threshold must
     * be above the typical jitter of a trackpad's inertial
     * tail — a value under 10 would rack up unintended zoom
     * steps.
     */
    expect(WHEEL_STEP_DELTA).toBeGreaterThanOrEqual(10);
  });

  it("uses a threshold low enough that a deliberate scroll still registers", () => {
    /*
     * A mouse wheel notch typically reports `deltaY` of 100
     * (Chrome/Firefox on desktop) or 120 (some other
     * browsers). The threshold must be well below that so a
     * single notch is unambiguously one step.
     */
    expect(WHEEL_STEP_DELTA).toBeLessThanOrEqual(100);
  });
});

describe("GlobeControls — reset north", () => {
  it("uses a positive reset duration", () => {
    expect(NORTH_RESET_DURATION).toBeGreaterThan(0);
  });

  it("uses a reset duration short enough to feel snappy", () => {
    /*
     * A reset animation longer than a second feels like a
     * travel; shorter than 200 ms feels instant. The component
     * is tuned in the middle.
     */
    expect(NORTH_RESET_DURATION).toBeGreaterThanOrEqual(200);
    expect(NORTH_RESET_DURATION).toBeLessThanOrEqual(1000);
  });
});

describe("GlobeControls — scratch objects", () => {
  it("can construct the scratch quaternions the frame loop reuses", () => {
    /*
     * The component uses module-scope scratch quaternions to
     * avoid allocating inside the frame loop. This test does
     * not access those module internals (they are not
     * exported); it only proves that constructing the objects
     * the component depends on is cheap and side-effect-free,
     * which is the invariant the scratch-object pattern
     * relies on.
     */
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
    expect(q.length()).toBeCloseTo(1, 6);
  });

  it("supports premultiply on a normalized quaternion without drift", () => {
    /*
     * The frame loop composes many `premultiply` calls in
     * sequence. Each call must leave the quaternion at unit
     * length — or `normalize()` must be called afterward,
     * which it is. This test pins the invariant.
     */
    const group = new THREE.Group();
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.1,
    );

    for (let i = 0; i < 100; i += 1) {
      group.quaternion.premultiply(yaw);
    }
    group.quaternion.normalize();

    expect(group.quaternion.length()).toBeCloseTo(1, 6);
  });
});