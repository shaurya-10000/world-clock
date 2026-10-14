"use client";

import { memo, useMemo } from "react";

import { locationToPosition } from "@/lib/globe-geometry";
import type { WorldLocation } from "@/lib/locations";

import {
  MARKER_ALTITUDE,
  MARKER_ALTITUDE_REALISTIC,
  MARKER_COLOR,
  MARKER_COLOR_FAVORITED,
  MARKER_COLOR_SELECTED,
  MARKER_HALO_OPACITY,
  MARKER_HALO_RADIUS,
  MARKER_RADIUS,
  MARKER_RADIUS_SELECTED,
  type GlobeVisualMode,
} from "./constants";

/**
 * Which side of the marker a card anchored to it should be
 * drawn on. `GlobeMarker` itself no longer renders a card —
 * this type (and `pickCardOffsetClasses` below) exist so
 * `CityArrivalCard`, rendered by the parent scene, can share
 * the same left/right offset convention.
 */
export type CardSide = "left" | "right";

interface GlobeMarkerProps {
  location: WorldLocation;
  selected: boolean;

  /**
   * True when the location is in the user's favorites.
   *
   * The marker is rendered in the favorite (pink) color
   * whenever this is true — whether or not the marker is also
   * selected. Selection affects size and halo; favorites affect
   * color.
   */
  favorited: boolean;

  /**
   * True when the marker is shown only because the selected
   * location is not part of the current tier.
   */
  transient: boolean;

  /**
   * True while the camera is animating toward a different
   * location. Clicks on any marker are still absorbed (so a
   * click mid-flight never bubbles to the globe underneath),
   * but they no longer trigger selection — selecting a new
   * destination before the current flight finishes would strand
   * the camera between two targets.
   *
   * Optional and defaults to `false` for callers that don't
   * track a travel state.
   */
  traveling?: boolean;

  /**
   * Which globe surface the marker is drawn on.
   *
   * Drives the marker's altitude:
   *
   * - **Minimal** — `MARKER_ALTITUDE` (2.5%). The shader
   *   sphere has no shells above the surface, so 2.5% sits
   *   cleanly above it.
   * - **Realistic** — `MARKER_ALTITUDE_REALISTIC` (3.4%).
   *   The realistic globe has two shells above the surface: a
   *   cloud layer at 1.2% and an atmosphere shell at 2%. A
   *   marker at 2.5% would be caught inside the atmosphere's
   *   additive rim — washed out, and clipped at the silhouette
   *   from some camera angles.
   */
  visualMode: GlobeVisualMode;

