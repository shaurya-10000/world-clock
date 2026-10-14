/**
 * Shared sun direction and globe orientation, bypassing React.
 *
 * ## Frame invariant — read this before changing anything
 *
 * `sunDirectionRef.current` is the subsolar unit vector in the
 * **geography frame**: +Y = north pole, +Z = prime meridian at
 * the equator, +X = 90°E. This is the frame the globe's
 * geometry and textures live in, i.e. the frame of the globe
 * group's LOCAL space at identity rotation.
 *
 * Consumers must compare it against a geography-frame (local)
 * normal — the raw `normal` attribute in a vertex shader. Do
 * NOT transform the normal with `modelMatrix`, and do NOT
 * pre-rotate the sun by the globe quaternion. Because the
 * mesh's local normal rotates with the globe group when the
 * user drags, the terminator stays attached to real geography
 * and tracks real time.
 *
 * Mixing frames (a world-space normal against this vector, or
 * a local normal against a pre-rotated sun) produces a
 * terminator that is fixed to the screen/camera instead of to
 * the geography.
 *
 * If you need the sun in world space (e.g. to position a
 * light that is NOT parented inside the globe group), rotate it
 * by the globe's world quaternion at the point of use. The
 * `globeWorldQuaternionRef` below exists for exactly that
 * purpose.
 *
 * ## Why refs, not React state or context
 *
 * Both values are written every frame by `SolarSampler` and
 * read on demand by consumers. React state would require a
 * state write per frame — a render per frame, which is the
 * classic way to destroy an app's frame budget. React context
 * would not work at all: R3F's reconciler is a separate React
 * root, so a context provider around the canvas cannot be
 * read from within, and a provider inside the canvas cannot
 * be read from outside. The module-level ref is the seam that
 * both trees can reach.
 *
 * The value is not reactive by design. Consumers that need to
 * react to a threshold crossing should poll it from
 * `useFrame`, not subscribe to it. The frame loop is already
 * running; a per-frame poll costs nothing.
 *
 * ## Why the readers return fresh objects
 *
 * `sunDirectionRef.current` is mutated in place — the same
 * object is written to every frame. Returning that object
 * directly from a reader would let a caller hold a reference
 * that changes under them mid-computation. `getSunDirectionInGlobeFrame`
 * returns a fresh `{ x, y, z }` so callers own their value.
 *
 * The quaternion ref is not written in place — it is
 * reassigned to a fresh tuple every frame. That is fine
 * because the readers destructure it immediately; it is
 * documented here so a future change does not "optimize" it
 * into a mutable array without also changing the contract.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A direction in the globe's geography frame.
 *
 * Deliberately not `readonly`: `sunDirectionRef` is mutated in
 * place by `SolarSampler` every frame. Readers should go through
 * `getSunDirectionInGlobeFrame()`, which returns a fresh copy.
 */
export interface SunDirection {
  x: number;
  y: number;
  z: number;
}

/**
 * A quaternion in `[x, y, z, w]` order.
 *
 * Matches `THREE.Quaternion`'s property order and the tuple
 * shape consumed by `lib/quaternion`.
 */
export type QuaternionTuple = readonly [
  number,
  number,
  number,
  number,
];

/* -------------------------------------------------------------------------- */
/* The refs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The current subsolar unit vector, in the globe's geography
 * frame (see header).
 *
 * Written by `SolarSampler` on every frame, straight from
 * `getSunDirection()` with no transform. Initialized to `+Z`
 * (prime meridian at the equator) so a read before the first
 * frame returns a defined, plausible value.
 *
 * **Mutated in place.** The object identity is stable across
 * frames; only the fields change. Consumers that want a
 * snapshot should call `getSunDirectionInGlobeFrame` rather
 * than holding a reference to `.current` directly.
 */
export const sunDirectionRef: { current: SunDirection } = {
  current: { x: 0, y: 0, z: 1 },
};

/**
 * The globe group's quaternion, updated every frame.
 *
 * Published for consumers that need the globe's orientation
 * without walking the scene graph (e.g. to convert the sun to
 * world space for a light outside the globe group). The
 * geography-frame lighting shaders do NOT read this.
 *
 * **Reassigned every frame**, not mutated in place. The tuple
 * shape makes in-place mutation awkward and the reassignment
 * is cheap; a caller that wants a snapshot should destructure
 * the tuple into locals immediately.
 *
 * Initialized to the identity quaternion so a read before the
 * first frame returns a defined value.
 */
export const globeWorldQuaternionRef: { current: QuaternionTuple } = {
  current: [0, 0, 0, 1],
};

/* -------------------------------------------------------------------------- */
/* Readers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Read the current sun direction in the globe's geography frame.
 *
 * Returns a fresh object every call, so callers own the value
 * and cannot be surprised by a mid-frame mutation. The cost is
 * a single small object allocation; a caller that is calling
 * this at frame rate and wants to avoid the allocation can
 * read `sunDirectionRef.current` directly, with the caveat
 * that the reference will change under them on the next frame.
 *
 * Not a React hook — it is a plain function that reads a
 * module-level ref. Call it from inside a `useFrame` callback
 * or from any code that runs after the first frame has been
 * sampled.
 */
export function getSunDirectionInGlobeFrame(): SunDirection {
  const { x, y, z } = sunDirectionRef.current;
  return { x, y, z };
}

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reset both shared refs to their initial values.
 *
 * Test-only. A test that writes to either ref must reset them
 * in an `afterEach` so the next test file does not see the
 * fake value. Production code has no reason to call this —
 * both refs are written every frame by `SolarSampler`.
 */
export function resetSolarContext(): void {
  sunDirectionRef.current = { x: 0, y: 0, z: 1 };
  globeWorldQuaternionRef.current = [0, 0, 0, 1];
}