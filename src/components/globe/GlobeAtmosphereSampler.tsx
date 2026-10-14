"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import * as THREE from "three";

import { resolveFrameDate } from "@/components/globe/frameDate";

import { GLOBE_GROUP_NAME } from "./constants";
import {
  globeAtmosphereRef,
  lastSampleTimeRef,
  SAMPLE_INTERVAL_MS,
} from "./globeAtmosphereContext";
import { sampleGlobeAtmosphere } from "./globeAtmosphere";

/**
 * Samples the visible hemisphere's atmosphere every frame and
 * publishes the result to `globeAtmosphereRef`.
 *
 * Renders nothing. Lives inside the R3F scene so it can read
 * the live camera position and globe quaternion via `useThree`
 * and the scene graph.
 *
 * ## Write contract
 *
 * This component is the **only** writer of
 * `globeAtmosphereRef.current`. Every write is a real
 * `Atmosphere` value (`"dawn" | "day" | "dusk" | "night"`).
 * The ref is typed `Atmosphere | null` — the `null` case is
 * its initial value, meaning "no sample has been produced
 * yet" — but no code path in this file ever writes `null`:
 *
 *   - On a successful sample, the ref is set to the value
 *     returned by `sampleGlobeAtmosphere`.
 *   - On a skipped sample (throttled, or the globe group is
 *     missing), the ref is left as-is. If it was `null`, it
 *     stays `null`.
 *
 * Consumers outside the canvas (principally `Globe.tsx`) rely
 * on this: a `null` reading means "no data yet, fall back to
 * your own approximation", and a non-null reading means "this
 * is the sampled value, use it".
 *
 * ## Why R3F's real hooks, not the adapters
 *
 * This component is mounted as a sibling of `GlobeScene`,
 * outside `R3FAdaptersProvider`. It uses `useThree` and
 * `useFrame` from `@react-three/fiber` directly, matching
 * `CameraDriver` and `CameraDistanceSampler`. Those two are
 * infrastructure — they serve the scene, they don't need to
 * be test-injected — and this sampler is in the same category.
 *
 * ## Frame callback stability
 *
 * The callback passed to `useFrame` is memoized with
 * `useCallback([])`. It reads only refs and module-level
 * imports:
 *
 *   - `globeGroupRef` and `lastCameraPositionRef` — refs, stable.
 *   - `globeAtmosphereRef` and `lastSampleTimeRef` — module-level
 *     singletons, stable.
 *   - `SAMPLE_INTERVAL_MS`, `GLOBE_GROUP_NAME` — module constants.
 *   - `resolveFrameDate`, `sampleGlobeAtmosphere` — module
 *     functions.
 *
 * Nothing in the closure can change identity across renders,
 * so there is nothing to depend on. `[]` is correct.
 *
 * This matters because R3F keys its frame-loop subscription on
 * callback identity: an unstable callback causes R3F to
 * unsubscribe and resubscribe on every render. The `state`
 * argument is passed by R3F on each invocation, so
 * `state.clock.elapsedTime` inside the callback is always
 * fresh regardless of memoization.
 *
 * ## Rate
 *
 * The sample runs on a **250 ms throttle**, not every frame.
 *
 *   1. The atmosphere only changes at hour boundaries.
 *      Sampling at 60 Hz would compute the same answer 15
 *      times in a row.
 *   2. The `nearestCity` lookup is a linear scan over ~180
 *      cities × 9 samples = ~1,620 dot products per invocation.
 *      That's microseconds — fine at 4 Hz, wasteful at 60 Hz.
 *
 * A camera-movement bypass fires the sample immediately when
 * the user has dragged the globe more than a small threshold
 * since the last sample. Without it, the atmosphere would lag
 * visibly during a fast rotation.
 *
 * ## Why a ref, not React state
 *
 * The consumer is `Globe.tsx`, which sits outside the canvas.
 * Writing to React state here would require a context provider
 * that spans the R3F boundary, which doesn't work cleanly —
 * R3F's reconciler is a separate React root. A module-level
 * ref is the same pattern `solarContext` and
 * `cameraDistanceContext` already use.
 *
 * ## Time override
 *
 * The instant fed to `sampleGlobeAtmosphere` is resolved
 * through `resolveFrameDate()`, which reads the app-wide time
 * override when one is active and falls back to `Date.now()`
 * otherwise. This is what makes the globe section's
 * *background* respond to the picker — the terminator, the
 * sun glow, and the sampled atmosphere all agree on the same
 * instant, whatever that instant is.
 *
 * Cloud position and camera distance are deliberately **not**
 * affected by the override; those are real-time visuals, not
 * simulations of a moment.
 *
 * ## Why the globe group is looked up lazily
 *
 * A mount-time `getObjectByName` can miss the group if
 * `GlobeScene` mounts its children after this component.
 * Looking it up on the first frame — and caching the result —
 * is the safest pattern. If the group is genuinely never
 * present (a misconfigured tree), the lookup retries on every
 * frame, which is cheap: `getObjectByName` walks a small
 * scene graph.
 *
 * ## Why `lastCameraPositionRef` is a ref, not a plain value
 *
 * The camera position between two frames is the input to the
 * "has the camera moved enough" check. If it were a plain
 * value in the closure, the check would always compare against
 * the position from the render that created the callback, not
 * the last sample — the callback would never see a change.
 * A ref carries the value across frame boundaries without
 * re-subscribing the frame callback.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <GlobeScene />
 *   <GlobeAtmosphereSampler />
 * </Canvas>
 * ```
 */
