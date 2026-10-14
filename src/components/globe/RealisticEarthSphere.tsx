"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { GLOBE_RADIUS } from "@/lib/globe-geometry";
import { getSunDirection } from "@/lib/solar";

import {
  ATMOSPHERE_RIM_COLOR,
  ATMOSPHERE_RIM_OPACITY,
  ATMOSPHERE_RIM_POWER,
  ATMOSPHERE_SHELL_SCALE,
  CLOUD_ALTITUDE,
  CLOUD_MAX_OPACITY,
  CLOUD_ROTATION_SPEED,
  CLOUD_ROUGHNESS,
  EARTH_BUMP_SCALE,
  EARTH_EMISSIVE_COLOR,
  EARTH_EMISSIVE_INTENSITY,
  EARTH_NIGHT_FILL_COLOR,
  EARTH_NIGHT_FILL_INTENSITY,
  EARTH_SUN_COLOR,
  EARTH_SUN_INTENSITY,
  EARTH_TEXTURE_ANISOTROPY,
  EARTH_TEXTURE_URLS,
  SPHERE_SEGMENTS,
} from "./constants";
import { resolveFrameDate } from "./frameDate";

/* -------------------------------------------------------------------------- */
/* Texture list                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The five Earth textures, in the order they are passed to
 * `useLoader`.
 *
 * **Must be a module-level constant.** `useLoader` memoizes on
 * the *identity* of the URL array. A fresh array literal on
 * every render would defeat the memo and re-load every texture
 * every frame — a silent, catastrophic performance bug that
 * would only be visible as continuous network traffic in the
 * devtools Network panel. Do not inline this array, and do not
 * move it inside the component.
 *
 * Order matches the destructure below: albedo, bump, water,
 * emissive (night), clouds.
 */
const EARTH_TEXTURE_URLS_LIST = [
  EARTH_TEXTURE_URLS.map,
  EARTH_TEXTURE_URLS.bumpMap,
  EARTH_TEXTURE_URLS.waterMap,
  EARTH_TEXTURE_URLS.emissiveMap,
  EARTH_TEXTURE_URLS.cloudMap,
] as const;

/* -------------------------------------------------------------------------- */
/* Texture-frame alignment                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Y-axis rotation applied to the entire realistic globe group
 * to align the albedo texture's prime meridian with the frame
 * that `locationToPosition` (and therefore every marker,
 * polygon, and terminator computation) uses.
 *
 * **The mismatch.** Three.js's built-in `SphereGeometry`
 * generates UVs with `u = 0` at the `-X` axis and the seam
 * running down the back of the sphere. An equirectangular Earth
 * texture mapped onto that sphere places its left edge
 * (longitude 180°W) at `-X` — not at `+Z` where the rest of
 * this codebase expects longitude 0° to be.
 *
 * `three-globe`, which drives `CountryPolygons`, compensates
 * for this internally. The minimal shader globe doesn't care,
 * because its appearance is driven by the sun direction
 * uniform and a day/night gradient — no texture, no UVs, no
 * frame.
 *
 * That leaves `RealisticEarthSphere` as the only surface whose
 * *visual* output depends on the UV frame. Without the
 * correction below, the realistic globe's continents appear
 * rotated ~90° about Y relative to where `locationToPosition`
 * says every city is. Markers land in the correct place on the
 * minimal globe and the wrong place on the realistic one.
 *
 * **Scope: geometry only.** The `<directionalLight>` inside
 * this group is *also* subject to the group's rotation,
 * because a light's `position` is expressed in its parent's
 * local frame. If the sun direction were assigned directly to
 * the light's position — a world-space vector going into a
 * rotated local frame — the light would end up rotated by
 * this constant a second time, and the day/night terminator
 * would be 90° off from where the geography is. The per-frame
 * light update below compensates by rotating the world sun by
 * the inverse of this value before assigning it. See
 * `applySunToLight`.
 *
 * **Why `-π/2`.** Rotating the group `-90°` about Y moves the
 * texture's `u = 0` seam from `-X` to `+Z`, which is the axis
 * `locationToPosition` uses for longitude 0°. If your
 * `albedo.jpg` was authored with a different convention —
 * some NASA derivatives are center-prime-meridian rather than
 * left-edge — the correct value may be `0`, `+π/2`, or `π`.
 * Verify by selecting a landmark city with a distinctive
 * coastline (Tokyo, London, Cape Town) and checking that the
 * marker sits on the visible landmass. This is a fragile
 * invariant with no automated guard today.
 */
