"use client";

/**
 * Injectable R3F context.
 *
 * `useFrame` and `useThree` from `@react-three/fiber` read
 * from React context that only exists inside a `<Canvas>`.
 * That makes components which use them impossible to render
 * in a plain Vitest + React Testing Library environment.
 *
 * This module provides a thin indirection layer:
 *
 *   - In production, `<R3FAdaptersProvider>` wraps its
 *     children in the real R3F context and the hooks simply
 *     delegate to `@react-three/fiber`.
 *
 *   - In tests, a provider with fake implementations can be
 *     mounted instead. The hooks read the injected values
 *     and never touch `@react-three/fiber` at all.
 *
 * Consumers (components that need per-frame or scene-level
 * access) import `useFrameAdapter` and `useThreeAdapter` from
 * this module instead of importing `useFrame` and `useThree`
 * directly from `@react-three/fiber`.
 *
 * ## Why context and not module-level dependency injection
 *
 * `useFrame` and `useThree` are React hooks. They must be
 * called during render and must obey the rules of hooks.
 * A module-level `let currentUseFrame = ...` would be
 * mutable global state shared across tests running in the
 * same process, which is exactly the kind of cross-test
 * leak this pattern exists to avoid. React context is
 * already the correct tool for "this subtree sees this
 * value."
 *
 * The provider is mounted once, at the top of the R3F scene
 * tree, in `GlobeCanvas`. Every consumer below it reads the
 * same adapters.
 *
 * ## Frame-callback stability
 *
 * The production `useFrame` wrapper delegates to R3F on
 * every render. R3F keys its internal subscription on the
 * callback reference, so an unmemoized inline callback
 * silently defeats the whole optimization — the loop
 * unsubscribes and resubscribes on every frame. Rather
 * than trusting every caller to remember `useCallback`,
 * `useFrameAdapter` wraps a ref-based latest-callback in
 * dev and warns once if the identity of `callback`
 * changes on every render. Production never pays for the
 * check.
 */

import {
  useFrame as useRealFrame,
  useThree as useRealThree,
  type RootState,
} from "@react-three/fiber";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

/* -------------------------------------------------------------------------- */
/* Adapter interface                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A minimal frame-state shape.
 *
 * Declares the narrowest surface every consumer actually needs:
 *
 *   - `clock.elapsedTime` — total seconds since the R3F clock
 *     started. Used by `SolarSampler` for throttled sampling
 *     and by `RealisticEarthSphere` for cloud rotation deltas.
 *
 *   - `clock.getDelta()` — seconds since the previous frame.
 *     Used by `GlobeControls` to advance momentum and
 *     auto-rotation at a frame-rate-independent rate. R3F's
 *     real clock provides this; the narrowed interface must
 *     expose it so tests that drive the frame loop manually
 *     can supply a fake that returns whatever delta they want.
 *
 * Everything else on R3F's full `RootState` is deliberately
 * excluded. Widening this interface would force every test
 * fake to construct more of R3F's shape, and the tests would
 * drift as R3F adds fields.
 */
export interface FrameStateLike {
  readonly clock: {
    readonly elapsedTime: number;
    readonly getDelta: () => number;
  };
}

/**
 * The subset of R3F's hooks this application uses.
 *
 * Both hooks mirror the shape of their `@react-three/fiber`
 * counterparts:
 *
 *   - `useFrame` takes a per-frame callback.
 *   - `useThree` returns the scene's root state.
 */
export interface R3FAdapters {
  readonly useFrame: (
    callback: (state: FrameStateLike) => void,
  ) => void;
  readonly useThree: () => RootState;
}

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

const R3FAdaptersContext = createContext<R3FAdapters | null>(
  null,
);

/* -------------------------------------------------------------------------- */
/* Dev-mode stability check                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Track whether a callback identity has been stable across
 * renders, and warn once per component instance if it has not.
 *
 * ## Why this runs in an effect
 *
 * The comparison reads and writes refs. React forbids touching
 * refs during render, so the check runs in an effect after
 * every commit instead. The observable behavior is the same:
 * the warning fires once, after the render in which the
 * callback's identity first changed.
 *
 * ## Rules of Hooks
 *
 * The hooks are **always** called, in the same order, on
 * every render. Only the *body* of the check is gated on
 * `NODE_ENV`. Gating the hooks themselves would be a
 * Rules-of-Hooks violation: a future refactor that changed
 * the guard from a build-time constant to a runtime value
 * would change hook order between renders and crash React.
 *
 * The `NODE_ENV` check is a compile-time constant in Next.js
 * builds, so the production branch is dead-code-eliminated.
 */
