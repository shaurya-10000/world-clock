"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import ThreeGlobe from "three-globe";

import { COUNTRY_FEATURES } from "@/lib/geo";
import { GLOBE_SCALE } from "@/lib/globe-geometry";

import {
  POLYGON_ALTITUDE,
  POLYGON_CAP_COLOR,
  POLYGON_SIDE_COLOR,
  POLYGON_STROKE_COLOR,
} from "./constants";

/* -------------------------------------------------------------------------- */
/* Resource disposal                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Dispose the GPU resources of a single three.js object.
 *
 * ## What is disposed
 *
 *   - The geometry, if the object is a mesh with one. Textures
 *     referenced by materials are not disposed here — they are
 *     owned by the texture loader and cached across mounts.
 *
 *   - Each material, whether it is a single material or an
 *     array of them. `three-globe` builds multi-material meshes
 *     for polygons with distinct cap/side/stroke rendering.
 *
 * ## Why the null guards
 *
 * `three-globe`'s scene graph is not guaranteed to contain
 * well-formed meshes. It can contain `Group`, `Points`, and
 * `Line` objects (no `material` field), and it can contain
 * meshes whose material is `null` if a placeholder was
 * constructed without one. The guards make the cleanup total
 * rather than throwing on any object that is not a
 * fully-formed mesh.
 *
 * ## Order of operations
 *
 * Geometry first, then materials. The order does not affect
 * correctness — they are independent GPU resources — but
 * grouping all geometry disposals before all material
 * disposals is easier to reason about than interleaving them.
 *
 * Exported for direct testing.
 */
export function disposeObject(object: THREE.Object3D): void {
  if (!(object instanceof THREE.Mesh)) return;

  object.geometry?.dispose?.();

  const material = object.material;

  if (Array.isArray(material)) {
    for (const m of material) {
      m?.dispose?.();
    }
  } else {
    material?.dispose?.();
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Country borders rendered via three-globe.
 *
 * three-globe is used here for one feature only: drawing country
 * outlines as polygons on a sphere. The sphere itself is rendered
 * by `EarthSphere`, and markers are rendered by `GlobeMarker`.
 * Keeping this concern isolated means a future migration away
 * from three-globe touches only this file.
 *
 * ## Lifecycle
 *
 *   - On mount, a `ThreeGlobe` instance is constructed,
 *     configured with the country features, and stored in
 *     component state.
 *
 *   - The instance is attached to the scene via `<primitive>`.
 *
 *   - On unmount, geometries and materials are disposed
 *     explicitly. R3F does not dispose objects passed via
 *     `<primitive>`, so this cleanup is mandatory to avoid
 *     leaking on route changes.
 *
 * ## Why the instance lives in state, not a ref
 *
 * A ref does not trigger re-renders, so a component whose only
 * state is "the globe was created" needs a separate boolean to
 * force the render that attaches the primitive. Storing the
 * instance itself in state gives us both the trigger and the
 * value in a single hook, and removes the need for a memo or an
 * exhaustive-deps suppression.
 *
 * ## Why not a lazy `useState` initializer
 *
 * `useState(() => new ThreeGlobe(...))` would construct the
 * instance during the initial render — including during SSR.
 * `three-globe` reads `window` and `document` on construction,
 * so the lazy initializer would crash on the server. The
 * `useEffect` + `setGlobe` pattern is what makes this component
 * SSR-safe: the instance is only constructed after React has
 * committed, which only happens in the browser.
 *
 * ## Why the `setGlobe` call is exempt from the
 * `react-hooks/set-state-in-effect` rule
 *
 * This effect is a documented exception to the rule. React's
 * own guidance ("You Might Not Need an Effect" →
 * "Fetching data" / "Building an external resource") allows
 * an effect to construct an external system, store the
 * resulting object in state, and dispose it in the cleanup.
 * The rule flags the `setState`, but the alternative —
 * constructing during render — is impossible here because
 * the constructor touches `window` and `document`, which do
 * not exist during SSR.
 *
 * The disable comment is scoped to the single `setGlobe`
 * line. Removing it without a real architectural change
 * (e.g. moving to a client-only code-split boundary that
 * guarantees the component never renders on the server)
 * would either break SSR or reintroduce the leak.
 *
 * ## Effect dependencies
 *
 * The construction effect has an empty dependency array. It
 * must run exactly once. If it re-ran on any prop or state
 * change, a new `ThreeGlobe` instance would be built on every
 * render — leaking the previous one, replacing the primitive
 * mid-frame, and resetting the polygon layer. The cleanup
 * function returned by the effect disposes the instance on
 * unmount, which is the only time it should be torn down.
 *
 * @example
 * ```tsx
 * <Canvas>
 *   <CountryPolygons />
 * </Canvas>
 * ```
 */
export default function CountryPolygons() {
  const [globe, setGlobe] = useState<ThreeGlobe | null>(null);

  useEffect(() => {
    const instance = new ThreeGlobe({ animateIn: false });

    /* The base sphere is rendered by EarthSphere. */
    instance.showGlobe(false);

    instance
      /*
       * `three-globe` types `polygonsData` as `object[]`, while
       * `COUNTRY_FEATURES` is a GeoJSON `FeatureCollection`.
       *
       * The cast is unavoidable at the public API boundary. A
       * "remove the cast" refactor would fail compilation
       * because `CountryFeature` does not satisfy
       * `three-globe`'s internal expectations about the
       * `properties` field — the library assumes a specific
       * shape that `lib/geo.ts` deliberately leaves as
       * `unknown`.
       *
       * The runtime value is correct: `three-globe` reads
       * `geometry` and ignores `properties` for the polygon
       * rendering this component uses. Every consumer of
       * `COUNTRY_FEATURES` reads it through the typed surface
       * declared in `lib/geo.ts`, so the cast is contained to
       * this one call site.
       */
      .polygonsData(COUNTRY_FEATURES as unknown as never[])
      .polygonCapColor(() => POLYGON_CAP_COLOR)
      .polygonSideColor(() => POLYGON_SIDE_COLOR)
      .polygonStrokeColor(() => POLYGON_STROKE_COLOR)
      .polygonAltitude(POLYGON_ALTITUDE);

    instance.scale.setScalar(GLOBE_SCALE);

    /*
     * Constructing a `ThreeGlobe` requires `window` and
     * `document`, so this cannot be done during render (SSR
     * would crash). Storing the instance in state is the
     * documented pattern for "build an external resource
     * once, after commit, and clean it up on unmount".
     *
     * https://react.dev/learn/you-might-not-need-an-effect#building-an-external-resource
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- constructing an external resource after commit; cannot run during SSR
    setGlobe(instance);

    return () => {
      instance.clear();

      instance.traverse(disposeObject);
    };
  }, []);

  if (!globe) return null;

  return <primitive object={globe} />;
}