const TEXTURE_FRAME_ROTATION_Y = -Math.PI / 2;

/**
 * The inverse of `TEXTURE_FRAME_ROTATION_Y`, precomputed.
 *
 * Applied to the world-space sun direction before it is written
 * into the directional light's `position`, which lives in the
 * rotated group's local frame. Because the group's rotation is
 * a constant, its inverse is also a constant.
 */
const INVERSE_TEXTURE_FRAME_ROTATION_Y = -TEXTURE_FRAME_ROTATION_Y;

/* -------------------------------------------------------------------------- */
/* Shader source                                                              */
/* -------------------------------------------------------------------------- */

export const ATMOSPHERE_VERTEX_SHADER = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const ATMOSPHERE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPower;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - abs(dot(normalize(vWorldNormal), viewDir));
    float rim = pow(fresnel, uPower);

    gl_FragColor = vec4(uColor, rim * uOpacity);
  }
`;

/* -------------------------------------------------------------------------- */
/* Module-scope scratch                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Constant `+Y` axis, reused for every per-frame rotation.
 *
 * A module-level constant rather than a per-call `new
 * THREE.Vector3(0, 1, 0)` because `applySunToLight` runs every
 * frame and the allocation is pure churn.
 */
const UP_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Scratch vector for the world-space sun inside
 * `applySunToLight`.
 *
 * `applySunToLight` runs once per frame while the realistic
 * globe is mounted. Allocating a fresh `Vector3` there — as
 * the previous implementation did — is 60 allocations per
 * second of pure garbage, which on a low-end device is exactly
 * the kind of thing that shows up as frame-time jitter during
 * a GC pause. One module-scope vector, reused, eliminates it.
 *
 * Module-scope rather than component-scope because there is
 * exactly one realistic globe per scene and this file owns it.
 * If a second realistic globe ever renders in the same document,
 * these scratch vectors must become instance-scope refs — see
 * `GlobeControls`'s scratch quaternions for the same pattern
 * and the same caveat.
 */
const scratchSunWorld = new THREE.Vector3();

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Points a directional light at the sun.
 *
 * **Frame.** `light` is a child of the group rotated by
 * `TEXTURE_FRAME_ROTATION_Y`, so its `position` is in that
 * group's local frame. The `sun` argument is the world-space sun
 * direction from `getSunDirection()`. This function applies the
 * inverse of the group's rotation to the sun before assigning
 * it, so the light ends up pointing at the correct world-space
 * direction.
 *
 * Directional lights in three.js are positioned but not
 * targeted: the light direction is the vector from the light's
 * position to its target (which defaults to the origin).
 * Positioning the light along `sun * distance` therefore makes
 * the light travel toward the origin from the sun's direction —
 * i.e. it illuminates the hemisphere facing the sun. That's what
 * we want.
 *
 * **On the `distance` parameter.** For a directional light the
 * distance has no visual effect — only the *direction* of the
 * position vector matters. The parameter exists so the same
 * helper can be reused with a point or spot light, where the
 * distance does matter. Today the call site always uses the
 * default.
 *
 * **Allocation.** The world-space sun is written into a
 * module-scope scratch vector (`scratchSunWorld`) rather than
 * a fresh `Vector3`. See `scratchSunWorld`'s docstring for
 * why.
 *
 * @param light - The light to position.
 * @param sun - World-space sun direction. Need not be unit
 *   length; the `distance` multiplier is applied after the
 *   inverse rotation.
 * @param distance - Distance from the origin, in world units.
 */
export function applySunToLight(
  light: THREE.DirectionalLight,
  sun: { readonly x: number; readonly y: number; readonly z: number },
  distance = 10,
): void {
  scratchSunWorld.set(sun.x, sun.y, sun.z);

  /*
   * Rotate the world sun into the light's parent frame. See
   * `INVERSE_TEXTURE_FRAME_ROTATION_Y` for the reasoning.
   */
  scratchSunWorld.applyAxisAngle(
    UP_AXIS,
    INVERSE_TEXTURE_FRAME_ROTATION_Y,
  );

  light.position.set(
    scratchSunWorld.x * distance,
    scratchSunWorld.y * distance,
    scratchSunWorld.z * distance,
  );
}

/**
 * Advance the cloud layer's rotation by one frame.
 *
 * The delta is clamped to `[0, 0.25]` seconds. Two reasons:
 *
 *   1. When the tab is backgrounded, `requestAnimationFrame`
 *      stops firing but `clock.elapsedTime` keeps advancing.
 *      On resume, the first `dt` can be tens of seconds, which
 *      would jump the clouds by a visible amount. Clamping
 *      smooths the resume.
 *   2. A negative delta can occur after a clock reset. Clamping
 *      to zero treats it as a no-op rather than rewinding the
 *      cloud layer.
 *
 * Exported for testing. Pure; no THREE, no side effects.
 */
export function computeCloudRotation(
  currentRotation: number,
  deltaSeconds: number,
): number {
  const MAX_FRAME_DELTA_SECONDS = 0.25;
  const clamped = Math.min(
    Math.max(deltaSeconds, 0),
    MAX_FRAME_DELTA_SECONDS,
  );
  return currentRotation + CLOUD_ROTATION_SPEED * clamped;
}

/**
 * Builds the initial uniforms for the atmosphere shell's
 * `ShaderMaterial`.
 *
 * Exported for testing so a test can assert on the initial
 * uniform values without mounting an R3F scene.
 */
export function createAtmosphereUniforms(): {
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
  uPower: { value: number };
} {
  return {
    uColor: { value: new THREE.Color(ATMOSPHERE_RIM_COLOR) },
    uOpacity: { value: ATMOSPHERE_RIM_OPACITY },
    uPower: { value: ATMOSPHERE_RIM_POWER },
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Configure a loaded texture's color space and anisotropy.
 *
 * Kept as a module-level helper so the mutation happens on a
 * plain argument rather than directly on a value returned by
 * `useLoader` inside the component. Textures are shared,
 * cached three.js objects; configuring them in place is the
 * intended three.js usage.
 */
function configureTexture(
  texture: THREE.Texture,
  colorSpace: THREE.ColorSpace,
): void {
  texture.colorSpace = colorSpace;
  texture.anisotropy = EARTH_TEXTURE_ANISOTROPY;
}

/**
 * The realistic Earth sphere.
 *
 * Renders a PBR sphere textured with satellite imagery, a
 * rotating cloud layer, and an atmospheric rim shell.
 *
 * Textures load asynchronously via `useLoader`, which suspends.
 * The Suspense boundary lives in `GlobeSurface`
 * (`GlobeScene.tsx`), not here — a fallback rendered inside this
 * component would put a second sphere in the scene at the same
 * world position, producing the z-fighting artifact this file's
 * parent exists to prevent.
 *
 * **Frames.** The outer `<group>` applies a fixed Y rotation so
 * the albedo texture's prime meridian aligns with the frame
 * that `locationToPosition` uses. That rotation applies to every
 * child — including the `<directionalLight>`, whose `position`
 * is therefore expressed in the rotated group's local frame.
 * `applySunToLight` compensates by rotating the world-space sun
 * by the inverse of the group's rotation before assigning it.
 * See `TEXTURE_FRAME_ROTATION_Y` and `applySunToLight` for the
 * full reasoning.
 *
 * **Day/night behavior.** The sun direction comes from
 * `getSunDirection()` — the real subsolar point at the current
 * instant, or at the app-wide time override when one is active.
 * As the user drags the globe, geography rotates through a
 * terminator that is anchored to real time (or the override),
 * not to the camera. That is the whole point of the realistic
 * mode: a plausible Earth that is currently lit the way Earth
 * is currently lit.
 *
 * **Cloud rotation is real-time, not override-driven.** The
 * clouds advance with the R3F clock, not with the time
 * override. Cloud drift is a real-time visual, not a simulation
 * of cloud position at a specific moment — freezing them at
 * the override instant would make the globe look broken.
 *
 * **Texture lifetime.** The five textures produced by
 * `useLoader` are deliberately *not* disposed on unmount.
 * Three.js caches them by URL in `THREE.Cache`, and R3F's
 * `useLoader` hands out the same instance to a subsequent
 * mount. Disposing them here would break texture reuse across
 * a visual-mode toggle, forcing a full network reload of all
 * five maps every time the user flips modes. The geometry
 * *is* disposed, because geometry is per-mount while textures
 * are per-URL.
 *
 * @example
 * ```tsx
 * <Suspense fallback={null}>
 *   <RealisticEarthSphere />
 * </Suspense>
 * ```
 */
export default function RealisticEarthSphere() {
  const [colorMap, bumpMap, waterMap, nightMap, cloudMap] = useLoader(
    THREE.TextureLoader,
    EARTH_TEXTURE_URLS_LIST as unknown as string[],
  );

  /*
   * Configure each texture's color space and anisotropy once
   * the loader has resolved. The five textures are not
   * interchangeable: `colorMap` and `nightMap` carry color
   * (sRGB), the other three carry data (linear). Getting this
   * wrong produces either washed-out albedo or an
   * over-sharpened bump — subtle enough to be missed in a
   * screenshot, obvious enough to look wrong in motion.
   */
  useEffect(() => {
    configureTexture(colorMap, THREE.SRGBColorSpace);
    configureTexture(bumpMap, THREE.NoColorSpace);
    configureTexture(waterMap, THREE.NoColorSpace);
    configureTexture(nightMap, THREE.SRGBColorSpace);
    configureTexture(cloudMap, THREE.NoColorSpace);
  }, [colorMap, bumpMap, waterMap, nightMap, cloudMap]);

  const geometry = useMemo(
    () =>
      new THREE.SphereGeometry(
        GLOBE_RADIUS,
        SPHERE_SEGMENTS,
        SPHERE_SEGMENTS,
      ),
    [],
  );

  const cloudGeometry = useMemo(
    () =>
      new THREE.SphereGeometry(
        GLOBE_RADIUS * (1 + CLOUD_ALTITUDE),
        SPHERE_SEGMENTS,
        SPHERE_SEGMENTS,
      ),
    [],
  );

  const atmosphereGeometry = useMemo(
    () =>
      new THREE.SphereGeometry(
        GLOBE_RADIUS * ATMOSPHERE_SHELL_SCALE,
        SPHERE_SEGMENTS,
        SPHERE_SEGMENTS,
      ),
    [],
  );

  const atmosphereUniforms = useMemo(() => createAtmosphereUniforms(), []);

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const previousTimeRef = useRef<number | null>(null);

  useFrame((state) => {
    /*
     * Time override. When an astronomical event is being
     * previewed, the sun direction must reflect that event's
     * instant, not the wall clock — otherwise the realistic
     * globe shows a terminator that disagrees with the minimal
     * globe, the atmospheric background, and every clock in
     * the app.
     *
     * The instant is resolved through the shared frame-date
     * seam so every sampler in the scene agrees on it.
     */
    const date = resolveFrameDate();

    const light = sunLightRef.current;
    if (light) {
      applySunToLight(light, getSunDirection(date));
    }

    /*
     * The cloud rotation still advances with the R3F clock,
     * not the override. See the component header for the
     * reasoning.
     */
    const cloud = cloudRef.current;
    if (cloud) {
      const now = state.clock.elapsedTime;
      const previous = previousTimeRef.current;
      if (previous !== null) {
        cloud.rotation.y = computeCloudRotation(
          cloud.rotation.y,
          now - previous,
        );
      }
      previousTimeRef.current = now;
    }
  });

  useEffect(
    () => () => {
      /*
       * Geometry is disposed; textures are not.
       *
       * The two differ in lifetime: geometry is created per
       * mount (via `useMemo` above) and must be freed, while
       * textures are cached by URL in `THREE.Cache` and
       * shared across mounts. Disposing a shared texture here
       * would force a network reload on the next visual-mode
       * toggle. See the component header for the full
       * reasoning.
       */
      geometry.dispose();
      cloudGeometry.dispose();
      atmosphereGeometry.dispose();
    },
    [geometry, cloudGeometry, atmosphereGeometry],
  );

  return (
    <group rotation={[0, TEXTURE_FRAME_ROTATION_Y, 0]}>
      <directionalLight
        ref={sunLightRef}
        intensity={EARTH_SUN_INTENSITY}
        color={EARTH_SUN_COLOR}
      />

      <ambientLight
        intensity={EARTH_NIGHT_FILL_INTENSITY}
        color={EARTH_NIGHT_FILL_COLOR}
      />

      <mesh geometry={geometry} renderOrder={0}>
        <meshStandardMaterial
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={EARTH_BUMP_SCALE}
          roughnessMap={waterMap}
          roughness={0.85}
          metalness={0.05}
          emissiveMap={nightMap}
          emissive={EARTH_EMISSIVE_COLOR}
          emissiveIntensity={EARTH_EMISSIVE_INTENSITY}
        />
      </mesh>

      <mesh ref={cloudRef} geometry={cloudGeometry} renderOrder={1}>
        <meshStandardMaterial
          alphaMap={cloudMap}
          transparent
          opacity={CLOUD_MAX_OPACITY}
          roughness={CLOUD_ROUGHNESS}
          metalness={0}
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>

      <mesh geometry={atmosphereGeometry} renderOrder={2}>
        <shaderMaterial
          vertexShader={ATMOSPHERE_VERTEX_SHADER}
          fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
          uniforms={atmosphereUniforms}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}