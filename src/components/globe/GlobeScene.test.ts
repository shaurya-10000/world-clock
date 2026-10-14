import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  computeCardSide,
  computeTargetQuaternion,
} from "@/components/globe/GlobeScene";
import { locationToDirection } from "@/lib/globe-geometry";
import type { WorldLocation } from "@/lib/locations";

function locationAt(
  latitude: number,
  longitude: number,
): WorldLocation {
  return {
    id: "x",
    city: "X",
    country: "Y",
    timezone: "UTC",
    latitude,
    longitude,
    continent: "north-america",
    globeTiers: ["major"],
  };
}

function identityGroup(): THREE.Group {
  return new THREE.Group();
}

/**
 * Derives the expected side from the same primitive the
 * component uses, so the test is a contract assertion on the
 * `x > 0` boundary rather than a magic value.
 */
function expectedSide(
  location: WorldLocation,
  group: THREE.Group,
): "left" | "right" {
  const dir = locationToDirection(location);
  const world = new THREE.Vector3(dir.x, dir.y, dir.z).applyQuaternion(
    group.quaternion,
  );
  return world.x > 0 ? "left" : "right";
}

/* -------------------------------------------------------------------------- */
/* computeCardSide                                                            */
/* -------------------------------------------------------------------------- */

describe("computeCardSide", () => {
  it("returns 'right' when the group is null", () => {
    expect(computeCardSide(locationAt(0, 0), null)).toBe("right");
  });

  it("matches the sign of the rotated marker's x component", () => {
    const location = locationAt(0, 90);
    const group = identityGroup();

    expect(computeCardSide(location, group)).toBe(
      expectedSide(location, group),
    );
  });

  it("returns 'left' when the rotated marker's x is strictly positive", () => {
    const location = locationAt(0, 90);
    const group = identityGroup();

    expect(expectedSide(location, group)).toBe("left");
    expect(computeCardSide(location, group)).toBe("left");
  });

  it("returns 'right' when the rotated marker's x is strictly negative", () => {
    const location = locationAt(0, -90);
    const group = identityGroup();

    expect(expectedSide(location, group)).toBe("right");
    expect(computeCardSide(location, group)).toBe("right");
  });

  it("flips the side when the group is rotated 180° about Y", () => {
    const location = locationAt(0, 90);
    const group = identityGroup();

    const before = computeCardSide(location, group);

    group.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI,
    );

    const after = computeCardSide(location, group);

    expect(after).not.toBe(before);
  });

  it("is deterministic for a given (location, quaternion)", () => {
    const location = locationAt(35, -120);
    const group = identityGroup();

    expect(computeCardSide(location, group)).toBe(
      computeCardSide(location, group),
    );
  });

  it("returns 'left' or 'right' for every cardinal direction", () => {
    const group = identityGroup();
    const samples = [
      locationAt(0, 0),
      locationAt(0, 90),
      locationAt(0, 180),
      locationAt(0, -90),
      locationAt(90, 0),
      locationAt(-90, 0),
    ];

    for (const loc of samples) {
      const side = computeCardSide(loc, group);
      expect(side === "left" || side === "right").toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* computeTargetQuaternion                                                    */
/* -------------------------------------------------------------------------- */

describe("computeTargetQuaternion", () => {
  it("returns a unit quaternion", () => {
    const q = computeTargetQuaternion(locationAt(0, 0));
    const magnitude = Math.hypot(q.x, q.y, q.z, q.w);
    expect(magnitude).toBeCloseTo(1, 6);
  });

  it("maps the location's direction to +Z", () => {
    const location = locationAt(0, 90);
    const q = computeTargetQuaternion(location);

    const dir = locationToDirection(location);
    const rotated = new THREE.Vector3(
      dir.x,
      dir.y,
      dir.z,
    ).applyQuaternion(q);

    expect(rotated.x).toBeCloseTo(0, 5);
    expect(rotated.y).toBeCloseTo(0, 5);
    expect(rotated.z).toBeCloseTo(1, 5);
  });

  it("produces the identity for a location whose direction is +Z", () => {
    /* At latitude 0, longitude 0 the direction is +Z. */
    const q = computeTargetQuaternion(locationAt(0, 0));
    expect(q.w).toBeCloseTo(1, 5);
    expect(q.x).toBeCloseTo(0, 5);
    expect(q.y).toBeCloseTo(0, 5);
    expect(q.z).toBeCloseTo(0, 5);
  });

  it("returns a finite quaternion for every cardinal direction", () => {
    for (const [lat, lon] of [
      [0, 0],
      [0, 90],
      [0, 180],
      [0, -90],
      [90, 0],
      [-90, 0],
    ] as const) {
      const q = computeTargetQuaternion(locationAt(lat, lon));
      expect(Number.isFinite(q.x)).toBe(true);
      expect(Number.isFinite(q.y)).toBe(true);
      expect(Number.isFinite(q.z)).toBe(true);
      expect(Number.isFinite(q.w)).toBe(true);
    }
  });
});