  onSelect: (location: WorldLocation) => void;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Chooses the marker color from the favorite/selection flags.
 *
 * Favorited always wins — the marker is pink regardless of
 * selection state. When not favorited, the color depends on
 * whether the marker is the currently selected one.
 *
 * Pure. Exported for testing.
 *
 * @param favorited - Whether the location is in the user's favorites.
 * @param selected - Whether the location is currently selected.
 * @returns A 6-digit hex color string.
 */
export function pickMarkerColor(
  favorited: boolean,
  selected: boolean,
): string {
  if (favorited) return MARKER_COLOR_FAVORITED;
  if (selected) return MARKER_COLOR_SELECTED;
  return MARKER_COLOR;
}

/**
 * Chooses the horizontal offset classes applied to a card
 * anchored to a marker, based on which side of the marker it
 * is drawn.
 *
 * Not used by `GlobeMarker` itself anymore — kept here (and
 * exported) because `CityArrivalCard` imports it, and this is
 * the single place both need to agree on the mapping.
 *
 * Pure. Exported for testing.
 *
 * @param side - `"left"` or `"right"`.
 * @returns A Tailwind class string.
 */
export function pickCardOffsetClasses(side: CardSide): string {
  return side === "left"
    ? "-translate-x-3 sm:-translate-x-6"
    : "translate-x-3 sm:translate-x-6";
}

/**
 * Builds the click handler for the marker mesh.
 *
 * Extracted so the click contract — stop propagation, then
 * (unless mid-flight) select the location — can be unit tested
 * without mounting an R3F scene.
 *
 * Propagation is always stopped, even while `traveling`, so a
 * click on a marker never falls through to the globe surface
 * beneath it. Only the *selection* is suppressed while
 * traveling.
 *
 * Pure. Exported for testing.
 *
 * @param location - The location this marker represents.
 * @param traveling - Whether the camera is currently mid-flight.
 * @param onSelect - Called with the location when the marker
 *   is clicked and the camera is not mid-flight.
 * @returns A click handler suitable for R3F's `onClick` prop.
 */
export function createMarkerClickHandler(
  location: WorldLocation,
  traveling: boolean,
  onSelect: (location: WorldLocation) => void,
): (event: { stopPropagation: () => void }) => void {
  return (event) => {
    event.stopPropagation();
    if (traveling) return;
    onSelect(location);
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A single location marker.
 *
 * The color and size of the marker are decided independently:
 *
 * - Color:
 *   - `favorited` → pink (`MARKER_COLOR_FAVORITED`)
 *   - otherwise → gray (`MARKER_COLOR`) when unselected, gold
 *     (`MARKER_COLOR_SELECTED`) when selected
 * - Size:
 *   - `selected` → `MARKER_RADIUS_SELECTED`, with halo
 *   - otherwise → `MARKER_RADIUS`, no halo
 *
 * That means four visible states:
 *
 * - gray: unselected, not favorited
 * - pink: unselected, favorited
 * - gold: selected, not favorited
 * - pink: selected, favorited
 *
 * The last two both use the selected size; the difference is
 * only the color. This keeps "favorited" and "selected" as
 * orthogonal signals: one is about the user's list, the other
 * is about the current focus.
 *
 * **Altitude is mode-dependent.** See the `visualMode` prop
 * documentation for the reasoning.
 *
 * **Depth and render order — the important part.**
 *
 * The minimal shader sphere is rendered with `transparent: true`
 * because it crossfades to reveal the realistic sphere as the
 * camera zooms in. In three.js, a transparent mesh renders
 * *after* the opaque pass. Without care, that means the minimal
 * sphere would draw on top of every marker, occluding all of
 * them — which is exactly the "markers disappear in minimal
 * mode" failure.
 *
 * Two settings on the solid marker mesh prevent that:
 *
 * - `depthWrite` on the solid mesh. The marker writes its own
 *   depth, so when the transparent sphere renders later and
 *   tests against the depth buffer, the sphere's front surface
 *   (which sits *behind* the marker along the same camera ray)
 *   fails the test and does not draw over the marker. Markers
 *   on the far hemisphere still get correctly occluded, because
 *   the front surface of the sphere is genuinely closer to the
 *   camera than they are and wins the depth test against them.
 *
 * - `renderOrder={3}` on both meshes, higher than the sphere
 *   (0), clouds (1), and atmosphere shell (2). This puts the
 *   markers at the end of the transparent queue regardless of
 *   what the sphere does.
 *
 * The halo mesh deliberately keeps `depthWrite={false}`. A
 * translucent glow volume that wrote depth would carve a
 * visible seam at its silhouette against the marker behind it.
 * The halo only needs to *test* against the depth buffer (which
 * contains the marker's own depth), not write to it.
 *
 * **This component does not render a card.** The one arrival
 * card for the selected location is owned entirely by
 * `GlobeScene`, which knows the dismiss state and the
 * left/right side the card should appear on. Rendering a card
 * here too, in the past, produced a visible duplicate once the
 * camera crossed the arrival-distance threshold.
 *
 * **Memoized.** `GlobeScene` renders one marker per visible
 * catalog entry, and the prop set is stable across any render
 * that does not change the selection, the favorite set, or the
 * travel state. `React.memo` collapses those no-op renders
 * without any custom equality function — the shallow compare
 * is exactly the semantics the component needs.
 *
 * @example
 * ```tsx
 * <GlobeMarker
 *   location={location}
 *   selected={selectedId === location.id}
 *   favorited={favoriteIds.has(location.id)}
 *   transient={false}
 *   traveling={isCameraFlying}
 *   visualMode="realistic"
 *   onSelect={setSelected}
 * />
 * ```
 */
function GlobeMarker({
  location,
  selected,
  favorited,
  transient,
  traveling = false,
  visualMode,
  onSelect,
}: GlobeMarkerProps) {
  const altitude =
    visualMode === "realistic"
      ? MARKER_ALTITUDE_REALISTIC
      : MARKER_ALTITUDE;

  const position = useMemo(
    () => locationToPosition(location, altitude),
    [location, altitude],
  );

  const markerColor = pickMarkerColor(favorited, selected);

  const handleClick = useMemo(
    () => createMarkerClickHandler(location, traveling, onSelect),
    [location, traveling, onSelect],
  );

  return (
    <group position={position as [number, number, number]}>
      <mesh onClick={handleClick} renderOrder={3}>
        <sphereGeometry
          args={[
            selected ? MARKER_RADIUS_SELECTED : MARKER_RADIUS,
            20,
            20,
          ]}
        />

        <meshBasicMaterial
          color={markerColor}
          transparent={transient}
          opacity={transient ? 0.96 : 1}
          depthTest
          depthWrite
        />
      </mesh>

      {selected && (
        <mesh renderOrder={3}>
          <sphereGeometry args={[MARKER_HALO_RADIUS, 24, 24]} />

          <meshBasicMaterial
            color={markerColor}
            transparent
            opacity={MARKER_HALO_OPACITY}
            depthTest
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

export default memo(GlobeMarker);