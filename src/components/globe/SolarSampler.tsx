"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";

import {
  useFrameAdapter,
  useThreeAdapter,
} from "@/lib/r3f-adapters";
import { getSunDirection } from "@/lib/solar";
import {
  INITIAL_SAMPLING_STATE,
  sampleSolarState,
  type SamplingState,
} from "@/lib/solar-sampling";
import type { SolarState } from "@/lib/useSolarState";

import { GLOBE_GROUP_NAME } from "./constants";
import { resolveFrameDate } from "./frameDate";
import {
  globeWorldQuaternionRef,
  sunDirectionRef,
} from "./solarContext";

interface SolarSamplerProps {
  onChange: (state: SolarState) => void;
}

/**
 * Publishes the sun direction and the sampled solar state to
 * the shared refs, once per frame.
 *
 * Renders nothing. Lives inside the R3F scene so it can read
 * the live camera position and globe quaternion via
 * `useThreeAdapter` and the scene graph.
 *
 * ## What it publishes
 *
 * Two things, on every frame:
 *
 *   1. **`sunDirectionRef`** — the subsolar vector in the
 *      globe's geography frame, straight from
 *      `getSunDirection(date)`. Written unmodified; the
 *      lighting shader compares it against the mesh's LOCAL
 *      normal, so no rotation by the globe quaternion belongs
 *      here. See `solarContext.ts` for the full frame
 *      invariant — this is the single most important line in
 *      the file and reading it wrong produces a terminator
 *      that is fixed to the screen instead of the geography.
 *
 *   2. **`globeWorldQuaternionRef`** — the globe group's
 *      quaternion. Published so consumers that need the
 *      globe's orientation without walking the scene graph
 *      (e.g. converting the sun to world space for a light
 *      outside the group) have it available. Nothing in this
 *      file reads it.
 *
 * ## Frame callback stability
 *
 * The callback passed to `useFrameAdapter` is memoized with
 * `useCallback`. It reads:
 *
 *   - `onChangeRef`, `samplingStateRef`, `globeGroupRef` —
 *     refs, stable.
 *   - `camera`, `scene` — from `useThreeAdapter`, stable for
 *     the component's lifetime.
 *   - `sunDirectionRef`, `globeWorldQuaternionRef` — module
 *     singletons.
 *   - `resolveFrameDate`, `sampleSolarState`,
 *     `getSunDirection` — module imports.
 *   - `GLOBE_GROUP_NAME` — a module constant.
 *
 * Nothing in the closure can change identity across renders.
 * This matters because R3F keys its frame-loop subscription
 * on callback identity: an unstable callback causes R3F to
 * unsubscribe and resubscribe on every render.
 *
 * ## Why `onChangeRef` exists
 *
 * `onChange` is a prop and can change between renders — a
 * parent that passes a fresh arrow function every render
 * would otherwise force the frame callback to be re-created
 * (and R3F to resubscribe) on every parent render.
 *
 * The ref decouples the callback's identity from the prop's:
 * the callback is memoized once, and it reads the current
 * `onChange` through the ref at frame time. The effect below
 * keeps the ref in sync with the prop. Without this
 * indirection, the memoization would be defeated by any
 * parent that did not itself memoize its `onChange`.
 *
 * ## Time override
 *
 * `getSunDirection` and `sampleSolarState` both need a `Date`.
 * The instant is resolved through `resolveFrameDate()` — the
 * same helper `GlobeAtmosphereSampler` uses — so both samplers
 * agree on the exact same instant for a given frame. Without
 * that shared resolution, a frame that straddled a minute
 * boundary could produce a terminator and an atmosphere that
 * reflected two different moments.
 *
 * One `Date` is constructed per frame and reused for both
 * `getSunDirection` and `sampleSolarState`. Two reasons:
 *
 *   1. **Consistency.** Both calls see the exact same instant.
 *
 *   2. **Testability.** A single `Date` construction point is a
 *      single point of mocking. Test fakes can capture the
 *      instant passed in without having to intercept
 *      `Date.now()` globally.
 *
 * ## Lazy globe lookup
 *
 * The globe group is looked up by name (`GLOBE_GROUP_NAME`)
 * rather than by ref, because this component is mounted as a
 * sibling of `GlobeScene`, not as a child. A one-time lookup in
 * an effect would miss the group if `GlobeScene` mounts its
 * children after this component runs; looking it up on the
 * first frame — and caching the result — is safe against any
 * mount order. If the group is genuinely never present (a
 * misconfigured tree), the lookup retries on every frame, which
 * is cheap: `getObjectByName` walks a small scene graph.
 *
 * ## Adapter hooks, not R3F's own
 *
 * `useFrameAdapter` and `useThreeAdapter` come from
 * `lib/r3f-adapters`, not from `@react-three/fiber` directly.
 * That is deliberate: the adapters are the seam that lets the
 * test suite drive the frame loop and inject a fake camera and
 * scene without mounting a real `<Canvas>`. Every other
 * sampler in this directory uses the same seam, so switching to
 * R3F's own hooks here would be the odd one out.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <GlobeScene />
 *   <SolarSampler onChange={setSolarState} />
 * </Canvas>
 * ```
 */
