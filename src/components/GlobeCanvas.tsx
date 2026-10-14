"use client";

import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";

import type {
  GlobeTier,
  WorldLocation,
} from "@/lib/locations";
import { R3FAdaptersProvider } from "@/lib/r3f-adapters";
import type { SolarState } from "@/lib/useSolarState";

import CameraDistanceSampler from "./globe/CameraDistanceSampler";
import CameraDriver from "./globe/CameraDriver";
import GlobeAtmosphereSampler from "./globe/GlobeAtmosphereSampler";
import GlobeScene from "./globe/GlobeScene";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  INITIAL_CAMERA_DISTANCE,
  RENDERER_TONE_MAPPING_EXPOSURE,
  type GlobeVisualMode,
} from "./globe/constants";

/* -------------------------------------------------------------------------- */
/* Re-exports                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Re-exported so consumers of `GlobeCanvas` can refer to the
 * visual-mode union without reaching into `globe/constants`
 * directly. This is the one type that appears in the
 * component's own prop signature; everything else the
 * component reads from `globe/constants` is internal.
 */
export type { GlobeVisualMode };

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface GlobeCanvasProps {
  reducedMotion: boolean;
  selectedLocationId: string | null;
  globeTier: GlobeTier;
  visualMode: GlobeVisualMode;

  /**
   * Current camera distance from the globe's center, in world
   * units. Owned by `Globe.tsx` and driven by the size stepper
   * and the wheel/pinch handler. The value is passed to
   * `CameraDriver`, which mutates the R3F camera to match.
   *
   * It is **not** passed down to `GlobeScene`. The scene reads
   * the live camera position from `cameraDistanceRef`, which
   * `CameraDistanceSampler` maintains — one writer, one
   * reader, no prop drilling.
   */
  cameraDistance?: number;

  onLocationSelect: (location: WorldLocation) => void;
  onSolarChange: (state: SolarState) => void;

  /**
   * Publishes the `resetNorth` callback from `GlobeScene` up to
   * `Globe.tsx`'s compass button. Fires once with the callback
   * and once with `null` on unmount.
   */
  onResetNorthReady?: (resetNorth: (() => void) | null) => void;

  /**
   * Fired by `GlobeControls` when the user scrolls or pinches.
   * `-1` zooms in, `+1` zooms out.
   */
  onStepCamera?: (direction: -1 | 1) => void;
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The R3F canvas.
 *
 * ## Composition
 *
 * The canvas hosts four kinds of children:
 *
 *   - **`GlobeScene`**, wrapped in `R3FAdaptersProvider`. The
 *     scene's consumers read `useFrameAdapter` and
 *     `useThreeAdapter` from the adapter context, which the
 *     provider installs. Tests can inject fakes through the
 *     same provider.
 *
 *   - **`CameraDriver`**, which mutates the R3F camera to
 *     match the `cameraDistance` prop. Uses R3F's real
 *     `useThree`; does not read the adapter context.
 *
 *   - **`CameraDistanceSampler`**, which publishes the live
 *     camera distance to `cameraDistanceRef` every frame.
 *
 *   - **`GlobeAtmosphereSampler`**, which publishes the
 *     visible hemisphere's atmosphere to
 *     `globeAtmosphereRef` on a throttle. Both samplers use
 *     R3F's real hooks directly.
 *
 * ## Why the samplers are outside the adapter provider
 *
 * `CameraDriver`, `CameraDistanceSampler`, and
 * `GlobeAtmosphereSampler` are deliberately **outside** the
 * adapter provider. They are infrastructure — they serve the
 * scene, not the other way around — and they depend only on
 * R3F's own context. Keeping them outside the provider makes
 * that dependency shape visible in the tree.
 *
 * ## Why the child order matters
 *
 * R3F mounts children in document order. Each of the three
 * non-scene children is a writer to a shared ref that other
 * parts of the system read:
 *
 *   - `CameraDistanceSampler` writes `cameraDistanceRef`
 *     every frame from the live camera position.
 *
 *   - `GlobeAtmosphereSampler` writes `globeAtmosphereRef` on
 *     a throttle from the current camera + globe rotation.
 *
 *   - `CameraDriver` writes the actual R3F camera position
 *     from the `cameraDistance` prop.
 *
 * A reader that runs before its writer within the same R3F
 * frame sees the previous frame's value — a one-frame lag
 * that is imperceptible for the camera (a fraction of a
 * degree of rotation) but visible for the atmosphere
 * crossfade at a fast zoom. The order below matches the
 * dependency direction: the samplers read the scene's own
 * state, and `CameraDriver` writes the camera. If a future
 * change adds a fifth child, place it after the existing
 * four unless it needs to run earlier; the current order has
 * no intra-frame dependencies among the three non-scene
 * children, but the pattern is worth preserving.
 *
 * ## `touchAction: "none"`
 *
 * The critical style. The globe is the primary interaction
 * target on touch devices, and any value other than `"none"`
 * lets the browser intercept drags as page scrolls — which is
 * exactly the failure mode that makes the globe feel "not
 * rotatable" on mobile. With `none`, pointer events flow
 * through to `GlobeControls` unimpeded.
 *
 * If the globe ever needs to co-exist with a scrolling page,
 * the correct pattern is a long-press to enter "globe mode"
 * rather than letting vertical drags pass through — a
 * half-scrollable, half-rotatable surface is worse than either
 * exclusive behavior.
 *
 * ## `dpr`
 *
 * The device pixel ratio is clamped to `[1, 1.75]`.
 *
 * The lower bound of 1 means the canvas is never rendered at
 * less than 1 physical pixel per CSS pixel — a value a
 * low-DPI screen cannot produce anyway, so the lower bound is
 * effectively a floor against a runtime that reports a
 * fractional `devicePixelRatio` (some browsers report 0.9 on
 * zoomed-out layouts).
 *
 * The upper bound of 1.75 is the interesting one. On a phone
 * that reports `devicePixelRatio === 3`, an unclamped renderer
 * would draw at 3× — roughly 9× the fill-rate cost of a
 * 1× canvas — for a scene whose finest detail (a small marker
 * or a polygon edge) is already antialiased and does not
 * visibly benefit past ~2×. The 1.75 cap is the highest value
 * that empirically does not produce a perceptible quality
 * difference on current hardware, at roughly 40% of the
 * fill-rate cost of 3×. If a future scene change adds
 * sub-pixel-detail geometry that would benefit from more
 * samples, raise the cap with a corresponding performance
 * measurement — do not remove it.
 *
 * ## Tone mapping
 *
 * Set unconditionally on the renderer, not just in realistic
 * mode. The realistic sphere uses `MeshStandardMaterial`, which
 * reads the renderer's setting and applies it in the fragment
 * shader. The minimal sphere uses a raw `ShaderMaterial` that
 * writes `gl_FragColor` directly; three does not apply tone
 * mapping to a `ShaderMaterial` unless the shader includes
 * `<tonemapping_fragment>`, which `EarthSphere.tsx` does not.
 *
 * ## `powerPreference`
 *
 * Left at the browser's default. `"high-performance"` would
 * wake a discrete GPU on dual-GPU laptops (MacBook Pro,
 * Windows gaming laptops) and keep it awake for as long as the
 * page is open — a real battery cost for a decorative globe
 * that runs a single scene at 60 Hz. The default lets the
 * browser pick a GPU appropriate to the workload. If a
 * measurable frame-time regression ever appears on
 * integrated-GPU machines, revisit this — the correct choice
 * depends on whether the frame-time jitter of GPU switching
 * outweighs the battery cost of pinning.
 *
 * ## `frameloop`
 *
 * Left at R3F's default (`"always"`). Switching to
 * `frameloop="demand"` would drop idle GPU usage to near zero,
 * but it requires explicit `invalidate()` calls from every
 * consumer that produces a visible change: auto-rotate,
 * momentum, travel, cloud rotation, star twinkle,
 * `SolarSampler`'s output, and `GlobeAtmosphereSampler`'s
 * atmosphere crossfade. That is a real refactor, and it is not
 * safe to land without an integration pass over every visual
 * subsystem. Flagged here so the default is documented as a
 * deliberate choice rather than an oversight.
 */
export default function GlobeCanvas({
  reducedMotion,
  selectedLocationId,
  globeTier,
  visualMode,
  cameraDistance = INITIAL_CAMERA_DISTANCE,
  onLocationSelect,
  onSolarChange,
  onResetNorthReady,
  onStepCamera,
}: GlobeCanvasProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{
        position: [0, 0, cameraDistance],
        fov: CAMERA_FOV,
        near: CAMERA_NEAR,
        far: CAMERA_FAR,
      }}
      gl={{
        antialias: true,
        alpha: true,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: RENDERER_TONE_MAPPING_EXPOSURE,
      }}
      style={{
        width: "100%",
        height: "100%",
        touchAction: "none",
      }}
    >
      <R3FAdaptersProvider>
        <GlobeScene
          reducedMotion={reducedMotion}
          selectedLocationId={selectedLocationId}
          globeTier={globeTier}
          visualMode={visualMode}
          onLocationSelect={onLocationSelect}
          onSolarChange={onSolarChange}
          onResetNorthReady={onResetNorthReady}
          onStepCamera={onStepCamera}
        />
      </R3FAdaptersProvider>

      <CameraDistanceSampler />
      <GlobeAtmosphereSampler />
      <CameraDriver distance={cameraDistance} />
    </Canvas>
  );
}