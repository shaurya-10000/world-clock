"use client";

/**
 * Favorites storage.
 *
 * Persists a set of favorited location IDs to `localStorage`.
 * Deliberately not a backend: the data is personal, small, and
 * only needs to survive on the device it was created on. No
 * account, no sync, no server.
 *
 * ## Storage schema
 *
 *   Key:   `world-clock:favorites`
 *   Value: `{ v: 1, ids: ["new-york","tokyo","london"] }`
 *
 * The `v` field lets future versions distinguish an
 * already-migrated payload from a corrupt one. Reading a bare
 * JSON array — the pre-versioning shape — is still supported
 * for backward compatibility and is upgraded to the v1 shape
 * on the next write. Any other shape (a number, a string, an
 * object without `ids`) is treated as corrupt.
 *
 * ## Failure modes handled
 *
 *   - `localStorage` unavailable (SSR, private mode, disabled):
 *     the hook operates in-memory only and never persists.
 *   - Corrupt JSON or unsupported schema version: falls back
 *     to an empty list and overwrites on the next write.
 *   - Non-array `ids`: same as corrupt.
 *   - Array containing non-strings: filtered out on read.
 *   - Array containing IDs not in the current catalog: mapped
 *     through `LOCATION_ID_ALIASES`, then filtered out.
 *   - Array containing IDs that `toggle` was never allowed to
 *     store: rejected by `toggle` so the in-memory list stays
 *     consistent with the catalog.
 *
 * ## Cross-tab behavior
 *
 * The hook listens for `storage` events so that toggling a
 * favorite in one tab is reflected in another tab within the
 * same browser.
 *
 * ## SSR / hydration
 *
 * The initial read happens in a `useState` initializer guarded
 * on `typeof window === "undefined"`. On the server, the
 * initializer returns `EMPTY_FAVORITES`; on the client, it
 * returns the persisted list before the first paint. This
 * eliminates the one-frame flash where a user with favorites
 * would see an empty list before the real list appeared.
 *
 * The mismatch this produces is handled by the root `<html>`
 * element's `suppressHydrationWarning` (see `app/layout.tsx`).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { WORLD_LOCATIONS } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "world-clock:favorites";

/**
 * Current schema version. Bump when the on-disk shape
 * changes and add a matching branch to `readFavorites`.
 */
const SCHEMA_VERSION = 1;

/**
 * A frozen shared empty array.
 *
 * Consumers of `useFavorites` frequently key `useMemo` or
 * `useEffect` on the `favorites` array. Returning a fresh
 * `[]` on every render would break that referential equality
 * and trigger spurious re-runs. The empty case is by far the
 * most common.
 */
const EMPTY_FAVORITES: readonly string[] = Object.freeze([]);

/**
 * A set of valid location IDs, used both for filtering on
 * read and for validating `toggle` arguments. Precomputed
 * once at module load so lookups are O(1).
 */
const VALID_IDS: ReadonlySet<string> = new Set(
  WORLD_LOCATIONS.map((location) => location.id),
);

/**
 * Historical IDs that have been renamed, mapped to their
 * current form.
 *
 * ## Contract
 *
 * Every value must itself be a canonical ID that appears in
 * `WORLD_LOCATIONS`. An alias whose value is another alias
 * creates a two-hop resolution that this module does not
 * walk — `resolveId` performs exactly one lookup.
 *
 * Every key must *not* be a valid current ID.
 *
 * Add entries only for IDs that have actually shipped.
 */
const LOCATION_ID_ALIASES: Readonly<Record<string, string>> = {
  // Example (delete when a real rename lands):
  // "new-york-city": "new-york",
};

/**
 * Resolve a stored location ID to its current form.
 *
 * Unknown aliases pass through unchanged; the caller still
 * validates the result against `VALID_IDS`.
 */
function resolveId(storedId: string): string {
  return LOCATION_ID_ALIASES[storedId] ?? storedId;
}

/* -------------------------------------------------------------------------- */
/* Storage helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Extract the ID array from a parsed storage payload.
 *
 * Accepts two shapes:
 *
 *   - `{ v: number, ids: unknown[] }` — the current schema.
 *   - `unknown[]` — the pre-versioning shape, migrated in
 *     place on the next write.
 *
 * Returns `null` for anything else, which the caller treats
 * as "empty list".
 */
function extractStoredIds(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "ids" in parsed &&
    Array.isArray((parsed as { ids: unknown }).ids)
  ) {
    return (parsed as { ids: unknown[] }).ids;
  }

  return null;
}

/**
 * Read the favorites list from storage.
 *
 * Returns a frozen array. Unknown IDs and malformed entries
 * are filtered out rather than thrown, so a stale or corrupt
 * store cannot crash the drawer.
 */
