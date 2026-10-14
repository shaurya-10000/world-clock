"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import { getAnimationDeps } from "@/lib/animation-deps";
import {
  locationToDirection,
  locationToPosition,
} from "@/lib/globe-geometry";
import {
  getLocationsByGlobeTier,
  getWorldLocationById,
  type GlobeTier,
  type WorldLocation,
} from "@/lib/locations";
import { useFavorites } from "@/lib/useFavorites";
import type { SolarState } from "@/lib/useSolarState";

import { getCameraDistance } from "./cameraDistanceContext";
import CityArrivalCard from "./CityArrivalCard";
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  GLOBE_GROUP_NAME,
  MARKER_ALTITUDE,
  MARKER_ALTITUDE_REALISTIC,
  TRAVEL_DURATION,
  TRAVEL_EASING_POWER,
  type GlobeVisualMode,
} from "./constants";
import CountryPolygons from "./CountryPolygons";
import EarthSphere from "./EarthSphere";
import GlobeControls, {
  type GlobeControlsHandle,
} from "./GlobeControls";
import GlobeMarker, { type CardSide } from "./GlobeMarker";
import RealisticEarthSphere from "./RealisticEarthSphere";
import SolarSampler from "./SolarSampler";
import Terminator from "./Terminator";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface GlobeSceneProps {
  readonly reducedMotion: boolean;
  readonly selectedLocationId: string | null;
  readonly globeTier: GlobeTier;
  readonly visualMode: GlobeVisualMode;

  readonly onLocationSelect: (location: WorldLocation) => void;
  readonly onSolarChange: (state: SolarState) => void;

  readonly onResetNorthReady?: (
    resetNorth: (() => void) | null,
  ) => void;

  readonly onStepCamera?: (direction: -1 | 1) => void;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Small tolerance added to the arrival threshold.
 *
 * The camera distance is measured from the live camera position
 * (`position.length()`), which can land a hair above a ladder
 * value after easing. Without a tolerance, a step that is meant
 * to satisfy the threshold would fail the `<=` comparison by a
 * floating-point epsilon.
 */
const ARRIVAL_DISTANCE_EPSILON = 0.01;

/**
 * How often the arrival-distance poll runs, in milliseconds.
 *
 * 100 ms = 10 Hz. The value drives a boolean that flips once
 * or twice per user gesture, so 10 Hz is far more than enough
 * resolution.
 */
const ARRIVAL_POLL_INTERVAL_MS = 100;

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

export function computeCardSide(
  location: WorldLocation,
  group: THREE.Group | null,
): CardSide {
  if (!group?.quaternion) return "right";

  const direction = locationToDirection(location);

  const worldDirection = new THREE.Vector3(
    direction.x,
    direction.y,
    direction.z,
  ).applyQuaternion(group.quaternion);

  return worldDirection.x > 0 ? "left" : "right";
}

export function computeTargetQuaternion(
  location: WorldLocation,
): THREE.Quaternion {
  const direction = locationToDirection(location);
  const targetDirection = new THREE.Vector3(
    direction.x,
    direction.y,
    direction.z,
  ).normalize();
  const front = new THREE.Vector3(0, 0, 1);

  return new THREE.Quaternion().setFromUnitVectors(
    targetDirection,
    front,
  );
}

/* -------------------------------------------------------------------------- */
/* Lighting rig                                                               */
/* -------------------------------------------------------------------------- */

function LightingRig() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 3, 5]} intensity={2.2} />
      <directionalLight position={[-4, -2, -3]} intensity={0.45} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Globe surface                                                              */
/* -------------------------------------------------------------------------- */

