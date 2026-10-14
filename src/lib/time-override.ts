/**
 * App-wide time override.
 *
 * ## What this module is for
 *
 * The picker feature ("Next solstice", "Sunrise in Tokyo")
 * needs the entire app to display a moment other than now.
 * Every clock, every city row, every atmospheric classification,
 * every sun direction must agree on the same instant, or the
 * feature is incoherent — a globe showing midnight over Tokyo
 * while Tokyo's clock says 3pm is worse than no feature at all.
 *
 * This module is the single source of truth for "what instant
 * is the app currently showing?"
 *
 *   - `null`  → production behavior: the app shows the real
 *               current time, and every ticker keeps ticking.
 *   - number  → an override is active: the app shows the given
 *               epoch milliseconds, frozen.
 *
 * ## Why a module-level ref, not React state
 *
 * The override is read from four places, only one of which
 * lives in a normal React tree:
 *
 *   1. `useNow`'s `deps.now()` — a plain function, called
 *      outside React's render cycle, on a timer.
 *   2. `SolarSampler` — inside the R3F reconciler, which is a
 *      separate React root.
 *   3. `RealisticEarthSphere` — same, inside R3F.
 *   4. `AstronomicalEventPicker` — a normal React component
 *      that needs to render a "currently viewing" indicator.
 *
 * (1)–(3) cannot reach a React context provider mounted above
 * the app, because they either run outside React's render
 * cycle or inside a separate React tree. A module-level ref is
 * the only seam that all four can share.
 *
 * (4) needs to *react* to changes. A plain ref does not. So
 * this module also exposes a subscription API — a minimal
 * pub/sub with no batching, no scheduling, and no React
 * dependency. The picker's hook subscribes with
 * `useSyncExternalStore`, which gives it React reactivity for
 * free without introducing state into this module.
 *
 * ## Why not `useState` in the picker + prop drilling
 *
 * Because the value needs to reach `SolarSampler`, which
 * lives inside the R3F scene. Props do not cross the `<Canvas>`
 * boundary cleanly — the R3F tree is rendered by its own
 * reconciler — and even if they did, every intermediate
 * component would need a new prop. The ref is one file, one
 * import, zero prop-drilling.
 *
 * ## Shape parity
 *
 * The setter/getter/reset triple mirrors `lib/animation-deps.ts`
 * and `lib/texture-loader.ts`. A reader who understands one of
 * those seams understands this one.
 *
 * ## Purity
 *
 * The override value is a `number | null`. It is not a
 * `Date`, not an object, not an array. Consumers that need a
 * `Date` construct one at the point of use. This keeps the
 * module free of mutable state that consumers could corrupt
 * by holding a reference.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A subscriber to override changes. Called with the new
 * value — `null` for "back to live time", a number for
 * "viewing this instant".
 *
 * Subscribers must not throw. If one does, the loop stops
 * and later subscribers are skipped. This matches the
 * behavior of `lib/events.ts` — a throwing subscriber is a
 * bug, and hiding it would be worse than surfacing it.
 */
type Subscriber = (override: number | null) => void;

/* -------------------------------------------------------------------------- */
/* Range guard                                                                */
/* -------------------------------------------------------------------------- */

/*
 * The valid range for a JavaScript `Date`, in epoch
 * milliseconds. `new Date(ms)` is a valid date if and only if
 * `ms` is strictly within `[-8.64e15, 8.64e15]`.
 *
 * `setTimeOverride` accepts any finite number. Without this
 * guard, a caller that passes `Number.MAX_SAFE_INTEGER` or a
 * bad calculation's result would produce a valid `Date` at the
 * year 287396 — the app would freeze every clock, every
 * atmosphere, and every sun direction on an absurd instant
 * with no visible indication that anything was wrong.
 *
 * Rejecting out-of-range values is cheaper than diagnosing the
 * symptoms later.
 */
const MAX_DATE_MS = 8.64e15;

/* -------------------------------------------------------------------------- */
/* The value                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The current override, or `null` when the app is showing
 * live time.
 *
 * Read via `getTimeOverride`. Written via `setTimeOverride`
 * or `clearTimeOverride`. Not exported directly — a consumer
 * that imported the binding would capture `null` at module
 * load and never see updates.
 */
let currentOverride: number | null = null;

