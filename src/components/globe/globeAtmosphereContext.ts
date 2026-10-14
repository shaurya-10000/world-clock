/**
 * Shared globe atmosphere, bypassing React.
 *
 * The atmosphere is sampled inside the R3F scene by
 * `GlobeAtmosphereSampler`, which reads the camera position
 * and globe quaternion every frame and classifies the visible
 * hemisphere into one of `dawn` / `day` / `dusk` / `night`.
 * The value is consumed outside the canvas by `Globe.tsx`,
 * which passes it to `GlobeAtmosphere.tsx` to drive the
 * background crossfade.
 *
 * ## Why a ref, not React state
 *
 * R3F's reconciler is a separate React root. Context providers
 * mounted above `<Canvas>` are not visible to components
 * inside it, and providers inside the canvas are not visible
 * to components outside it. The two trees are connected only
 * by props passed through the `<Canvas>` boundary or by a
 * shared object both can reach.
 *
 * Because `Globe.tsx` owns the `<Canvas>` and sits outside it,
 * and the sampler sits inside, the shared ref is the correct
 * seam. This mirrors `solarContext` and
 * `cameraDistanceContext`.
 *
 * ## Not reactive
 *
 * Reading `globeAtmosphereRef.current` does not trigger a
 * React render. Consumers must poll it on an interval if they
 * want to react. This is deliberate: the alternative would be
 * state writes at 4 Hz, which is fine in principle but would
 * spread the sampler's timing across two React roots, and the
 * simplicity of a polled ref is worth more than the marginal
 * ergonomic gain.
 *
 * ## Why the value is nullable
 *
 * `null` means "the sampler has not yet produced a value".
 * The ref is initialized to `null`, not to a default
 * `Atmosphere`, because the correct default depends on the
 * time of day — which the sampler exists to determine. A
 * consumer that sees `null` should fall back to its own
 * approximation (typically `solarState.dominantAtmosphere`),
 * not to a hardcoded guess.
 *
 * An earlier version of this module initialized the ref to
 * `"night"`. That produced a spurious `"night"` update on
 * mount, before the sampler had run: a globe loaded at noon
 * would briefly flash a nighttime background. Making the ref
 * nullable lets consumers distinguish "no sample yet" from
 * "sampled night", which is the correct semantics.
 *
 * ## Why the throttle state lives here
 *
 * `lastSampleTimeRef` is written by the sampler and read by
 * the sampler on the next frame. It is exposed in this module
 * rather than kept as a `useRef` inside the component so that
 * the throttle state survives a component remount — for
 * example, a remount triggered by a future feature that
 * recreates the R3F tree. See the remount caveat on the ref
 * itself for the specific scenario that would require an
 * explicit reset.
 */

import type { Atmosphere } from "@/lib/atmosphere";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Milliseconds between full samples.
 *
 * 250 ms = 4 Hz. Fast enough that the background responds
 * immediately to a rotation, slow enough that the linear
 * `nearestCity` scan doesn't compete with rendering.
 *
 * Exported so the outside-the-canvas poller in `Globe.tsx`
 * can reuse the same interval rather than hardcoding a
 * second `250` that could drift out of sync with this one.
 */
export const SAMPLE_INTERVAL_MS = 250;

/* -------------------------------------------------------------------------- */
/* The refs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The current atmosphere of the visible hemisphere, or `null`
 * before the first sample.
 *
 * Written by `GlobeAtmosphereSampler` on every sample tick —
 * always with a real `Atmosphere` value, never `null`. Read
 * by consumers that want to react to atmosphere changes; a
 * consumer that reads `null` should fall back to its own
 * approximation.
 *
 * Initialized to `null` because the correct default depends
 * on the time of day, which is exactly what the sampler
 * exists to determine. See the module header for the history
 * of this decision.
 */
export const globeAtmosphereRef: { current: Atmosphere | null } = {
  current: null,
};

/**
 * The timestamp of the last sample, in milliseconds relative
 * to the R3F clock's start.
 *
 * Written by the sampler and read by the sampler on the next
 * frame. Exposed here — rather than as a `useRef` inside the
 * component — so the throttle state survives if the sampler
 * component remounts.
 *
 * ## Remount caveat
 *
 * The R3F clock (`state.clock.elapsedTime`) resets whenever
 * the `<Canvas>` itself is re-created — which happens on a
 * full unmount/remount of `GlobeCanvas`, not on a simple
 * visual-mode toggle (that only swaps the sphere inside the
 * existing canvas). If a future change ever recreates the
 * canvas without a fresh page load, this ref must be reset
 * alongside it, or the very first frame of the new canvas
 * will see `now - lastSampleTimeRef.current` as a huge
 * negative number and skip its sample.
 * `resetGlobeAtmosphereContext` below is the correct place to
 * do that.
 */
export const lastSampleTimeRef: { current: number } = {
  current: 0,
};

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reset both refs to their initial values.
 *
 * Test-only. A test that writes to either ref must reset them
 * in an `afterEach` so the next test file does not see the
 * fake value. Production code has no reason to call this —
 * both refs are written every sample tick by
 * `GlobeAtmosphereSampler`.
 */
export function resetGlobeAtmosphereContext(): void {
  globeAtmosphereRef.current = null;
  lastSampleTimeRef.current = 0;
}