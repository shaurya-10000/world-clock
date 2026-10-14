/**
 * Injectable texture loader.
 *
 * `RealisticEarthSphere` needs five equirectangular maps on
 * mount. `@react-three/fiber`'s `useLoader` would be the
 * idiomatic choice, but it suspends — which means every test
 * that mounts the realistic globe would need a `<Suspense>`
 * boundary plus a resolved promise, and the tests in this
 * codebase are deliberately synchronous.
 *
 * Rather than thread Suspense through the whole suite, the
 * loading is behind a seam. In production the seam delegates
 * to `THREE.TextureLoader` (which wraps `Image` under the
 * hood). In tests it can be replaced with a fake that returns
 * fully-populated textures immediately, so the component's
 * mount path never awaits anything.
 *
 * The shape mirrors `lib/useNow.ts` and `lib/animation-deps.ts`:
 *
 *   - `get*Deps()` — read the current implementation.
 *   - `set*Deps()` — install a fake. Test-only.
 *   - `reset*Deps()` — restore production. Test-only.
 *
 * The production implementation is captured once at module
 * load and never re-read from `window` or `THREE`, so a test
 * that corrupts either cannot leave the module in a state
 * `reset` is unable to restore.
 *
 * ## Why not a React context
 *
 * The loader is not a value that changes over time and is not
 * consumed by more than one component. A context would require
 * wrapping the R3F tree in a provider, and R3F's reconciler
 * does not forward arbitrary React context the way the DOM
 * renderer does — the provider would need to live above
 * `<Canvas>`, which is the wrong scope for a globe-internal
 * concern. A module-level seam keeps the wiring local to the
 * file that uses it.
 *
 * ## Why `loadTexture` returns a `Promise` rather than taking
 * ## a callback
 *
 * Three.js's `TextureLoader.load` predates promises and uses
 * the callback/error-callback pair. Re-wrapping it as a
 * `Promise` here — once, at the seam — means every caller
 * downstream (including any future second consumer) uses the
 * same `await`-or-`catch` shape instead of re-implementing
 * the callback bridge.
 *
 * The promise rejects with the underlying error rather than
 * a wrapped one. There is nothing useful for this module to
 * add on top of a network or decode error; a caller that
 * wants to enrich the error can do so at the call site where
 * it knows which texture failed.
 */

import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The texture-loading primitives the realistic globe depends
 * on.
 *
 * Deliberately a single method: the component never loads a
 * texture outside of a batch, and every batch wants the same
 * callback shape (settle-or-reject). Splitting the interface
 * further would only produce more keys to override in tests
 * without buying anything.
 */
export interface TextureLoaderDeps {
  /**
   * Load a texture from a URL.
   *
   * Resolves with a fully-initialized `THREE.Texture`. Rejects
   * with the underlying error if the image fails to decode or
   * the network request fails.
   *
   * The returned texture's `colorSpace`, `wrapS`, `wrapT`, and
   * `flipY` are the loader's responsibility — callers receive
   * a texture ready to assign to a material slot.
   */
  readonly loadTexture: (url: string) => Promise<THREE.Texture>;
}

/* -------------------------------------------------------------------------- */
/* Production implementation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The production `loadTexture`.
 *
 * A fresh `THREE.TextureLoader` per call rather than a shared
 * instance. The loader is stateless and cheap to construct;
 * sharing one would be a micro-optimization that couples the
 * five concurrent loads to a single object for no benefit.
 *
 * `colorSpace` is set to `SRGBColorSpace` on every texture
 * here, but the caller is expected to override it for data
 * maps (normal, roughness, metalness), which must stay in
 * linear space. Doing it in the caller rather than here keeps
 * the seam free of per-map knowledge — the seam loads a
 * texture, the component decides what the texture *means*.
 *
 * `flipY` is left at three's default (`true`). Equirectangular
 * Earth maps are authored with the north pole at the top of
 * the image; three's default UV convention matches that when
 * `flipY` is true, and the sphere's `SphereGeometry` UV layout
 * is authored the same way.
 *
 * Rejects with the underlying error. Three's `onError` callback
 * receives whatever the underlying `Image` produced — typically
 * an `ErrorEvent` or a `ProgressEvent` for network failures.
 * The promise rejects with that value unmodified.
 */
function productionLoadTexture(url: string): Promise<THREE.Texture> {
  return new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();

    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      (error) => {
        reject(error);
      },
    );
  });
}

/**
 * The production dependency object.
 *
 * Captured once at module load. Every `resetTextureLoaderDeps`
 * call restores this exact object — not a newly-built one — so
 * a test that holds a reference to the production deps (for
 * example, one that installs a partial fake and then asserts on
 * the untouched keys) sees the same identity throughout.
 */
const productionDeps: TextureLoaderDeps = {
  loadTexture: productionLoadTexture,
};

/**
 * The current dependency object.
 *
 * Reassigned by `setTextureLoaderDeps` and
 * `resetTextureLoaderDeps`. Always an object that satisfies
 * `TextureLoaderDeps` in full — `set` fills in any keys the
 * caller omitted from `productionDeps`, so `deps` is never a
 * partial.
 */
let deps: TextureLoaderDeps = productionDeps;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Replace some or all of the texture-loading primitives.
 *
 * Unspecified keys fall back to their production values, so a
 * test that only needs a fake loader can pass just
 * `{ loadTexture }` and leave everything else at production.
 *
 * Test-only. Production code should never call this.
 *
 * @param next - The partial override. Any key not present is
 *   taken from `productionDeps`.
 */
export function setTextureLoaderDeps(
  next: Partial<TextureLoaderDeps>,
): void {
  deps = { ...productionDeps, ...next };
}

/**
 * Restore the production primitives.
 *
 * Test-only. Call this in an `afterEach` so a fake installed by
 * one test does not leak into the next.
 *
 * Restores the *same object reference* as the initial state,
 * not a clone. A test that captured `getTextureLoaderDeps()`
 * before installing a fake and then re-reads after calling this
 * gets the identical object back.
 */
export function resetTextureLoaderDeps(): void {
  deps = productionDeps;
}

/**
 * Read the current texture-loading primitives.
 *
 * Consumers should call this once at the top of the effect
 * that loads a batch and hold the reference for the duration
 * of that batch. That way a test that swaps the deps
 * mid-batch does not corrupt an in-flight load.
 *
 * The returned object is the live singleton — do not mutate
 * it. To change the primitives, call `setTextureLoaderDeps`.
 */
export function getTextureLoaderDeps(): TextureLoaderDeps {
  return deps;
}