/**
 * The set of subscribers. A `Set` rather than an array so
 * duplicate subscriptions collapse naturally and removal is
 * O(1). A component that mounts twice in React strict mode
 * subscribes twice; collapsing that silently is the least
 * surprising behavior — the same choice `lib/events.ts`
 * makes.
 */
const subscribers = new Set<Subscriber>();

/* -------------------------------------------------------------------------- */
/* Public API — read                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Read the current override.
 *
 * Returns `null` when the app is showing live time, or the
 * override timestamp in epoch milliseconds when a moment has
 * been selected.
 *
 * Not a React hook — this is a plain function reading a
 * module-level value. Call it from `deps.now()` (see
 * `lib/useNow.ts`), from a `useFrame` callback, or anywhere
 * outside React's render cycle.
 */
export function getTimeOverride(): number | null {
  return currentOverride;
}

/**
 * The effective "now" the app should display.
 *
 * Returns the override when set, otherwise `Date.now()`. This
 * is the function that every consumer of "what time is it?"
 * should call — it hides the override-vs-live decision behind
 * a single name.
 *
 * Using this function instead of `Date.now()` directly means
 * a component automatically respects the override without
 * knowing it exists. `useNow` does exactly this: its
 * production `deps.now` is `getEffectiveNow`.
 */
export function getEffectiveNow(): number {
  return currentOverride ?? Date.now();
}

/**
 * True when an override is active.
 *
 * Convenience predicate. The same information is available
 * as `getTimeOverride() !== null`, but the named boolean is
 * more readable at call sites that care about the state
 * rather than the value.
 */
export function isTimeOverridden(): boolean {
  return currentOverride !== null;
}

/* -------------------------------------------------------------------------- */
/* Public API — write                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Set the override to a specific instant.
 *
 * Passing a non-finite value (`NaN`, `Infinity`,
 * `-Infinity`) is a no-op — the override stays whatever it
 * was. Passing a finite value outside the valid `Date` range
 * (`±8.64e15` ms) is also a no-op, for the same reason: an
 * out-of-range timestamp would freeze every clock in the app
 * on a year that no UI copy is prepared to describe.
 *
 * Passing a value identical to the current override is also a
 * no-op — no subscriber fires. This lets the picker call
 * `setTimeOverride` from a `useEffect` without causing an
 * infinite re-render loop.
 *
 * @param ms - The instant to display, in epoch milliseconds.
 */
export function setTimeOverride(ms: number): void {
  if (!Number.isFinite(ms)) return;
  if (Math.abs(ms) > MAX_DATE_MS) return;
  if (currentOverride === ms) return;

  currentOverride = ms;
  notify();
}

/**
 * Clear the override, returning the app to live time.
 *
 * Called by the "back to now" action on the picker and by
 * the "Right now" preset.
 */
export function clearTimeOverride(): void {
  if (currentOverride === null) return;

  currentOverride = null;
  notify();
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Subscribe to override changes.
 *
 * The listener fires whenever the override value changes,
 * including when it is cleared. It does **not** fire
 * immediately on subscription — `useSyncExternalStore`
 * handles the initial read separately, so firing here would
 * double-invoke the consumer on mount.
 *
 * @param listener - Called with the new override value.
 * @returns An unsubscribe function. Safe to call multiple
 *   times; subsequent calls are no-ops.
 */
export function subscribeToTimeOverride(
  listener: Subscriber,
): () => void {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Notify every subscriber of the current override value.
 *
 * Iterates a snapshot of the subscriber set so a subscriber
 * that unsubscribes during dispatch does not disturb the
 * iteration — the same pattern `lib/events.ts` uses for the
 * same reason.
 *
 * A throwing subscriber propagates the exception up through
 * the setter, which is the correct behavior: a subscriber
 * that throws is a bug in that subscriber, and swallowing the
 * error here would hide it. `useSyncExternalStore` never
 * throws from its listener, so this is not a practical
 * concern in React — it matters for direct users of the API.
 */
function notify(): void {
  const snapshot = [...subscribers];
  for (const listener of snapshot) {
    listener(currentOverride);
  }
}

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reset the override to `null` and detach every subscriber.
 *
 * Test-only. A test that sets an override must reset it in an
 * `afterEach`, or the next test — and the next test *file*,
 * since this is module-level state — will see the fake value.
 * The subscriber list is cleared as well so a subscriber
 * installed by one test does not receive notifications during
 * a later one.
 *
 * Production code has no reason to call this.
 */
export function resetTimeOverride(): void {
  currentOverride = null;
  subscribers.clear();
}