export default function SolarSampler({ onChange }: SolarSamplerProps) {
  const { camera, scene } = useThreeAdapter();

  /*
   * Throttling state. Held in a ref so the frame callback sees
   * the current value without re-subscribing, and so the state
   * survives re-renders.
   */
  const samplingStateRef = useRef<SamplingState>(INITIAL_SAMPLING_STATE);

  /*
   * `onChange` is called from inside the frame loop, but the
   * prop may change between renders. Storing the latest value
   * in a ref means the frame callback never has to be
   * re-created (and therefore never has to be re-subscribed)
   * just because the parent re-rendered with a new callback
   * identity.
   *
   * Without this ref, the frame callback would close over the
   * `onChange` from the render that registered it, and every
   * subsequent prop change would be silently ignored — a bug
   * that is invisible until the parent needs to react to a
   * state change under a new callback.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /*
   * The globe group, discovered once and cached. `null` until
   * the first successful lookup.
   */
  const globeGroupRef = useRef<THREE.Object3D | null>(null);

  /*
   * The frame callback. Memoized with `useCallback` so its
   * identity is stable across renders — see the component
   * header, "Frame callback stability", for the reasoning.
   */
  const onFrame = useCallback(() => {
    /*
     * Lazy lookup of the globe group. See the component header
     * for why a mount-time effect would be wrong here.
     */
    if (!globeGroupRef.current) {
      globeGroupRef.current =
        scene.getObjectByName(GLOBE_GROUP_NAME) ?? null;
    }
    const globe = globeGroupRef.current;

    /*
     * The instant this frame is evaluating, resolved through
     * the shared frame-date seam so every sampler in the scene
     * agrees on it. One construction, reused for both
     * `getSunDirection` and `sampleSolarState`.
     */
    const date = resolveFrameDate();

    /*
     * Publish the sun direction, unmodified. `getSunDirection`
     * returns the subsolar vector in the geography frame
     * (+Y = north pole, +Z = prime meridian, +X = 90°E). The
     * lighting shader compares it against the mesh's LOCAL
     * normal, so no rotation by the globe quaternion belongs
     * here. See solarContext.ts for the frame invariant.
     *
     * The three assignments are separate rather than
     * `sunDirectionRef.current = sun` because the ref's
     * `current` object is shared with consumers that read its
     * fields individually; replacing the object would give
     * those consumers a stale reference. Mutating the fields
     * keeps every reader pointed at the same object.
     */
    const sun = getSunDirection(date);
    sunDirectionRef.current.x = sun.x;
    sunDirectionRef.current.y = sun.y;
    sunDirectionRef.current.z = sun.z;

    /*
     * No globe group yet means we can still publish the sun
     * direction (the shader that consumes it does not depend
     * on the group), but we cannot sample the solar state.
     * Return cleanly and try again next frame.
     */
    if (!globe) return;

    const q = globe.quaternion;
    globeWorldQuaternionRef.current = [q.x, q.y, q.z, q.w];

    /*
     * Feed the same instant to the solar state sampler. The
     * `Date` is threaded through `sampleSolarState` into
     * `computeSolarState`, which uses it to place the subsolar
     * point on the globe.
     */
    const result = sampleSolarState({
      nowMs: date.getTime(),
      cameraPosition: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      globeQuaternion: [q.x, q.y, q.z, q.w],
      previous: samplingStateRef.current,
    });

    samplingStateRef.current = result.next;

    if (result.state !== null) {
      onChangeRef.current(result.state);
    }
  }, [camera, scene]);

  useFrameAdapter(onFrame);

  return null;
}