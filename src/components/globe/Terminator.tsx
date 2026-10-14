"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { GLOBE_RADIUS } from "@/lib/globe-geometry";
import {
  useFrameAdapter,
  useThreeAdapter,
} from "@/lib/r3f-adapters";

import {
  AXIS_MARKER_OPACITY,
  SHOW_AXIS_MARKERS,
  SHOW_TERMINATOR_RING,
  TERMINATOR_OPACITY,
} from "./constants";
import { getSunDirectionInGlobeFrame } from "./solarContext";

/* -------------------------------------------------------------------------- */
/* Geometry constants                                                         */
/* -------------------------------------------------------------------------- */

/** Number of dots along the terminator ring. */
const TERMINATOR_DOT_COUNT = 240;

/**
 * Number of dots in each polar cap segment.
 *
 * Each segment is short — a brief dotted spike above the
 * north pole and below the south pole. 6 dots gives a
 * readable "spike" without it looking like a line.
 */
const AXIS_DOT_COUNT_PER_CAP = 6;

/**
 * Radius of the terminator ring, slightly larger than the
 * globe itself so the dots do not z-fight with the surface.
 */
const RING_RADIUS = GLOBE_RADIUS * 1.004;

/**
 * Where each polar cap spike begins, measured from the globe
 * center along the Y axis.
 *
 * The gap ensures the first dot of the spike is visibly
 * separated from the sphere's surface — so the spike reads
 * as "emerging from the pole," not "painted on the pole."
 */
const AXIS_GAP_FROM_POLE = GLOBE_RADIUS * 1.03;

/**
 * How far each polar cap spike extends beyond its starting
 * point.
 *
 * Short enough to read as a pole marker rather than a
 * compass needle.
 */
const AXIS_SEGMENT_LENGTH = GLOBE_RADIUS * 0.06;

/** Size of each dot in the spike layer, in world units. */
const DOT_SIZE = GLOBE_RADIUS * 0.008;

/**
 * Size of the tip dot, in world units.
 *
 * Larger than the spike dots so the eye reads the tip as the
 * pole itself, not as "the last dot in the line."
 */
const TIP_DOT_SIZE = GLOBE_RADIUS * 0.016;

/**
 * Base color of the dots. A warm amber that reads as the
 * boundary between day and night.
 */
const DOT_COLOR = new THREE.Color(1.0, 0.78, 0.52);

/* -------------------------------------------------------------------------- */
/* Geometry builders                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Builds the terminator ring geometry — a circle of
 * `TERMINATOR_DOT_COUNT` points in the XY plane, at
 * `RING_RADIUS`.
 *
 * Exported for unit testing. Called once per mount via
 * `useMemo` in the component.
 */
export function buildRingGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(
    TERMINATOR_DOT_COUNT * 3,
  );

  for (let i = 0; i < TERMINATOR_DOT_COUNT; i += 1) {
    const angle = (i / TERMINATOR_DOT_COUNT) * Math.PI * 2;

    positions[i * 3] = Math.cos(angle) * RING_RADIUS;
    positions[i * 3 + 1] = Math.sin(angle) * RING_RADIUS;
    positions[i * 3 + 2] = 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  return geometry;
}

/**
 * Builds the pole-spike geometry — two short dotted segments
 * extending outward from the north and south poles.
 *
 * Each spike runs from `±AXIS_GAP_FROM_POLE` along the Y axis
 * and extends by `AXIS_SEGMENT_LENGTH` in the same direction.
 * Dots are evenly spaced along the segment.
 *
 * The two segments are stored in `[north, south]` order:
 * indices `0..AXIS_DOT_COUNT_PER_CAP-1` are the north spike,
 * the rest are the south spike. `buildTipGeometry` uses the
 * same ordering so the tip dots line up with the last dot of
 * each spike.
 *
 * Exported for unit testing.
 */
