/**
 * Shared camera distance, bypassing React.
 *
 * The camera distance from the globe center is produced by
 * `CameraDistanceSampler` inside the R3F scene and consumed by
 * React components outside the scene (the arrival card, the
 * surface fade state if it needs to be surfaced as UI, any
 * future dashboard readouts).
 *
 * Routing that through React state would have two problems:
 *
 *   1. The value changes every frame. A `useState` write per
 *      frame is a React render per frame — the classic way to
 *      destroy an app's frame budget.
 *
 *   2. R3F's reconciler is a separate React root. Components
 *      mounted inside `<Canvas>` do not share context with
 *      components mounted outside it — a `<Provider>` on one
 *      side is invisible from the other, no matter where it
 *      is mounted. `useContext` cannot bridge the two trees.
 *
 * The solution is a module-level ref: a plain object that any
 * module can import and read or write, regardless of which
 * React tree (if any) it belongs to. The value is written
 * once per frame by a sampler and read on demand by
 * consumers.
 *
 * ## The value is not reactive
 *
 * There is no subscription mechanism. A consumer that needs
 * to *react* to a threshold crossing should poll it from
 * `useFrame` or `useNow`, not subscribe to it — the frame
 * loop and the shared ticker are already running, and a
 * per-frame poll costs nothing.
 *
 * A reactive version would need a pub/sub layer and would
 * give every subscriber a re-render per frame. That is
 * exactly the outcome the module is designed to avoid.
 *
 * ## Why a plain number, not a `THREE.Vector3`
 *
 * The ref holds a single `number`. Consumers that need more
 * (position, direction, camera quaternion) read them from the
 * live camera inside `useFrame` — the camera itself is the
 * source of truth for those. The ref exists only to solve the
 * cross-root communication problem for the one scalar that
 * crosses it.
 *
 * Values are plain numbers rather than `THREE.Vector3`, so
 * this module has no `three` dependency and can be imported
 * from anywhere — including tests and non-rendering code.
 */

import { INITIAL_CAMERA_DISTANCE } from "./constants";

/* -------------------------------------------------------------------------- */
/* The ref                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Current camera distance from the globe center, in world
 * units.
 *
 * Written by `CameraDistanceSampler` on every frame. Consumers
 * should treat the value as read-only.
 *
 * ## Why the initial value is `INITIAL_CAMERA_DISTANCE`
 *
 * The initial value mirrors the camera's starting distance so
 * a consumer that reads before the first frame has run gets a
 * value consistent with the rest of the scene rather than a
 * stale placeholder like `0`.
 *
 * The import from `./constants` is deliberate: an inline
 * `current: 3.6` would be shorter but would silently break if
 * `INITIAL_CAMERA_DISTANCE` were ever retuned. Importing makes
 * the two values share one source of truth — the constants
 * file — which is the correct place for a tunable.
 *
 * Do not replace the import with a literal "to avoid the
 * dependency." The dependency is exactly the point: a single
 * tunable should not be duplicated across files.
 *
 * ## The world-origin caveat
 *
 * This is the camera's distance from the world origin, which
 * is the globe's center as long as `GlobeScene` does not
 * translate the globe group. That invariant holds today. If a
 * future change ever moves the group, this ref (and the
 * sampler that writes it) must be updated to measure against
 * the group's world position instead.
 */
export const cameraDistanceRef: { current: number } = {
  current: INITIAL_CAMERA_DISTANCE,
};

/* -------------------------------------------------------------------------- */
/* Reader                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Read the current camera distance.
 *
 * Not a React hook — it is a plain function that reads a
 * module-level ref. Call it from inside a `useFrame` callback
 * or from any code that runs after the first frame has been
 * sampled.
 *
 * Returns a `number`, not a copy, because numbers are
 * primitives. There is no shared mutable state to hand out —
 * the caller receives a value, not a reference that could be
 * mutated.
 *
 * ## Why not a setter
 *
 * The value is written only by `CameraDistanceSampler`. A
 * public setter would invite other modules to write to the
 * ref, which would create a second writer and make the value
 * depend on evaluation order across the codebase. The
 * invariant "one writer, many readers" is what makes the
 * value predictable.
 */
export function getCameraDistance(): number {
  return cameraDistanceRef.current;
}

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reset the ref to its initial value.
 *
 * Test-only. A test that writes to `cameraDistanceRef` must
 * reset it in an `afterEach` so the next test file does not
 * see the fake value. Production code has no reason to call
 * this — the ref is written every frame by the sampler, which
 * immediately overwrites whatever the previous test left
 * behind, but the first frame has not run when a consumer
 * reads the ref on mount. Without the reset, a stale value
 * from an earlier test could be observed by a test that runs
 * before its own first frame.
 */
export function resetCameraDistance(): void {
  cameraDistanceRef.current = INITIAL_CAMERA_DISTANCE;
}