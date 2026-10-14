"use client";

/**
 * Shared ticker.
 *
 * A single `setInterval`-equivalent for the entire application.
 * Every component that needs "the current time, updated every
 * N milliseconds" subscribes to this hook instead of running
 * its own timer.
 *
 * ## Subscriber contract
 *
 * When a component subscribes, it receives the current value
 * synchronously, then receives new values on every tick. A
 * late subscriber that joins an already-running scheduler
 * receives the scheduler's `lastEmittedAt` value, not a
 * `null` fallback and not the next tick's value. This is
 * what makes two components with the same interval see the
 * same time regardless of mount order.
 *
 * ## Properties
 *
 *   - One scheduler per interval value, shared across all
 *     subscribers.
 *   - The scheduler is paused while the document is hidden
 *     (`document.visibilityState !== "visible"`). This is the
 *     single largest battery and CPU win for a page that
 *     otherwise re-renders world clocks every second while
 *     backgrounded.
 *   - On resume, a fresh `Date.now()` is delivered immediately
 *     so subscribers do not display stale times.
 *   - SSR-safe: returns `null` during server rendering and on
 *     the first client render, so the initial HTML matches.
 *
 * ## Time override
 *
 * The production `deps.now` reads through `getEffectiveNow()`
 * from `lib/time-override.ts` rather than calling `Date.now()`
 * directly. That makes the entire app time-travel-aware for
 * free: every consumer of `useNow` — cities rows, the world
 * clock section, search results — automatically displays the
 * overridden instant when one is set, without changing a single
 * line in any of those files.
 *
 * The override is a **constant** while active. That has two
 * consequences the ticker must handle:
 *
 *   1. Subscribers do not need new values while the override
 *      holds. The scheduler could, in principle, skip ticks.
 *      It does not — keeping the ticks lets the code stay
 *      simple, and the cost of an idle `setInterval` that
 *      returns the same number is negligible.
 *
 *   2. The visibility pause becomes counterproductive. A
 *      paused scheduler would need to be woken up when the
 *      override clears, and in the interim the "back to now"
 *      button would appear unresponsive. `handleVisibilityChange`
 *      below therefore starts every scheduler whose
 *      subscribers are waiting on an override, regardless of
 *      document visibility.
 *
 * ## Test seams
 *
 * The environment-facing pieces (getting the current time,
 * scheduling intervals, checking visibility) are behind a
 * module-level `deps` object. In production it points at the
 * real browser APIs and the time-override seam. A test can
 * call `setUseNowDeps` before importing consumers to inject
 * a fake clock, and `resetUseNow` between test cases to
 * clear the scheduler map. Both are exported specifically
 * for tests; production code should not use them.
 *
 * `setUseNowDeps` replaces only the keys it is given.
 * Because the production `deps.now` is override-aware, a
 * test that wants to freeze time without touching the
 * override should still pass its own `now`.
 */

import { useEffect, useState } from "react";

import {
  getEffectiveNow,
  getTimeOverride,
} from "@/lib/time-override";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Subscriber = (now: number) => void;

interface Scheduler {
  readonly intervalMs: number;
  readonly subscribers: Set<Subscriber>;
  timerId: number | null;
  lastEmittedAt: number;
}

/**
 * The environment-facing dependencies of this module.
 *
 * Production values are the browser's real `setInterval`,
 * `clearInterval`, `document.visibilityState`, and the
 * override-aware `getEffectiveNow` from `lib/time-override`.
 * Tests replace them with fakes via `setUseNowDeps`.
 */
export interface UseNowDeps {
  /**
   * Returns the current epoch milliseconds.
   *
   * Production reads through `getEffectiveNow()`, which
   * returns either the app-wide time override (when one is
   * active) or `Date.now()` (when none is). This is the
   * single hook the entire app uses to make itself
   * time-travel-aware.
   */
  readonly now: () => number;

  /** Schedules a repeating callback, returns a handle. */
  readonly setInterval: (
    callback: () => void,
    ms: number,
  ) => number;

  /** Cancels a scheduled interval. */
  readonly clearInterval: (id: number) => void;

  /**
   * True when the document should be treated as visible. Used
   * to decide whether to run timers at all.
   */
  readonly isVisible: () => boolean;
}

/* -------------------------------------------------------------------------- */
/* Dependency object                                                          */
/* -------------------------------------------------------------------------- */

const productionDeps: UseNowDeps = {
  /*
   * Override-aware. See the module header for why this
   * indirects through `getEffectiveNow` instead of calling
   * `Date.now` directly.
   */
  now: getEffectiveNow,
  setInterval: (callback, ms) =>
    window.setInterval(callback, ms),
  clearInterval: (id) => window.clearInterval(id),
  isVisible: () =>
    typeof document !== "undefined" &&
    document.visibilityState !== "hidden",
};

let deps: UseNowDeps = productionDeps;

/**
 * Replace the module's environment dependencies.
 *
 * Exported for tests only. Production code should never call
 * this — the default deps work correctly in any browser.
 *
 * Patches are merged against the production defaults rather
 * than the previous `deps`, so a test that passes only
 * `{ now: () => 1234 }` still gets the real `setInterval`,
 * `clearInterval`, and `isVisible`. This matches the same
 * rebuild-from-production pattern used by `animation-deps`.
 */
export function setUseNowDeps(next: Partial<UseNowDeps>): void {
  deps = { ...productionDeps, ...next };
}

/* -------------------------------------------------------------------------- */
/* Scheduler internals                                                        */
/* -------------------------------------------------------------------------- */

