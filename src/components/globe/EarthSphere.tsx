"use client";

import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { GLOBE_RADIUS } from "@/lib/globe-geometry";
import { useFrameAdapter } from "@/lib/r3f-adapters";

import {
  SPHERE_SEGMENTS,
  SURFACE_FADE_END,
  SURFACE_FADE_START,
} from "./constants";
import { getSunDirectionInGlobeFrame } from "./solarContext";

/* -------------------------------------------------------------------------- */
/* Shaders                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Lighting frame: the sun uniform is in the globe's geography
 * frame, so it is compared against the LOCAL normal. The mesh
 * lives inside the rotating globe group, so as the user drags,
 * the geography (and its local normals) rotates while the sun
 * stays put in the geography frame — the terminator tracks
 * real time. Do NOT use modelMatrix here.
 */
export const VERTEX_SHADER = `
  varying vec3 vLocalNormal;

  void main() {
    vLocalNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const FRAGMENT_SHADER = `
  uniform vec3 uSunDirection;
  uniform float uOpacity;
  varying vec3 vLocalNormal;

  void main() {
    float d = dot(normalize(vLocalNormal), normalize(uSunDirection));

    vec3 night = vec3(0.016, 0.024, 0.039);
    vec3 day = vec3(0.086, 0.114, 0.149);

    float t = smoothstep(-0.12, 0.22, d);
    vec3 color = mix(night, day, t);

    float rim = smoothstep(0.0, 0.14, d) *
                (1.0 - smoothstep(0.14, 0.55, d));

    color += vec3(1.0, 0.52, 0.22) * rim * 0.18;

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

export function createUniforms(): {
  uSunDirection: { value: THREE.Vector3 };
  uOpacity: { value: number };
} {
  return {
    uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
    uOpacity: { value: 1 },
  };
}

/**
 * Opacity of the minimal shader sphere as a function of camera
 * distance.
 *
 * ## Direction of the fade
 *
 * The minimal sphere is *opaque* when the camera is far away
 * (`>= SURFACE_FADE_START`) and *transparent* when it is close
 * (`<= SURFACE_FADE_END`). It exists as the wide-shot surface;
 * the realistic textured sphere underneath becomes the visible
 * surface as the user zooms in to inspect a city.
 *
 * Do not invert this. A future refactor that swapped the two
 * endpoints would make the minimal sphere vanish at distance
 * and the realistic sphere take over the wide shot — the
 * exact opposite of the visual design.
 *
 * ## Degenerate span
 *
 * The span is guarded against a non-positive range so a future
 * retuning of the two constants that accidentally inverts them
 * degrades to "hide the minimal sphere" rather than producing
 * `Infinity` or `NaN`.
 *
 * @param cameraDistance - The camera's distance from the globe
 *   center, in world units.
 * @returns A value in `[0, 1]`.
 */
export function computeSurfaceOpacity(
  cameraDistance: number,
): number {
  if (cameraDistance >= SURFACE_FADE_START) return 1;
  if (cameraDistance <= SURFACE_FADE_END) return 0;

  const span = SURFACE_FADE_START - SURFACE_FADE_END;
  if (span <= 0) return 0;

  return (cameraDistance - SURFACE_FADE_END) / span;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The day/night/rim color at a given sun-dot-normal value.
 *
 * Mirrors the fragment shader's arithmetic so the same colors
 * can be asserted in unit tests without a GPU. `d` is the dot
 * product of the surface normal and the sun direction; `-1`
 * is the antisolar point, `+1` the subsolar point.
 *
 * The `smoothstep` calls are not clamped against `d` being
 * outside `[-1, 1]`, which matches the shader — values past
 * the endpoints saturate at the endpoint color rather than
 * propagating an out-of-range value.
 */
export function computeDayNightColor(
  d: number,
): [number, number, number] {
  const night: [number, number, number] = [0.016, 0.024, 0.039];
  const day: [number, number, number] = [0.086, 0.114, 0.149];

  const t = smoothstep(-0.12, 0.22, d);
  const base: [number, number, number] = [
    night[0] + (day[0] - night[0]) * t,
    night[1] + (day[1] - night[1]) * t,
    night[2] + (day[2] - night[2]) * t,
  ];

  const rim =
    smoothstep(0.0, 0.14, d) * (1 - smoothstep(0.14, 0.55, d));
  const rimColor: [number, number, number] = [1.0, 0.52, 0.22];
  const rimStrength = rim * 0.18;

  return [
    base[0] + rimColor[0] * rimStrength,
    base[1] + rimColor[1] * rimStrength,
    base[2] + rimColor[2] * rimStrength,
  ];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The minimal shader sphere.
 *
 * Renders a solid sphere whose color is computed entirely in a
 * `ShaderMaterial` — no textures, no PBR lighting, no scene
 * lights. The shader computes a day/night terminator from the
 * sun-direction uniform and adds a warm rim highlight at the
 * boundary. The result is a stylized planet rather than a
 * photorealistic one.
 *
 * ## Why a `ShaderMaterial` and not `MeshStandardMaterial`
 *
 * The minimal mode exists precisely to be cheap. A standard
 * material would bring in the full PBR pipeline (five texture
 * slots, environment lighting, tone mapping, shadow sampling)
 * for a surface that has no textures and no shadows. The
 * custom shader touches two uniforms and one varying — the
 * cheapest possible path to "a sphere that is lit from one
 * direction."
 *
 * ## Raycast opt-out
 *
 * The mesh declares `raycast={() => null}` so it is invisible
 * to R3F's raycaster. Without this, every pointer move over
 * the globe triggers an intersection test against the sphere's
 * full triangle count (~18k at `SPHERE_SEGMENTS = 96`). The
 * sphere is not clickable — markers are — so the test is pure
 * wasted work.
 *
 * `raycast` is the *only* prop R3F consults to decide whether
 * a mesh participates in pointer events. `pointer-events-none`
 * and `onPointerOver={undefined}` do not remove the mesh from
 * the raycast pass; the override function does. Removing this
 * line is a real perf regression, not a cosmetic change.
 *
 * ## Transparency and the fade
 *
 * The sphere is rendered with `transparent` and
 * `depthWrite` enabled. Depth *write* is important here: the
 * minimal sphere and the realistic sphere occupy the same
 * world position, and the marker meshes sit slightly above
 * both. Depth-writing the minimal sphere keeps markers from
 * being occluded by it during the crossfade. (The realistic
 * sphere also depth-writes.) Markers additionally set
 * `renderOrder={3}` to guarantee they render last in the
 * transparent pass.
 *
 * ## Frame callback stability
 *
 * The callback passed to `useFrameAdapter` is memoized with an
 * empty `useCallback`. It reads only refs and module-level
 * functions — `materialRef`, `cameraRef`,
 * `getSunDirectionInGlobeFrame`, `computeSurfaceOpacity` — so
 * there is nothing it needs to re-close over when the component
 * re-renders.
 *
 * This is not a micro-optimization. R3F keys its frame-loop
 * subscription on callback identity; an unstable callback
 * causes R3F to unsubscribe and resubscribe on every render.
 * And `useFrameAdapter`'s `useWarnIfUnstable` dev check fires
 * when the identity changes on every render — which is exactly
 * what the previous version of this file did.
 *
 * ## Frame callback body
 *
 * Both the sun-direction and the opacity uniforms are updated
 * inside the same callback, in that order. This is deliberate:
 * they are independent updates that share a frame boundary, and
 * splitting them across two `useFrame` subscriptions would
 * double the per-frame callback overhead for two writes that
 * each cost nanoseconds. The order (sun, then opacity) does
 * not matter, but keeping them adjacent makes the intent
 * clear.
 *
 * ## Geometry and material lifetime
 *
 * Both are disposed on unmount. Unlike textures (which three.js
 * caches by URL and R3F's `useLoader` reuses across mounts),
 * geometry and material instances are per-mount and must be
 * freed. The dependency array `[geometry]` on the cleanup
 * effect is effectively a mount/unmount trigger, since
 * `geometry` is memoized with `[]` — it exists so a future
 * change that makes the geometry depend on a prop re-disposes
 * the old one.
 */
export interface EarthSphereProps {
  /**
   * When `true`, the sphere fades out as the camera approaches
   * (see {@link computeSurfaceOpacity}), revealing whatever is
   * rendered underneath it.
   *
   * Defaults to `false`. In minimal mode `GlobeScene` mounts
   * this sphere *instead of* `RealisticEarthSphere`, so nothing
   * sits underneath it. Fading it there makes the globe turn
   * see-through when the camera steps in on a city selection
   * (3.6 -> 3.2 gives roughly 43% opacity), exposing the far
   * side of the country polygons and the terminator. Only
   * enable this if a textured sphere is mounted beneath.
   */
  readonly fadeWithDistance?: boolean;
}

export default function EarthSphere({
  fadeWithDistance = false,
}: EarthSphereProps = {}) {
  const geometry = useMemo(
    () =>
      new THREE.SphereGeometry(
        GLOBE_RADIUS,
        SPHERE_SEGMENTS,
        SPHERE_SEGMENTS,
      ),
    [],
  );

  const materialRef = useRef<THREE.ShaderMaterial>(null);

  /*
   * The uniforms object is memoized once and never replaced.
   * Three.js recompiles a `ShaderMaterial` when its `uniforms`
   * prop changes identity, so a fresh object on every render
   * would trigger a shader recompile every frame. Memoizing it
   * is not an optimization; it is a correctness requirement.
   */
  const uniforms = useMemo(() => createUniforms(), []);

  /*
   * Read through a ref so the frame callback below can stay
   * identity-stable (`useCallback([])`).
   */
  const fadeRef = useRef(fadeWithDistance);
  useEffect(() => {
    fadeRef.current = fadeWithDistance;
  }, [fadeWithDistance]);

  const { camera } = useThree();
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  /*
   * The frame callback.
   *
   * Memoized with `useCallback([])` because the closure reads
   * only refs and module-level functions — there is nothing
   * that should change its identity between renders. R3F keys
   * its subscription on this identity; an unstable callback
   * resubscribes every frame. See the component header,
   * "Frame callback stability", for the full reasoning.
   */
  const onFrame = useCallback(() => {
    const material = materialRef.current;
    if (!material) return;

    /*
     * Upload the geography-frame sun direction unmodified. The
     * vertex shader passes the LOCAL normal, so both operands
     * are in the same frame. No quaternion is applied anywhere.
     */
    const sunUniform = material.uniforms?.uSunDirection?.value as
      | THREE.Vector3
      | undefined;

    if (sunUniform) {
      const sun = getSunDirectionInGlobeFrame();
      sunUniform.set(sun.x, sun.y, sun.z);
    }

    const opacityUniform = material.uniforms?.uOpacity as
      | { value: number }
      | undefined;

    if (opacityUniform) {
      if (fadeRef.current) {
        const distance = cameraRef.current.position.length();
        opacityUniform.value = computeSurfaceOpacity(distance);
      } else {
        opacityUniform.value = 1;
      }
    }
  }, []);

  useFrameAdapter(onFrame);

  useEffect(
    () => () => {
      geometry.dispose();
      materialRef.current?.dispose();
    },
    [geometry],
  );

  return (
    <mesh geometry={geometry} raycast={() => null}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite
      />
    </mesh>
  );
}