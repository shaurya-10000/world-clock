/**
 * Injectable animation primitives.
 *
 * `CameraTravel` and `GlobeScene` both drive their own
 * `requestAnimationFrame` loops, using `performance.now()` as
 * the clock. In production these point directly at the browser
 * APIs. In tests they can be swapped for a fake clock and a
 * deterministic scheduler, so animation completion can be
 * asserted without waiting real wall-clock time.
 *
 * Both consumers share this single module rather than each
 * configuring its own dependencies. Two independently
 * configurable seams would drift, and a test would have to
 * remember to reset both.
 *
 * The pattern mirrors `lib/useNow.ts` and
 * `lib/texture-loader.ts`: a `set*Deps` setter for tests to
 * install fakes, a `reset*` cleanup for tests to restore
 * production behavior, and a `get*` reader for production
 * code. None of the mutators are meant to be called outside
 * of test setup.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The animation primitives that consumers read at runtime.
 *
 * This is deliberately a small surface — only the three
 * primitives that the globe code actually uses. Adding
 * anything here means adding a fake to every test that
 * replaces the deps, so the interface stays minimal.
 */
export interface AnimationDeps {
  /**
   * Schedules `callback` for the next animation frame.
   * Returns a handle that can be passed to
   * `cancelAnimationFrame`.
   */
  readonly requestAnimationFrame: (
    callback: (now: number) => void,
  ) => number;

  /**
   * Cancels a previously scheduled frame. A handle that has
   * already fired is a no-op, matching the browser behavior.
   */
  readonly cancelAnimationFrame: (
    id: number,
  ) => void;

  /**
   * Returns the current high-resolution timestamp, in
   * milliseconds, using the same time base as
   * `requestAnimationFrame`'s callback argument.
   */
  readonly now: () => number;
}

/* -------------------------------------------------------------------------- */
/* Implementation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The production implementations, captured once at module
 * load. Held as a constant so that `resetAnimationDeps` always
 * has a canonical value to restore, even if a test corrupted
 * `deps` in a way that broke reading from `window`.
 */
const productionDeps: AnimationDeps = {
  requestAnimationFrame: (callback) =>
    window.requestAnimationFrame(callback),
  cancelAnimationFrame: (id) =>
    window.cancelAnimationFrame(id),
  now: () => performance.now(),
};

let deps: AnimationDeps = productionDeps;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Replace some or all of the animation primitives.
 *
 * Unspecified keys fall back to their production values, so a
 * test that only needs a fake clock can pass just `{ now }` and
 * leave `requestAnimationFrame` pointing at the browser.
 *
 * Test-only. Production code should never call this.
 */
export function setAnimationDeps(
  next: Partial<AnimationDeps>,
): void {
  deps = { ...productionDeps, ...next };
}

/**
 * Restore the production primitives.
 *
 * Test-only. Call this in an `afterEach` so a fake installed
 * by one test does not leak into the next.
 */
export function resetAnimationDeps(): void {
  deps = productionDeps;
}

/**
 * Read the current animation primitives.
 *
 * Consumers should call this once at the top of a
 * `useCallback` and hold the reference for the duration of the
 * animation. That way a test that swaps the deps mid-animation
 * does not corrupt a running frame loop.
 *
 * The returned object is the live singleton — do not mutate
 * it. To change the primitives, call `setAnimationDeps`.
 */
export function getAnimationDeps(): AnimationDeps {
  return deps;
}