"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";

import { cameraDistanceRef } from "./cameraDistanceContext";

/**
 * Writes the camera's current distance from the globe center
 * to `cameraDistanceRef` on every frame.
 *
 * Renders nothing. Mounted inside the R3F scene, next to
 * `SolarSampler`, so it has access to the camera via
 * `useThree`.
 *
 * ## Why a component and not a hook called from `GlobeScene`
 *
 * `GlobeScene` already runs one `useFrame` callback for the
 * travel animation and another for its own state management.
 * Folding a third concern into those callbacks couples the
 * camera-distance write to logic that has nothing to do with
 * it.
 *
 * More importantly, the coupling is a correctness hazard.
 * `GlobeScene`'s travel callback early-returns when there is
 * no active travel and can throw if the animation state is
 * malformed. Any code that runs *after* that early-return or
 * throw would be skipped — silently breaking
 * `cameraDistanceRef` while the rest of the app looks fine.
 * A dedicated component has no upstream logic to be skipped
 * by.
 *
 * A mounted-once, single-purpose component is also trivially
 * removable: delete the tag and the entire camera-distance
 * publish pipeline is gone, with no other file to edit.
 *
 * ## Why the write is unconditional (no threshold check)
 *
 * The value it writes is a plain `number` on a module-level
 * object. A JS assignment is nanoseconds. Gating it on "has
 * the value changed by more than X" would add a comparison
 * and a branch, both of which cost more than the write they
 * would skip. This is the one place in the codebase where
 * the naive implementation is also the correct one.
 *
 * ## The `cameraRef` bridge
 *
 * The frame callback is registered once, on mount. If it
 * closed over `camera` directly, a later re-render that
 * produced a new camera object would be invisible to the
 * frame loop — the callback would keep reading the camera
 * from its original render.
 *
 * In practice, three.js's camera object identity is stable
 * for the component's lifetime, so the hazard does not fire
 * today. The ref exists anyway because it eliminates the
 * class of bug: hot reload, HMR, or a future three-globe
 * upgrade that rebuilds the camera would silently break the
 * distance publish without a runtime error. With the ref,
 * the effect below updates the reference on every render
 * and the frame callback always reads the current object.
 *
 * This mirrors the same ref-bridge pattern used in
 * `EarthSphere.tsx` for its opacity fade.
 *
 * ## The distance is measured from the world origin
 *
 * The globe group is not translated, so the world origin is
 * also the globe's center. If a future change ever moves the
 * group, this file must be updated to measure against the
 * group's world position instead.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <GlobeScene ... />
 *   <CameraDistanceSampler />
 * </Canvas>
 * ```
 */
export default function CameraDistanceSampler() {
  const { camera } = useThree();

  const cameraRef = useRef(camera);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  /*
   * The frame callback is memoized with an empty dependency
   * array.
   *
   * The callback reads `cameraRef.current`, which is a stable
   * ref — so the closure itself has no dependencies and can
   * safely be created once. R3F keys its internal subscription
   * on callback identity, so memoizing eliminates a
   * re-subscription on every parent re-render and prevents
   * the dev-mode stability warning in `useFrameAdapter`.
   */
  const writeDistance = useCallback(() => {
    /*
     * `position.length()` is the distance from the world
     * origin. The globe group is not translated, so this is
     * also the distance from the globe's center.
     */
    cameraDistanceRef.current = cameraRef.current.position.length();
  }, []);

  useFrame(writeDistance);

  return null;
}