function GlobeSurface({
  visualMode,
}: {
  readonly visualMode: GlobeVisualMode;
}) {
  if (visualMode === "realistic") {
    return <RealisticEarthSphere />;
  }

  return (
    <>
      <LightingRig />
      <EarthSphere />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Minimal-mode decoration                                                    */
/* -------------------------------------------------------------------------- */

function MinimalSurfaceDecoration() {
  return (
    <>
      <CountryPolygons />
      <Terminator />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Globe markers                                                              */
/* -------------------------------------------------------------------------- */

interface GlobeMarkersProps {
  readonly locations: readonly WorldLocation[];
  readonly selectedLocationId: string | null;
  readonly tierIds: ReadonlySet<string>;
  readonly isFavorite: (id: string) => boolean;
  readonly traveling: boolean;
  readonly visualMode: GlobeVisualMode;
  readonly onLocationSelect: (location: WorldLocation) => void;
}

const GlobeMarkers = memo(function GlobeMarkers({
  locations,
  selectedLocationId,
  tierIds,
  isFavorite,
  traveling,
  visualMode,
  onLocationSelect,
}: GlobeMarkersProps) {
  return (
    <>
      {locations.map((location) => {
        const isSelected = location.id === selectedLocationId;
        const inTier = tierIds.has(location.id);
        const transient = isSelected && !inTier;

        return (
          <GlobeMarker
            key={location.id}
            location={location}
            selected={isSelected}
            favorited={isFavorite(location.id)}
            transient={transient}
            traveling={traveling}
            visualMode={visualMode}
            onSelect={onLocationSelect}
          />
        );
      })}
    </>
  );
});

/* -------------------------------------------------------------------------- */
/* Arrival card                                                               */
/* -------------------------------------------------------------------------- */

interface ArrivalCardProps {
  readonly location: WorldLocation;
  readonly position: readonly [number, number, number];
  readonly side: CardSide;
  readonly onClose: () => void;
}

function ArrivalCard({
  location,
  position,
  side,
  onClose,
}: ArrivalCardProps) {
  return (
    <group position={position as [number, number, number]}>
      <CityArrivalCard
        location={location}
        onClose={onClose}
        cardSide={side}
      />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Arrival-distance poll                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Polls `getCameraDistance()` at 10 Hz and reports whether
 * the camera is inside the arrival threshold.
 *
 * ## Two-phase initial read
 *
 * The value is read synchronously on mount and again after
 * one animation frame.
 *
 * The synchronous read gives a valid starting value in every
 * non-R3F environment (a test that mocks `getCameraDistance`
 * to return a fixed number sees that number immediately) and
 * in production whenever the camera has already been
 * positioned.
 *
 * The deferred read re-checks after the R3F frame loop has
 * had a chance to run. `CameraDistanceSampler` writes
 * `cameraDistanceRef.current` inside that loop, which executes
 * after React's commit; the synchronous read on mount
 * therefore sees the initial constant rather than the sampled
 * value. The deferred read corrects it.
 *
 * Both reads are needed. Removing the deferred read leaves
 * the card hidden for one frame in production whenever the
 * camera moves via the frame loop. Removing the synchronous
 * read leaves the card hidden for one frame in every test
 * environment, which is what the previous version did.
 *
 * If the two reads produce the same value, React bails out of
 * the second `setArrived` call.
 */
function useArrivalDistance(): boolean {
  const [arrived, setArrived] = useState<boolean>(() => {
    return (
      getCameraDistance() <=
      ARRIVAL_DISTANCE_THRESHOLD + ARRIVAL_DISTANCE_EPSILON
    );
  });

  useEffect(() => {
    const check = (): void => {
      setArrived(
        getCameraDistance() <=
          ARRIVAL_DISTANCE_THRESHOLD + ARRIVAL_DISTANCE_EPSILON,
      );
    };

    const frame = requestAnimationFrame(check);
    const id = window.setInterval(check, ARRIVAL_POLL_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(id);
    };
  }, []);

  return arrived;
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function GlobeScene({
  reducedMotion,
  selectedLocationId,
  globeTier,
  visualMode,
  onLocationSelect,
  onSolarChange,
  onResetNorthReady,
  onStepCamera,
}: GlobeSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<GlobeControlsHandle | null>(null);

  const [dismissedForId, setDismissedForId] = useState<
    string | null
  >(null);

  const [cardSide, setCardSide] = useState<CardSide>("right");

  const isTravelingRef = useRef(false);
  const [isTraveling, setIsTravelingState] = useState(false);

  const { isFavorite } = useFavorites();

  /* ------------------------------------------------------------------ */
  /* Derived state                                                      */
  /* ------------------------------------------------------------------ */

  const selectedLocation = useMemo(
    () =>
      selectedLocationId === null
        ? null
        : getWorldLocationById(selectedLocationId) ?? null,
    [selectedLocationId],
  );

  const tierLocations = useMemo(
    () => getLocationsByGlobeTier(globeTier),
    [globeTier],
  );

  const tierIds = useMemo(
    () => new Set(tierLocations.map((location) => location.id)),
    [tierLocations],
  );

  const globeLocations = useMemo(() => {
    if (!selectedLocation || tierIds.has(selectedLocation.id)) {
      return tierLocations;
    }
    return [...tierLocations, selectedLocation];
  }, [tierLocations, tierIds, selectedLocation]);

  const cardPosition = useMemo<
    [number, number, number] | null
  >(() => {
    if (!selectedLocation) return null;

    const altitude =
      visualMode === "realistic"
        ? MARKER_ALTITUDE_REALISTIC
        : MARKER_ALTITUDE;

    const position = locationToPosition(
      selectedLocation,
      altitude,
    );

    return [position[0], position[1], position[2]];
  }, [selectedLocation, visualMode]);

  const arrived = useArrivalDistance();

  const showCard =
    selectedLocation !== null &&
    cardPosition !== null &&
    dismissedForId !== selectedLocation.id &&
    arrived;

  /* ------------------------------------------------------------------ */
  /* Card side                                                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!selectedLocation) return;
    if (isTraveling) return;

    const group = groupRef.current;
    if (!group?.quaternion) return;

    setCardSide(computeCardSide(selectedLocation, group));
  }, [selectedLocation, isTraveling]);

  /* ------------------------------------------------------------------ */
  /* Travel animation                                                   */
  /* ------------------------------------------------------------------ */

  /*
   * The travel animation rotates the globe group from its
   * current orientation to the target orientation for the
   * selected location.
   *
   * ## Why `setIsTravelingState(true)` is inside `animate`,
   * not in the effect body
   *
   * `react-hooks/set-state-in-effect` flags synchronous
   * `setState` calls in an effect body. The state flip that
   * signals "a travel is in progress" needs to happen when
   * the animation starts — but the *effect body* runs one
   * commit before the *animation* runs, because the animation
   * is scheduled via `requestAnimationFrame`.
   *
   * Moving the state flip into the first line of `animate`
   * puts it on the same frame as the first interpolation step,
   * which is visually identical to the old behavior (the ref
   * used by `GlobeControls` is still flipped synchronously in
   * the effect body, so keyboard/mouse suppression is
   * unchanged; only the render-facing mirror lags by one
   * frame). No cascading render, no lint warning.
   *
   * ## Why the ref is still flipped synchronously
   *
   * `GlobeControls` reads `isTravelingRef.current` directly to
   * suppress its drag handler while a travel is in progress.
   * That read has to see the new value in the same commit the
   * effect runs, so the ref is set here, not inside `animate`.
   */
  useEffect(() => {
    const group = groupRef.current;
    const quaternion = group?.quaternion;
    if (!selectedLocation || !group || !quaternion) return;

    const targetQuaternion =
      computeTargetQuaternion(selectedLocation);

    if (reducedMotion) {
      quaternion.copy(targetQuaternion);
      return;
    }

    /*
     * The imperative ref (read by `GlobeControls`) flips
     * synchronously so drag suppression takes effect in this
     * commit. The render-facing state mirror flips on the
     * first animation frame — see the block comment above.
     */
    isTravelingRef.current = true;

    const deps = getAnimationDeps();
    const start = quaternion.clone();
    const startTime = deps.now();

    let frameId: number | null = null;
    let cancelled = false;

    const animate = (now: number) => {
      if (cancelled) return;

      /*
       * First animation frame: publish the traveling state so
       * the UI can react (dim other markers, hide the arrival
       * card, etc.). Doing it here rather than in the effect
       * body keeps this out of `set-state-in-effect`.
       */
      setIsTravelingState(true);

      const progress = Math.min(
        (now - startTime) / TRAVEL_DURATION,
        1,
      );
      const eased =
        1 - Math.pow(1 - progress, TRAVEL_EASING_POWER);

      quaternion.copy(start).slerp(targetQuaternion, eased);

      if (progress < 1) {
        frameId = deps.requestAnimationFrame(animate);
        return;
      }

      quaternion.copy(targetQuaternion);
      frameId = null;
      isTravelingRef.current = false;
      setIsTravelingState(false);
    };

    frameId = deps.requestAnimationFrame(animate);

    return () => {
      cancelled = true;

      /*
       * Only flip the traveling state back if there was a
       * pending frame to cancel. If the animation already
       * completed, the last state flip inside `animate` has
       * already run.
       */
      if (frameId !== null) {
        deps.cancelAnimationFrame(frameId);
        frameId = null;
        isTravelingRef.current = false;
        setIsTravelingState(false);
      }
    };
  }, [reducedMotion, selectedLocation]);

  /* ------------------------------------------------------------------ */
  /* Reset-north handler                                                */
  /* ------------------------------------------------------------------ */

  const handleResetNorth = useCallback(() => {
    const latitude = selectedLocation?.latitude ?? 0;
    controlsRef.current?.resetNorth(latitude);
  }, [selectedLocation]);

  const previousResetNorthRef = useRef<
    ((resetNorth: (() => void) | null) => void) | undefined
  >(undefined);

  useEffect(() => {
    if (!onResetNorthReady) return;

    previousResetNorthRef.current = onResetNorthReady;
    onResetNorthReady(handleResetNorth);

    return () => {
      if (previousResetNorthRef.current === onResetNorthReady) {
        onResetNorthReady(null);
      }
    };
  }, [handleResetNorth, onResetNorthReady]);

  /* ------------------------------------------------------------------ */
  /* Card handlers                                                      */
  /* ------------------------------------------------------------------ */

  const handleCardClose = useCallback(() => {
    if (selectedLocationId === null) return;
    setDismissedForId(selectedLocationId);
  }, [selectedLocationId]);

  const handleLocationSelect = useCallback(
    (location: WorldLocation) => {
      setDismissedForId(null);
      onLocationSelect(location);
    },
    [onLocationSelect],
  );

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <>
      <group ref={groupRef} name={GLOBE_GROUP_NAME}>
        <GlobeSurface visualMode={visualMode} />

        {visualMode === "minimal" && <MinimalSurfaceDecoration />}

        <GlobeMarkers
          locations={globeLocations}
          selectedLocationId={selectedLocationId}
          tierIds={tierIds}
          isFavorite={isFavorite}
          traveling={isTraveling}
          visualMode={visualMode}
          onLocationSelect={handleLocationSelect}
        />

        {showCard && selectedLocation && cardPosition && (
          <ArrivalCard
            location={selectedLocation}
            position={cardPosition}
            side={cardSide}
            onClose={handleCardClose}
          />
        )}
      </group>

      <SolarSampler onChange={onSolarChange} />

      <GlobeControls
        ref={controlsRef}
        groupRef={groupRef}
        isTravelingRef={isTravelingRef}
        onStepCamera={onStepCamera ?? (() => {})}
      />
    </>
  );
}