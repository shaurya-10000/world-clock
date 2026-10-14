import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  buildRingGeometry,
  buildSpikeGeometry,
  buildTipGeometry,
  computeRingQuaternion,
} from "@/components/globe/Terminator";
import { GLOBE_RADIUS } from "@/lib/globe-geometry";

const TERMINATOR_DOT_COUNT = 240;
const AXIS_DOT_COUNT_PER_CAP = 6;

/* -------------------------------------------------------------------------- */
/* buildRingGeometry                                                          */
/* -------------------------------------------------------------------------- */

describe("buildRingGeometry", () => {
  it("has a position attribute with 3 floats per dot", () => {
    const geometry = buildRingGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBe(TERMINATOR_DOT_COUNT);
  });

  it("places every dot in the XY plane", () => {
    const geometry = buildRingGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let i = 0; i < attr.count; i += 1) {
      expect(attr.getZ(i)).toBeCloseTo(0, 6);
    }
  });

  it("places every dot at the ring radius from the origin", () => {
    const geometry = buildRingGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const expected = GLOBE_RADIUS * 1.004;

    for (let i = 0; i < attr.count; i += 1) {
      const x = attr.getX(i);
      const y = attr.getY(i);
      expect(Math.hypot(x, y)).toBeCloseTo(expected, 4);
    }
  });

  it("starts at the +X edge of the ring", () => {
    const geometry = buildRingGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(attr.getX(0)).toBeCloseTo(GLOBE_RADIUS * 1.004, 4);
    expect(attr.getY(0)).toBeCloseTo(0, 6);
  });

  it("returns finite values for every component", () => {
    const geometry = buildRingGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let i = 0; i < attr.count; i += 1) {
      expect(Number.isFinite(attr.getX(i))).toBe(true);
      expect(Number.isFinite(attr.getY(i))).toBe(true);
      expect(Number.isFinite(attr.getZ(i))).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* buildSpikeGeometry                                                         */
/* -------------------------------------------------------------------------- */

describe("buildSpikeGeometry", () => {
  it("has twice the per-cap dot count as its total", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(attr.count).toBe(AXIS_DOT_COUNT_PER_CAP * 2);
  });

  it("places every dot on the Y axis", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let i = 0; i < attr.count; i += 1) {
      expect(attr.getX(i)).toBeCloseTo(0, 6);
      expect(attr.getZ(i)).toBeCloseTo(0, 6);
    }
  });

  it("places the north spike at positive Y", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let i = 0; i < AXIS_DOT_COUNT_PER_CAP; i += 1) {
      expect(attr.getY(i)).toBeGreaterThan(0);
    }
  });

  it("places the south spike at negative Y", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const offset = AXIS_DOT_COUNT_PER_CAP;

    for (let i = 0; i < AXIS_DOT_COUNT_PER_CAP; i += 1) {
      expect(attr.getY(offset + i)).toBeLessThan(0);
    }
  });

  it("places the first dot of each spike at the gap distance", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const gap = GLOBE_RADIUS * 1.03;

    expect(attr.getY(0)).toBeCloseTo(gap, 4);
    expect(attr.getY(AXIS_DOT_COUNT_PER_CAP)).toBeCloseTo(-gap, 4);
  });

  it("spaces the last dot of each spike at the segment end", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const gap = GLOBE_RADIUS * 1.03;
    const seg = GLOBE_RADIUS * 0.06;

    expect(attr.getY(AXIS_DOT_COUNT_PER_CAP - 1)).toBeCloseTo(
      gap + seg,
      4,
    );
    expect(
      attr.getY(AXIS_DOT_COUNT_PER_CAP * 2 - 1),
    ).toBeCloseTo(-(gap + seg), 4);
  });

  it("returns finite values for every component", () => {
    const geometry = buildSpikeGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let i = 0; i < attr.count; i += 1) {
      expect(Number.isFinite(attr.getX(i))).toBe(true);
      expect(Number.isFinite(attr.getY(i))).toBe(true);
      expect(Number.isFinite(attr.getZ(i))).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* buildTipGeometry                                                           */
/* -------------------------------------------------------------------------- */

describe("buildTipGeometry", () => {
  it("contains exactly two dots", () => {
    const geometry = buildTipGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(attr.count).toBe(2);
  });

  it("places both dots on the Y axis", () => {
    const geometry = buildTipGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let i = 0; i < attr.count; i += 1) {
      expect(attr.getX(i)).toBeCloseTo(0, 6);
      expect(attr.getZ(i)).toBeCloseTo(0, 6);
    }
  });

  it("places the north tip at +gap + length", () => {
    const geometry = buildTipGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const expected = GLOBE_RADIUS * 1.03 + GLOBE_RADIUS * 0.06;

    expect(attr.getY(0)).toBeCloseTo(expected, 4);
  });

  it("places the south tip at −gap − length", () => {
    const geometry = buildTipGeometry();
    const attr = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const expected = -(GLOBE_RADIUS * 1.03 + GLOBE_RADIUS * 0.06);

    expect(attr.getY(1)).toBeCloseTo(expected, 4);
  });

  it("lines the tips up with the last spike dot", () => {
    /*
     * The tip dot must sit exactly at the end of the spike
     * segment. If the constants used to compute the two ever
     * diverge, the tip would float off the end of the spike —
     * visible only in a running scene.
     */
    const spike = buildSpikeGeometry();
    const spikeAttr = spike.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const tip = buildTipGeometry();
    const tipAttr = tip.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(tipAttr.getY(0)).toBeCloseTo(
      spikeAttr.getY(AXIS_DOT_COUNT_PER_CAP - 1),
      6,
    );
    expect(tipAttr.getY(1)).toBeCloseTo(
      spikeAttr.getY(AXIS_DOT_COUNT_PER_CAP * 2 - 1),
      6,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* computeRingQuaternion                                                      */
/* -------------------------------------------------------------------------- */

describe("computeRingQuaternion", () => {
  it("maps +Z to +Z for the input direction (0, 0, 1)", () => {
    const q = computeRingQuaternion({ x: 0, y: 0, z: 1 });
    const rotated = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(1, 6);
  });

  it("maps +Z to +X when the direction is (1, 0, 0)", () => {
    const q = computeRingQuaternion({ x: 1, y: 0, z: 0 });
    const rotated = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(1, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(0, 6);
  });

  it("maps +Z to +Y when the direction is (0, 1, 0)", () => {
    const q = computeRingQuaternion({ x: 0, y: 1, z: 0 });
    const rotated = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(1, 6);
    expect(rotated.z).toBeCloseTo(0, 6);
  });

  it("normalizes a non-unit input direction", () => {
    /*
     * The docstring promises normalization. A 100× input must
     * produce the same quaternion as a unit input in the same
     * direction.
     */
    const unit = computeRingQuaternion({ x: 0, y: 0, z: 1 });
    const scaled = computeRingQuaternion({ x: 0, y: 0, z: 100 });

    expect(scaled.x).toBeCloseTo(unit.x, 6);
    expect(scaled.y).toBeCloseTo(unit.y, 6);
    expect(scaled.z).toBeCloseTo(unit.z, 6);
    expect(scaled.w).toBeCloseTo(unit.w, 6);
  });

  it("returns a unit-length quaternion", () => {
    for (const dir of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0.577, y: 0.577, z: 0.577 },
      { x: -1, y: 0.5, z: 0.25 },
    ]) {
      const q = computeRingQuaternion(dir);
      const magnitude = Math.hypot(q.x, q.y, q.z, q.w);
      expect(magnitude).toBeCloseTo(1, 6);
    }
  });

  it("returns finite values for every input", () => {
    const q = computeRingQuaternion({ x: 1, y: 2, z: 3 });
    expect(Number.isFinite(q.x)).toBe(true);
    expect(Number.isFinite(q.y)).toBe(true);
    expect(Number.isFinite(q.z)).toBe(true);
    expect(Number.isFinite(q.w)).toBe(true);
  });
});