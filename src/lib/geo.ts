/**
 * Typed access to world-atlas country geometry.
 *
 * `topojson-client` ships with broad generic signatures that
 * do not match its runtime behavior, and `world-atlas` is a
 * raw JSON import with no schema. Both mismatches are absorbed
 * here once, exposing a stable, strongly-typed surface to the
 * rest of the application.
 *
 * The exposed types are the minimum subset the globe reads.
 * If a future feature needs additional GeoJSON fields, extend
 * `CountryFeature` rather than widening to `any` — the
 * boundary has to remain narrow or it stops being useful.
 */

import { feature } from "topojson-client";
import countries from "world-atlas/countries-110m.json";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A GeoJSON Feature, narrowed to what the globe uses.
 *
 * `properties` is deliberately `unknown` rather than a
 * concrete shape. `world-atlas` does not document its
 * property schema, and the globe keys polygons by index
 * rather than by ISO code, so the properties are never read.
 * Typing them would create a maintenance obligation to track
 * a schema this module has no reason to depend on.
 */
export interface CountryFeature {
  readonly type: "Feature";
  readonly id?: string | number;
  readonly properties: unknown;
  readonly geometry: {
    readonly type: string;
    readonly coordinates: unknown;
  };
}

export interface CountryFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly CountryFeature[];
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The country polygons, decoded once at module load.
 *
 * Module-scoped rather than exposed through a function. The
 * atlas is roughly 100KB of static data; decoding it on every
 * mount would produce identical output and cost a few
 * milliseconds each time. Consumers pay the decode cost once
 * when this module is first imported.
 *
 * The reference is stable across the page lifetime, which
 * means React can use it as a `useMemo` or `useEffect`
 * dependency without triggering spurious re-runs.
 */
export const COUNTRY_FEATURES: readonly CountryFeature[] =
  decodeCountryFeatures();

function decodeCountryFeatures(): readonly CountryFeature[] {
  /*
   * `feature()` returns either a single Feature or a
   * FeatureCollection depending on the topology object it is
   * passed. For a TopologyCollection — which `countries` is —
   * it always returns a FeatureCollection. TypeScript cannot
   * narrow that union from the argument shape, so the cast
   * has to be explicit.
   *
   * The casts are confined to this one expression. Every
   * consumer of `COUNTRY_FEATURES` reads the typed surface
   * declared above.
   */
  const collection = feature(
    countries as never,
    countries.objects.countries as never,
  ) as unknown as CountryFeatureCollection;

  return collection.features;
}