function readFavorites(): readonly string[] {
  if (typeof window === "undefined") {
    return EMPTY_FAVORITES;
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /*
     * Safari private mode and some enterprise configurations
     * throw on access. Treat as "no favorites" rather than
     * failing.
     */
    return EMPTY_FAVORITES;
  }

  if (!raw) {
    return EMPTY_FAVORITES;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_FAVORITES;
  }

  const storedIds = extractStoredIds(parsed);
  if (storedIds === null) {
    return EMPTY_FAVORITES;
  }

  const valid: string[] = [];
  const seen = new Set<string>();

  for (const entry of storedIds) {
    if (typeof entry !== "string") continue;

    const resolved = resolveId(entry);

    if (VALID_IDS.has(resolved) && !seen.has(resolved)) {
      valid.push(resolved);
      seen.add(resolved);
    }
  }

  return valid.length === 0
    ? EMPTY_FAVORITES
    : Object.freeze(valid);
}

/**
 * Write the favorites list to storage.
 *
 * Silently no-ops on failure. A storage quota error or a
 * disabled `localStorage` should not break the app.
 */
function writeFavorites(ids: readonly string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload = JSON.stringify({
      v: SCHEMA_VERSION,
      ids,
    });

    window.localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* storage full or disabled — nothing to do */
  }
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export interface FavoritesApi {
  /**
   * Favorited location IDs.
   *
   * Order is preserved from the stored list — that is, the
   * order the user favorited them in. Consumers that want
   * catalog order should sort against `WORLD_LOCATIONS`.
   *
   * The array is frozen and its identity is stable across
   * renders unless the list actually changed.
   */
  readonly favorites: readonly string[];

  /** True when the given location ID is currently favorited. */
  readonly isFavorite: (locationId: string) => boolean;

  /**
   * Toggle a location's favorite status. Stable across
   * renders. IDs not present in the catalog are ignored — the
   * hook state never contains an ID that
   * `getWorldLocationById` would not resolve.
   */
  readonly toggle: (locationId: string) => void;
}

export function useFavorites(): FavoritesApi {
  /*
   * Synchronous initial read. See the module header for why
   * this is a `useState` initializer rather than a `null`
   * state populated in an effect.
   */
  const [ids, setIds] = useState<readonly string[]>(
    readFavorites,
  );

  /* Cross-tab sync. */
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      /*
       * `event.storageArea` is the `Storage` object the event
       * originated from. The spec says it is always populated
       * when the event is dispatched by the browser. Manually
       * constructed `StorageEvent`s — as in tests, and as in
       * some polyfills — leave it `null` unless the caller
       * passes it explicitly.
       *
       * Both `window.localStorage` and `null` are therefore
       * accepted as "this event is for us". Anything else is
       * filtered out, which is what excludes `sessionStorage`
       * and other origins.
       */
      if (
        event.storageArea !== null &&
        event.storageArea !== window.localStorage
      ) {
        return;
      }

      /*
       * `event.key` is `null` for `localStorage.clear()`. A
       * clear that affects our key (or the whole store)
       * re-reads from an empty store, which produces
       * `EMPTY_FAVORITES`.
       */
      if (event.key !== null && event.key !== STORAGE_KEY) {
        return;
      }

      setIds(readFavorites());
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const favorites = useMemo<readonly string[]>(
    () => (ids.length === 0 ? EMPTY_FAVORITES : ids),
    [ids],
  );

  const favoriteSet = useMemo(
    () => new Set(favorites),
    [favorites],
  );

  const isFavorite = useCallback(
    (locationId: string): boolean =>
      typeof locationId === "string" &&
      favoriteSet.has(locationId),
    [favoriteSet],
  );

  const toggle = useCallback((locationId: string): void => {
    /*
     * Reject non-string and unknown IDs. This keeps the
     * in-memory list consistent with what a fresh page
     * load would produce from the same storage.
     */
    if (typeof locationId !== "string") return;
    if (!VALID_IDS.has(locationId)) return;

    setIds((current) => {
      const base = current;

      const next = base.includes(locationId)
        ? base.filter((id) => id !== locationId)
        : [...base, locationId];

      /*
       * Persist synchronously. The list is small enough
       * that there is no benefit to debouncing, and
       * synchronous writes keep the UI and storage in
       * lockstep — important for the cross-tab listener,
       * which fires on the other tab the moment this
       * write completes.
       */
      writeFavorites(next);

      return next.length === 0
        ? EMPTY_FAVORITES
        : Object.freeze(next);
    });
  }, []);

  return {
    favorites,
    isFavorite,
    toggle,
  };
}

/* -------------------------------------------------------------------------- */
/* Test utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Verify that no alias in `LOCATION_ID_ALIASES` violates the
 * contract documented on the constant.
 *
 * Returns an array of human-readable violation messages. An
 * empty array means the table is well-formed.
 *
 * Test-only.
 */
export function __validateAliases(): readonly string[] {
  const violations: string[] = [];

  for (const [alias, canonical] of Object.entries(
    LOCATION_ID_ALIASES,
  )) {
    if (alias in LOCATION_ID_ALIASES) {
      violations.push(
        `alias "${alias}" shadows another alias key`,
      );
    }

    if (VALID_IDS.has(alias)) {
      violations.push(
        `alias "${alias}" is also a current catalog ID`,
      );
    }

    if (!VALID_IDS.has(canonical)) {
      violations.push(
        `alias "${alias}" points at "${canonical}", which is not in the catalog`,
      );
    }
  }

  return violations;
}