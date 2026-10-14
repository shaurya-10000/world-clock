/**
 * Application event bus.
 *
 * A small, typed replacement for `window.dispatchEvent(new
 * CustomEvent(...))`. The previous pattern used string literals
 * that could not be checked at compile time, and dispatched on
 * the global `window` object where any third-party script could
 * collide with the names.
 *
 * ## Design
 *
 *   - Events are enumerated in one map from name to payload
 *     type. Adding an event means adding one line to that map,
 *     after which every publisher and subscriber is typed.
 *   - Subscriptions are lifecycle-scoped. `on` returns an
 *     unsubscribe function, which is what `useEffect` expects.
 *   - Payloads are passed by reference. Handlers must treat
 *     them as read-only.
 *   - The bus is a module singleton for the page lifetime. It
 *     does not survive a full page navigation, which is the
 *     correct behavior for a Next.js client app.
 */

/* -------------------------------------------------------------------------- */
/* Event map                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The complete set of application events.
 *
 * Every entry maps an event name to its payload type. Events
 * with no payload use `void`. Extending this interface is the
 * only step required to add a new event — both `emit` and `on`
 * will then require the correct payload at every call site.
 *
 * Naming convention: `noun:verb`, lowercase, colon-separated.
 * The name describes what happened, not who should react.
 */
export interface AppEvents {
  /**
   * Request that the cities drawer open.
   *
   * Emitted by the header when the user activates the Cities
   * navigation item, or by the mobile action bar. Consumed by
   * `CitiesSection`, which owns the drawer's open state.
   */
  "cities:open": void;
}

export type AppEventName = keyof AppEvents;

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

type Handler<K extends AppEventName> = (
  payload: AppEvents[K],
) => void;

/**
 * The handler table.
 *
 * Keyed by event name; each value is a `Set` of handlers. A
 * `Set` is used rather than an array so that duplicate
 * subscriptions collapse naturally and removal is O(1). A
 * component that mounts twice in React strict mode subscribes
 * twice; collapsing that silently is the least surprising
 * behavior.
 */
const handlers: {
  [K in AppEventName]?: Set<Handler<K>>;
} = {};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Subscribe to an event.
 *
 * @param name     The event to listen for.
 * @param handler  Called synchronously whenever the event is
 *                 emitted. Receives the payload typed exactly
 *                 as declared in `AppEvents`.
 *
 * @returns An unsubscribe function. Safe to call more than
 *   once; subsequent calls are no-ops.
 *
 * @example
 *   useEffect(() => on("cities:open", () => setOpen(true)), []);
 */
export function on<K extends AppEventName>(
  name: K,
  handler: Handler<K>,
): () => void {
  let bucket = handlers[name] as
    | Set<Handler<K>>
    | undefined;

  if (!bucket) {
    bucket = new Set<Handler<K>>();

    /*
     * TypeScript cannot prove that the value assigned here is
     * the same type read back for this specific key — the map
     * is a `Partial<Record<...>>`, so each key stores its own
     * correctly-typed set at runtime. The cast is a
     * boundary-local concession, isolated to this one
     * assignment.
     */
    (
      handlers as Record<
        AppEventName,
        Set<Handler<K>>
      >
    )[name] = bucket;
  }

  bucket.add(handler);

  return () => {
    const current = handlers[name] as
      | Set<Handler<K>>
      | undefined;

    if (!current) return;

    current.delete(handler);

    /*
     * Drop the key entirely when empty. Leaving an empty
     * `Set` behind would defeat the "no listeners" check in
     * `emit`, which tests rely on for asserting a clean bus
     * between cases.
     */
    if (current.size === 0) {
      delete handlers[name];
    }
  };
}

/**
 * Emit an event.
 *
 * Handlers run synchronously, in subscription order. A
 * handler that throws prevents subsequent handlers from
 * running — this is deliberate, because silent error
 * swallowing inside an event bus is worse than a visible
 * failure. If a handler must not throw, it should catch
 * internally.
 *
 * Events with no payload must still be emitted with an
 * explicit `undefined`:
 *
 *   emit("cities:open", undefined);
 *
 * The explicitness is a feature: it forces every call site to
 * acknowledge that the event has a shape, even when that shape
 * is `void`.
 */
export function emit<K extends AppEventName>(
  name: K,
  payload: AppEvents[K],
): void {
  const bucket = handlers[name] as
    | Set<Handler<K>>
    | undefined;

  if (!bucket) return;

  /*
   * Iterate a copy. A handler is allowed to unsubscribe
   * itself or add new handlers during dispatch, and the set
   * must not be mutated while being iterated.
   */
  for (const handler of [...bucket]) {
    handler(payload);
  }
}

/**
 * Subscribe to an event for the lifetime of a React
 * component.
 *
 * A convenience wrapper around `on` that reads naturally
 * inside a `useEffect` cleanup position. Kept as a plain
 * function rather than a hook so the bus remains
 * framework-agnostic — non-React consumers can still use
 * `on` and `emit` directly.
 *
 * @example
 *   useEffect(
 *     () => subscribe("cities:open", () => setOpen(true)),
 *     [],
 *   );
 */
export function subscribe<K extends AppEventName>(
  name: K,
  handler: Handler<K>,
): () => void {
  return on(name, handler);
}

/**
 * Remove every handler from the bus.
 *
 * Test-only. Production code has no reason to call this — the
 * bus is designed to live for the lifetime of the page. Tests
 * call it between cases so that subscriptions from one test
 * do not leak into the next.
 */
export function resetEventBus(): void {
  for (const name of Object.keys(
    handlers,
  ) as AppEventName[]) {
    delete handlers[name];
  }
}

/* -------------------------------------------------------------------------- */
/* Development diagnostics                                                    */
/* -------------------------------------------------------------------------- */

if (
  process.env.NODE_ENV !== "production" &&
  typeof window !== "undefined"
) {
  /*
   * `window.__worldClockEvents.listeners()` answers "what is
   * listening right now?" from the browser console. Useful
   * during development to verify that a component cleaned up
   * its subscriptions after unmounting.
   *
   * Defined only in development so that a production bundle
   * does not expose a mutable global.
   */
  (
    window as unknown as {
      __worldClockEvents?: {
        listeners: () => Record<string, number>;
      };
    }
  ).__worldClockEvents = {
    listeners: () => {
      const summary: Record<string, number> = {};

      for (const name of Object.keys(
        handlers,
      ) as AppEventName[]) {
        const bucket = handlers[name];
        summary[name] = bucket ? bucket.size : 0;
      }

      return summary;
    },
  };
}