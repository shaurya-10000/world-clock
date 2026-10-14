"use client";

/**
 * Visual-mode preference storage.
 *
 * Persists the user's choice between the minimal and realistic
 * globe surfaces to `localStorage`. Follows the same shape as
 * `useFavorites`:
 *
 *   - Schema-versioned payload: `{ v: 1, mode: GlobeVisualMode }`.
 *   - Corrupt, wrong-version, or unrecognized payloads fall back
 *     to the default rather than throwing.
 *   - Cross-tab sync via the `storage` event.
 *   - Storage failures (private mode, quota exceeded) degrade
 *     silently to in-memory only.
 *
 * ## SSR / hydration
 *
 * The hook is built on `useSyncExternalStore`. During SSR and
 * on the first client render, React uses `getServerSnapshot`,
 * which returns `DEFAULT_VISUAL_MODE`. Once hydration
 * completes, React switches to `getSnapshot`, which reads the
 * persisted value.
 *
 * ## Why not a `useState` initializer
 *
 * Reading `localStorage` in a `useState` initializer produces a
 * hydration mismatch. Server: `window` is undefined → returns
 * `DEFAULT_VISUAL_MODE`. Client first render: `window` is
 * defined → reads `localStorage` → returns the user's actual
 * preference. The two values differ, and any component that
 * renders those values into the DOM (a `VisualModeToggle`'s
 * `aria-checked`, for example) produces a mismatch.
 *
 * `useSyncExternalStore` handles this natively: React calls
 * `getServerSnapshot` during hydration and `getSnapshot`
 * afterwards, and reconciles the switch without a hydration
 * error.
 *
 * There is a one-frame flash of the default mode for a user
 * who has persisted a non-default preference. That is the
 * unavoidable cost of hydration safety for a localStorage-backed
 * preference. The alternative — a hydration mismatch — is worse:
 * React tears down the affected subtree and rebuilds it, and
 * the console shows a visible error.
 *
 * ## Why not `useEffect` + `setState`
 *
 * The previous implementation read `localStorage` inside a
 * `useEffect` and called `setMode` with the result. That works,
 * but it produces a cascading render on every mount — the
 * `react-hooks/set-state-in-effect` rule flags it, and it costs
 * an extra commit. `useSyncExternalStore` gets the same result
 * with no extra commit and no lint warning.
 *
 * ## Why no module-level snapshot cache
 *
 * An earlier version of this hook cached the parsed mode in a
 * module-level variable to skip the `JSON.parse` on every
 * `getSnapshot` call. That cache leaked state across tests:
 * once any test had read a mode, every subsequent test's first
 * `getSnapshot` returned the cached value instead of reading
 * `localStorage` fresh.
 *
 * The cache was also unnecessary. `GlobeVisualMode` is a
 * string union, and `useSyncExternalStore`'s referential
 * equality check compares primitives by value — so a fresh
 * `readVisualMode()` return value is `Object.is`-equal to the
 * previous one whenever the underlying value has not changed.
 * `getSnapshot` reads and parses on every call. `localStorage`
 * reads of a tiny JSON object are microseconds; even at the
 * busiest cadence this hook sees a handful of calls per second.
 *
 * ## Why `useFavorites` is not yet migrated
 *
 * `useFavorites` has the same latent bug. Its persisted value
 * does not currently appear in a DOM attribute that React
 * diffs strictly, so it has not surfaced a mismatch. It should
 * be migrated to the same pattern when the time comes — the
 * fix is mechanical and identical.
 */

import {
  useCallback,
  useSyncExternalStore,
} from "react";

import {
  DEFAULT_VISUAL_MODE,
  VISUAL_MODE_SCHEMA_VERSION,
  VISUAL_MODE_STORAGE_KEY,
  type GlobeVisualMode,
} from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The complete set of valid modes. Kept as a `Set` rather than
 * an inline `||` chain so adding a third mode is a single-line
 * change here and a single-line change in the type union.
 */
const VALID_MODES: ReadonlySet<GlobeVisualMode> = new Set([
  "minimal",
  "realistic",
]);

function isVisualMode(
  value: unknown,
): value is GlobeVisualMode {
  return (
    typeof value === "string" &&
    VALID_MODES.has(value as GlobeVisualMode)
  );
}

/* -------------------------------------------------------------------------- */
/* Storage helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Read the persisted mode, or the default if nothing valid is
 * stored. Never throws.
 */
function readVisualMode(): GlobeVisualMode {
  if (typeof window === "undefined") {
    return DEFAULT_VISUAL_MODE;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(
      VISUAL_MODE_STORAGE_KEY,
    );
  } catch {
    return DEFAULT_VISUAL_MODE;
  }

  if (!raw) {
    return DEFAULT_VISUAL_MODE;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_VISUAL_MODE;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("v" in parsed) ||
    !("mode" in parsed)
  ) {
    return DEFAULT_VISUAL_MODE;
  }

  const { v, mode } = parsed as {
    v: unknown;
    mode: unknown;
  };

  if (v !== VISUAL_MODE_SCHEMA_VERSION) {
    return DEFAULT_VISUAL_MODE;
  }

  return isVisualMode(mode) ? mode : DEFAULT_VISUAL_MODE;
}

/**
 * Persist the mode. Never throws.
 */
function writeVisualMode(mode: GlobeVisualMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload = JSON.stringify({
      v: VISUAL_MODE_SCHEMA_VERSION,
      mode,
    });

    window.localStorage.setItem(
      VISUAL_MODE_STORAGE_KEY,
      payload,
    );
  } catch {
    /* storage full or disabled — nothing to do */
  }
}

/* -------------------------------------------------------------------------- */
/* External store                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The set of active subscribers.
 *
 * `localStorage`'s own `storage` event fires in every *other*
 * tab that shares the origin, but not in the tab that made the
 * change. To make `setVisualMode` reactive within the same tab,
 * `setVisualMode` calls `emitChange` directly after writing.
 *
 * The Set is populated and cleaned up by `subscribe` — React
 * calls the returned unsubscribe on unmount, so entries do not
 * outlive their component.
 */
const subscribers = new Set<() => void>();

function emitChange(): void {
  for (const notify of subscribers) {
    notify();
  }
}

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);

  const handleStorage = (event: StorageEvent): void => {
    if (
      event.storageArea !== null &&
      event.storageArea !== window.localStorage
    ) {
      return;
    }

    if (
      event.key !== null &&
      event.key !== VISUAL_MODE_STORAGE_KEY
    ) {
      return;
    }

    /*
     * The value changed in another tab. Notify subscribers so
     * they re-read via `getSnapshot`.
     */
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    subscribers.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): GlobeVisualMode {
  return readVisualMode();
}

function getServerSnapshot(): GlobeVisualMode {
  return DEFAULT_VISUAL_MODE;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export interface VisualModeApi {
  readonly visualMode: GlobeVisualMode;
  readonly setVisualMode: (mode: GlobeVisualMode) => void;
}

export function useVisualMode(): VisualModeApi {
  const mode = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setVisualMode = useCallback(
    (next: GlobeVisualMode): void => {
      if (!isVisualMode(next)) {
        return;
      }

      writeVisualMode(next);

      /*
       * `localStorage`'s `storage` event does not fire in the
       * tab that made the change, so same-tab subscribers need
       * an explicit nudge. The next `getSnapshot` reads the
       * value we just wrote.
       */
      emitChange();
    },
    [],
  );

  return {
    visualMode: mode,
    setVisualMode,
  };
}