export default function GlobeAtmosphereSampler() {
  const { camera, scene } = useThree();

  /*
   * The globe group, discovered once and cached. `null` until
   * the first successful lookup.
   */
  const globeGroupRef = useRef<THREE.Object3D | null>(null);

  /*
   * The camera position at the last successful sample, used to
   * detect "the user has dragged the globe significantly".
   * `null` means no sample has run yet — the first frame always
   * samples.
   */
  const lastCameraPositionRef = useRef<THREE.Vector3 | null>(null);

  /*
   * The frame callback. See the component header, "Frame
   * callback stability", for the reasoning behind
   * `useCallback([])`.
   */
  const onFrame = useCallback(
    (state: { clock: { elapsedTime: number } }) => {
      /*
       * Lazy lookup of the globe group. `getObjectByName` walks
       * the scene graph, which is cheap for a small scene but not
       * free. Cache the result after the first successful lookup.
       */
      if (!globeGroupRef.current) {
        globeGroupRef.current =
          scene.getObjectByName(GLOBE_GROUP_NAME) ?? null;
      }

      const globe = globeGroupRef.current;

      const now = state.clock.elapsedTime * 1000;
      const intervalElapsed =
        now - lastSampleTimeRef.current >= SAMPLE_INTERVAL_MS;

      /*
       * Camera-movement bypass. If the camera has moved more than
       * a small threshold since the last sample, force a fresh
       * sample regardless of the throttle. The threshold is in
       * world units — the camera sits at ~3.6 from the origin,
       * so 0.15 is roughly a 2–3° rotation of the view.
       */
      let cameraMoved = false;
      if (lastCameraPositionRef.current === null) {
        cameraMoved = true;
      } else {
        const dx =
          camera.position.x - lastCameraPositionRef.current.x;
        const dy =
          camera.position.y - lastCameraPositionRef.current.y;
        const dz =
          camera.position.z - lastCameraPositionRef.current.z;
        cameraMoved = Math.hypot(dx, dy, dz) >= 0.15;
      }

      if (!intervalElapsed && !cameraMoved) return;

      /*
       * If the globe group isn't found yet, we can still advance
       * the sampling clock (so the next valid frame doesn't get
       * throttled). We just don't publish a new atmosphere.
       */
      lastSampleTimeRef.current = now;

      if (!globe) return;

      /*
       * The instant to evaluate, resolved through the shared
       * frame-date seam so it reflects the app-wide override
       * when one is active. The same `Date` is used for every
       * sample in this invocation.
       */
      const date = resolveFrameDate();

      const atmosphere = sampleGlobeAtmosphere({
        cameraPosition: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        globeQuaternion: [
          globe.quaternion.x,
          globe.quaternion.y,
          globe.quaternion.z,
          globe.quaternion.w,
        ],
        date,
      });

      globeAtmosphereRef.current = atmosphere;

      /*
       * Cache the camera position for the next frame's movement
       * check. `copy` rather than assignment so we reuse the
       * same Vector3 instance across frames. `clone` on the
       * first sample allocates that instance once, then every
       * subsequent frame reuses it — no per-frame allocation.
       */
      if (lastCameraPositionRef.current === null) {
        lastCameraPositionRef.current = camera.position.clone();
      } else {
        lastCameraPositionRef.current.copy(camera.position);
      }
    },
    [camera, scene],
  );

  useFrame(onFrame);

  return null;
}