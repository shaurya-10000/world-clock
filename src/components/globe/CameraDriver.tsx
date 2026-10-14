"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * Moves the camera to `(0, 0, distance)` whenever `distance`
 * changes.
 *
 * Renders nothing. Lives inside the canvas so it has access to
 * the R3F camera via `useThree`.
 *
 * ## Why an effect, not a render-time mutation
 *
 * R3F owns the camera object. Direct mutation from a parent
 * component's render — even a "safe" one, like setting a number
 * that only the camera reads — would race with R3F's own
 * reconciliation. Doing the write inside an effect, which runs
 * after React has committed and after R3F has updated its own
 * state, is the correct place.
 *
 * The specific hazard: R3F's reconciler commits its own
 * camera-state updates during its render pass. A render-time
 * mutation from a parent could be overwritten in the same
 * frame by the reconciler, producing a camera that jumps back
 * to the previous distance on the next frame. An effect runs
 * after that pass has finished, so the write is the last
 * thing to touch the camera's position for this commit.
 *
 * ## Why `setLength` instead of `position.z = distance`
 *
 * The globe-spin interaction model keeps the camera on the
 * equator plane at `(0, 0, distance)`. `setLength(distance)`
 * preserves whatever direction the camera is already pointing
 * in and only adjusts its distance from the origin. If a future
 * change ever lets the camera tilt off the equator plane,
 * `setLength` still produces the correct behavior — it scales
 * the existing position vector, which is what a "move closer"
 * command means in any camera orientation. Setting `.z`
 * directly would collapse the camera back onto the Z axis,
 * which is a different (and usually wrong) operation.
 *
 * If the interaction model ever becomes true camera-orbit, this
 * file must be revisited — an orbit model changes the camera's
 * direction as well as its distance, and `setLength` alone no
 * longer expresses the intent.
 *
 * ## Why `updateProjectionMatrix` is not required
 *
 * `updateProjectionMatrix()` recomputes the camera's projection
 * matrix from its intrinsics (`fov`, `aspect`, `near`, `far`).
 * Repositioning the camera does not change any of those, so the
 * projection matrix does not actually change. Three.js also
 * recomputes the **view** matrix automatically from
 * `camera.matrixWorld` on every render, so a position write is
 * picked up without any explicit matrix update.
 *
 * The call is retained anyway — it is a no-op in this path, and
 * some three.js consumers find its presence reassuring. A
 * future refactor that removes it will not break anything.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <CameraDriver distance={3.6} />
 * </Canvas>
 * ```
 */
export default function CameraDriver({
  distance,
}: {
  readonly distance: number;
}) {
  const { camera } = useThree();

  useEffect(() => {
    const length = camera.position.length();

    if (length === 0) {
      /*
       * Degenerate case: the camera is at the origin.
       *
       * This should never happen — the initial position is
       * `(0, 0, d)` with `d > 0` — but a zero-length position
       * vector cannot be scaled by `setLength`, and
       * `setLength(0)` would leave the camera at the origin.
       * That places it inside the globe's center, where any
       * downstream code that normalizes the camera-to-target
       * direction would divide by zero.
       *
       * The explicit `set` puts the camera at a valid
       * `(0, 0, distance)` position without ever attempting
       * to scale a zero vector. The guard costs nothing on
       * the normal path.
       */
      camera.position.set(0, 0, distance);
      return;
    }

    camera.position.setLength(distance);
    camera.updateProjectionMatrix();
  }, [camera, distance]);

  return null;
}