export function buildSpikeGeometry(): THREE.BufferGeometry {
  const totalDots = AXIS_DOT_COUNT_PER_CAP * 2;
  const positions = new Float32Array(totalDots * 3);

  for (let i = 0; i < AXIS_DOT_COUNT_PER_CAP; i += 1) {
    const t = i / (AXIS_DOT_COUNT_PER_CAP - 1);
    const y = AXIS_GAP_FROM_POLE + t * AXIS_SEGMENT_LENGTH;

    positions[i * 3] = 0;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
  }

  const offset = AXIS_DOT_COUNT_PER_CAP;

  for (let i = 0; i < AXIS_DOT_COUNT_PER_CAP; i += 1) {
    const t = i / (AXIS_DOT_COUNT_PER_CAP - 1);
    const y = -(AXIS_GAP_FROM_POLE + t * AXIS_SEGMENT_LENGTH);

    const idx = offset + i;
    positions[idx * 3] = 0;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  return geometry;
}

/**
 * Builds the tip-dot geometry — one point at the far end of
 * each pole spike.
 *
 * The tip dot is what survives a tilted or foreshortened
 * view. Even when the spike itself collapses to a few pixels
 * against the camera, the tip stays a visible anchor at the
 * pole's world-space position.
 *
 * Stored in `[north, south]` order to match
 * `buildSpikeGeometry`.
 *
 * Exported for unit testing.
 */
export function buildTipGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(2 * 3);

  /* North tip. */
  positions[0] = 0;
  positions[1] = AXIS_GAP_FROM_POLE + AXIS_SEGMENT_LENGTH;
  positions[2] = 0;

  /* South tip. */
  positions[3] = 0;
  positions[4] = -(AXIS_GAP_FROM_POLE + AXIS_SEGMENT_LENGTH);
  positions[5] = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  return geometry;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Computes the quaternion that aligns `+Z` with the given
 * direction.
 *
 * **The input must be in the same frame as the object being
 * rotated.** If you are setting a mesh's `quaternion` and the
 * mesh has a rotating parent, pass a direction expressed in
 * the mesh's *local* frame — not a world-space direction.
 * Passing a world-space direction to a child of a rotated
 * group applies the parent rotation twice.
 *
 * Pure function so the rotation math can be unit tested
 * without mounting an R3F scene.
 *
 * @param direction - The target direction. Need not be unit
 *   length; it is normalized internally.
 * @returns A unit quaternion that maps `(0, 0, 1)` to the
 *   normalized input direction.
 */
export function computeRingQuaternion(direction: {
  x: number;
  y: number;
  z: number;
}): THREE.Quaternion {
  const target = new THREE.Vector3(
    direction.x,
    direction.y,
    direction.z,
  ).normalize();
  const naturalAxis = new THREE.Vector3(0, 0, 1);
  return new THREE.Quaternion().setFromUnitVectors(
    naturalAxis,
    target,
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The pole axis markers, and (optionally) the terminator ring.
 *
 * Two sets of dots, each rendered as a `THREE.Points`
 * primitive:
 *
 *   1. **The terminator** — a ring of dots tracing the great
 *      circle that separates day from night. When enabled, it
 *      reorients every frame to remain perpendicular to the
 *      sun direction. Disabled by default (see
 *      `SHOW_TERMINATOR_RING`).
 *
 *   2. **The pole axis** — two short dotted spikes with a
 *      bright tip dot, extending outward from the north and
 *      south geographic poles.
 *
 * ## Frame handling
 *
 * This component is a child of the rotating globe group, so
 * its world transform already carries the globe quaternion.
 * `getSunDirectionInGlobeFrame()` returns a geography-frame
 * vector, and the ring's quaternion is applied *in the
 * ring's local frame* — since the ring's local frame at
 * identity is the geography frame, the sun direction can be
 * used directly with no additional transform.
 *
 * ## The axis is attached to the globe
 *
 * When the globe rotates to face a selected city, the axis
 * rotates with it. That is physically correct: the poles are
 * on the globe, not on the camera. From a mid-latitude
 * viewpoint, the north pole is tilted toward the viewer and
 * the spike reads as a diagonal pin — that is what north
 * looks like from London, not a bug.
 *
 * ## Why there is no fade
 *
 * An earlier version of this component faded the axis
 * markers out as the camera pitched toward a pole. It
 * computed `atan2(camPos.y, hypot(camPos.x, camPos.z))` on
 * every frame and applied the result through a
 * `computeAxisFade` helper.
 *
 * That code was dead. The camera in this app sits on the
 * equator plane at `(0, 0, distance)` and never tilts — the
 * Google Earth interaction model is exactly that the camera
 * is fixed and the globe rotates. So `camPos.y` was always
 * `0`, the pitch was always `0`, and the fade multiplier was
 * always `1`. Two `Math` calls and a function call per
 * frame, computing the identity.
 *
 * The fade logic has been removed entirely rather than left
 * in place "in case a camera-orbit model is ever added."
 * Introducing it now would mean every future reader has to
 * read past a function whose output is provably constant,
 * and every future fix to the surrounding code has to
 * consider whether the fade still matters. If a camera-
 * orbit model is ever added, the fade is straightforward to
 * reintroduce — and at that point it will be tested against
 * a real tilting camera rather than against the identity.
 *
 * ## Why the terminator is off by default
 *
 * The dotted ring moves as the sun advances and as the user
 * rotates the globe. That motion competes with the sphere's
 * own day/night lighting — which already shows where the
 * boundary is — and reads as a jittering artifact during
 * rotation. The ring is hidden by default; the sphere's
 * lighting communicates the terminator on its own. Set
 * `SHOW_TERMINATOR_RING` to `true` in `constants.ts` to
 * bring the ring back.
 *
 * ## Resource lifetime
 *
 * Every geometry and material built by this component is
 * disposed on unmount. The geometry memos build
 * conditionally — `SHOW_TERMINATOR_RING ?
 * buildRingGeometry() : null` — so the ring geometry is
 * never allocated when the ring is disabled. Building it
 * unconditionally and discarding the ref would leak a
 * `BufferGeometry` on every mount/unmount cycle, which
 * matters because this component unmounts when the visual
 * mode toggles away from minimal.
 */
export default function Terminator() {
  const ringRef = useRef<THREE.Points>(null);

  const { camera } = useThreeAdapter();

  /*
   * The camera is read through a ref rather than closed over
   * directly. The frame callback is registered once and
   * cannot depend on a value that might change identity
   * across renders — a closure over `camera` would capture
   * whichever camera object existed at the time the callback
   * was registered.
   *
   * The effect below keeps the ref in sync. This matches the
   * same pattern used by `EarthSphere` and
   * `RealisticEarthSphere`.
   */
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  /*
   * The ring geometry is only built when the ring is enabled.
   * Building it unconditionally and then not rendering the
   * mesh would leak a `BufferGeometry` that nothing disposes.
   */
  const ringGeometry = useMemo(
    () => (SHOW_TERMINATOR_RING ? buildRingGeometry() : null),
    [],
  );

  const spikeGeometry = useMemo(
    () => (SHOW_AXIS_MARKERS ? buildSpikeGeometry() : null),
    [],
  );

  const tipGeometry = useMemo(
    () => (SHOW_AXIS_MARKERS ? buildTipGeometry() : null),
    [],
  );

  /*
   * Three materials: the terminator ring, the axis spike, and
   * the axis tip dot. The tip has its own material because
   * its point size is larger and it needs a higher baseline
   * opacity so it stays visible when the spike is
   * foreshortened.
   *
   * All three use `depthTest: false`. The dots are meant to
   * read as overlays — always visible, never occluded by the
   * sphere. With `depthTest: true` the pole spikes would be
   * hidden whenever the globe's near surface passed between
   * them and the camera, which happens constantly during
   * rotation.
   *
   * The opacities are the final values. There is no fade, so
   * the materials are never touched again after construction.
   */
  const ringMaterial = useMemo(
    () =>
      SHOW_TERMINATOR_RING
        ? new THREE.PointsMaterial({
            color: DOT_COLOR,
            size: DOT_SIZE,
            sizeAttenuation: true,
            transparent: true,
            opacity: TERMINATOR_OPACITY,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
          })
        : null,
    [],
  );

  const axisMaterial = useMemo(
    () =>
      SHOW_AXIS_MARKERS
        ? new THREE.PointsMaterial({
            color: DOT_COLOR,
            size: DOT_SIZE,
            sizeAttenuation: true,
            transparent: true,
            opacity: AXIS_MARKER_OPACITY,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
          })
        : null,
    [],
  );

  const tipMaterial = useMemo(
    () =>
      SHOW_AXIS_MARKERS
        ? new THREE.PointsMaterial({
            color: DOT_COLOR,
            size: TIP_DOT_SIZE,
            sizeAttenuation: true,
            transparent: true,
            opacity: AXIS_MARKER_OPACITY,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
          })
        : null,
    [],
  );

  /* Dispose materials on unmount. */
  useEffect(() => {
    return () => {
      ringMaterial?.dispose();
      axisMaterial?.dispose();
      tipMaterial?.dispose();
    };
  }, [ringMaterial, axisMaterial, tipMaterial]);

  /* Dispose geometries on unmount. */
  useEffect(() => {
    return () => {
      ringGeometry?.dispose();
      spikeGeometry?.dispose();
      tipGeometry?.dispose();
    };
  }, [ringGeometry, spikeGeometry, tipGeometry]);

  useFrameAdapter(() => {
    /*
     * The ring is only oriented when it is enabled. The guard
     * here is what keeps the frame callback cheap when the
     * ring is disabled — the default configuration — because
     * the callback becomes a single `if` check.
     *
     * No other per-frame work happens in this component. See
     * the module header, "Why there is no fade", for the
     * reasoning.
     */
    if (!SHOW_TERMINATOR_RING) return;

    const ring = ringRef.current;
    if (!ring) return;

    /*
     * The ring is a child of the globe group, and its local
     * frame at identity is the geography frame — the same
     * frame `getSunDirectionInGlobeFrame()` returns. So the
     * sun direction can be used directly; no inverse-world
     * transform is needed.
     */
    const sun = getSunDirectionInGlobeFrame();

    ring.quaternion.copy(
      computeRingQuaternion({
        x: sun.x,
        y: sun.y,
        z: sun.z,
      }),
    );
  });

  return (
    <>
      {SHOW_TERMINATOR_RING && ringGeometry && ringMaterial && (
        <points
          ref={ringRef}
          geometry={ringGeometry}
          material={ringMaterial}
          renderOrder={2}
          onClick={(event) => {
            event.stopPropagation();
          }}
        />
      )}

      {SHOW_AXIS_MARKERS && spikeGeometry && axisMaterial && (
        <points
          geometry={spikeGeometry}
          material={axisMaterial}
          renderOrder={2}
          onClick={(event) => {
            event.stopPropagation();
          }}
        />
      )}

      {SHOW_AXIS_MARKERS && tipGeometry && tipMaterial && (
        <points
          geometry={tipGeometry}
          material={tipMaterial}
          renderOrder={3}
          onClick={(event) => {
            event.stopPropagation();
          }}
        />
      )}
    </>
  );
}