function useWarnIfUnstable(callback: unknown): void {
  const previous = useRef<unknown>(callback);
  const warned = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    if (
      !warned.current &&
      previous.current !== callback &&
      previous.current !== undefined
    ) {
      /*
       * A callback that changes identity on every render is
       * almost always an inline arrow. The warning names the
       * fix (useCallback) so it is actionable.
       */
      warned.current = true;
      console.warn(
        "[r3f-adapters] useFrameAdapter received a new callback " +
          "on every render. Wrap it in useCallback to avoid " +
          "re-subscribing the frame loop each frame.",
      );
    }

    previous.current = callback;
  });
}

/* -------------------------------------------------------------------------- */
/* Production adapters                                                        */
/* -------------------------------------------------------------------------- */

function useProductionThree(): RootState {
  return useRealThree();
}

/**
 * The production `useFrame` delegate.
 *
 * This is a hook (it calls `useRealFrame`), so it must be
 * invoked during render. The inner wrapper converts our
 * narrowed `FrameStateLike` callback into the wider
 * `RootState` callback R3F expects — required because
 * parameter types are contravariant and `RootState` is a
 * superset of `FrameStateLike`.
 *
 * The wrapper is memoized on the caller's `callback` so the
 * closure identity is stable across renders as long as the
 * caller memoizes its own callback. R3F keys its internal
 * subscription on callback identity, so this is what keeps
 * us from re-registering every frame.
 */
function useProductionFrame(
  callback: (state: FrameStateLike) => void,
): void {
  const wrapped = useCallback(
    (state: RootState): void => {
      callback(state);
    },
    [callback],
  );

  useRealFrame(wrapped);
}

const productionAdapters: R3FAdapters = {
  useFrame: useProductionFrame,
  useThree: useProductionThree,
};

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export interface R3FAdaptersProviderProps {
  /**
   * Optional override. When omitted, the provider installs
   * the production adapters (which delegate to
   * `@react-three/fiber`). When supplied, the values are
   * used as-is — this is the test entry point.
   */
  readonly adapters?: R3FAdapters;

  readonly children: ReactNode;
}

/**
 * Provides R3F adapters to every consumer below it.
 *
 * In production, `<R3FAdaptersProvider>` is mounted inside
 * the `<Canvas>` element, immediately wrapping the scene. Its
 * default `adapters` prop delegates to the real R3F hooks.
 *
 * In tests, the component is mounted with an explicit
 * `adapters` prop holding fakes. No `<Canvas>` is required.
 */
export function R3FAdaptersProvider({
  adapters = productionAdapters,
  children,
}: R3FAdaptersProviderProps): ReactElement {
  return (
    <R3FAdaptersContext.Provider value={adapters}>
      {children}
    </R3FAdaptersContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Consumer hooks                                                             */
/* -------------------------------------------------------------------------- */

function useAdapters(): R3FAdapters {
  const adapters = useContext(R3FAdaptersContext);

  if (!adapters) {
    throw new Error(
      "R3F adapters are not available. Wrap the calling " +
        "component in <R3FAdaptersProvider>.",
    );
  }

  return adapters;
}

/**
 * Subscribe a callback to the render loop.
 *
 * Delegates to whichever `useFrame` the nearest
 * `<R3FAdaptersProvider>` supplies. In production that is
 * R3F's real hook; in tests it is a fake that can drive the
 * callback manually.
 *
 * In dev, warns once per component if `callback` changes
 * identity on every render — the most common cause of an
 * accidentally re-subscribing frame loop.
 */
export function useFrameAdapter(
  callback: (state: FrameStateLike) => void,
): void {
  const { useFrame } = useAdapters();

  useWarnIfUnstable(callback);

  useFrame(callback);
}

/**
 * Read the R3F root state.
 *
 * Delegates to whichever `useThree` the nearest
 * `<R3FAdaptersProvider>` supplies.
 */
export function useThreeAdapter(): RootState {
  const { useThree } = useAdapters();
  return useThree();
}