const schedulers = new Map<number, Scheduler>();

let visibilityListenerAttached = false;

function emit(scheduler: Scheduler): void {
  scheduler.lastEmittedAt = deps.now();

  for (const subscriber of scheduler.subscribers) {
    subscriber(scheduler.lastEmittedAt);
  }
}

function start(scheduler: Scheduler): void {
  if (scheduler.timerId !== null) {
    return;
  }

  emit(scheduler);

  scheduler.timerId = deps.setInterval(
    () => emit(scheduler),
    scheduler.intervalMs,
  );
}

function stop(scheduler: Scheduler): void {
  if (scheduler.timerId === null) {
    return;
  }

  deps.clearInterval(scheduler.timerId);
  scheduler.timerId = null;
}

/**
 * Pause or resume every scheduler in response to a document
 * visibility change.
 *
 * ## Override behavior
 *
 * When a time override is active, a scheduler is **not**
 * paused by a hidden document. Two reasons:
 *
 *   1. Pausing saves no work. The override is a constant, so
 *      every tick would emit the same number. There is
 *      nothing to save.
 *
 *   2. More importantly, "back to now" must be responsive. If
 *      the tab were backgrounded while viewing a solstice,
 *      then foregrounded and the user clicked "back to now,"
 *      a paused scheduler would leave the display frozen on
 *      the solstice until the next visibility event or the
 *      next mount. Starting schedulers unconditionally while
 *      an override is active avoids that failure mode.
 *
 * The check is per-scheduler and reads the override value at
 * dispatch time — no caching, no refs. `getTimeOverride` is a
 * single property read on a module-level binding, so calling
 * it inside the loop is free.
 */
function handleVisibilityChange(): void {
  const visible = deps.isVisible();
  const overridden = getTimeOverride() !== null;

  for (const scheduler of schedulers.values()) {
    if (visible || overridden) {
      if (scheduler.subscribers.size > 0) {
        start(scheduler);
      }
    } else {
      stop(scheduler);
    }
  }
}

function ensureVisibilityListener(): void {
  if (visibilityListenerAttached) {
    return;
  }

  if (typeof document === "undefined") {
    return;
  }

  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  visibilityListenerAttached = true;
}

function acquire(
  intervalMs: number,
  subscriber: Subscriber,
): () => void {
  let scheduler = schedulers.get(intervalMs);

  if (!scheduler) {
    scheduler = {
      intervalMs,
      subscribers: new Set(),
      timerId: null,
      lastEmittedAt: 0,
    };

    schedulers.set(intervalMs, scheduler);
  }

  const wasStarted = scheduler.timerId !== null;

  scheduler.subscribers.add(subscriber);

  ensureVisibilityListener();

  /*
   * Start the scheduler when the document is visible OR when
   * an override is active. While hidden and un-overridden,
   * emit once so the subscriber has a value to render but do
   * not start the timer.
   *
   * `start` calls `emit` unconditionally, which delivers the
   * current value to every existing subscriber — including
   * the one we just added.
   */
  if (deps.isVisible() || getTimeOverride() !== null) {
    start(scheduler);
  } else {
    emit(scheduler);
  }

  /*
   * Late-subscriber delivery.
   *
   * When the scheduler was already running before this
   * subscriber joined, `start` is a no-op — it does not
   * re-emit — and `emit` was not called on this branch
   * either, because the document was visible. That leaves
   * the new subscriber with no initial value; its `useNow`
   * state stays `null` until the next scheduled tick fires.
   *
   * Deliver the scheduler's last emitted value directly so
   * every subscriber sees the same instant on the frame it
   * mounts. Without this, two components with the same
   * interval see different values when one mounts before
   * the other, which is exactly the class of bug that
   * `SearchRowAtmosphere`'s palette-difference test catches.
   *
   * The value passed is `lastEmittedAt`, which `start`
   * writes before scheduling the next tick. It is therefore
   * the value every existing subscriber already has.
   */
  if (wasStarted) {
    subscriber(scheduler.lastEmittedAt);
  }

  return () => {
    scheduler?.subscribers.delete(subscriber);

    if (scheduler && scheduler.subscribers.size === 0) {
      stop(scheduler);
    }
  };
}

/**
 * Clear all schedulers and detach the visibility listener.
 *
 * Exported for tests only. Calling this in production would
 * leave every active `useNow` subscriber without a ticker
 * until its next effect re-run.
 */
export function resetUseNow(): void {
  for (const scheduler of schedulers.values()) {
    stop(scheduler);
  }

  schedulers.clear();

  if (
    visibilityListenerAttached &&
    typeof document !== "undefined"
  ) {
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
  }

  visibilityListenerAttached = false;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Subscribe to the shared ticker.
 *
 * @param intervalMs Milliseconds between updates. Defaults to
 *   1000. Common values are `1000` (clocks) and `60_000`
 *   (solar / atmosphere).
 *
 * @returns `Date.now()` at the most recent tick, or `null`
 *   during SSR and on the very first client render before the
 *   effect has run. Consumers must handle the `null` case
 *   explicitly — this is what keeps hydration consistent.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    return acquire(intervalMs, setNow);
  }, [intervalMs]);

  return now;
}

/* -------------------------------------------------------------------------- */
/* Variants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The current `Date`, derived from the shared ticker.
 *
 * Slightly more convenient than `useNow` for consumers that
 * immediately format the value. Identical null-handling.
 */
export function useNowDate(intervalMs = 1000): Date | null {
  const now = useNow(intervalMs);

  return now === null ? null : new Date(now);
}