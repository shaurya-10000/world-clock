import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  applySunToLight,
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
  computeCloudRotation,
  createAtmosphereUniforms,
} from "@/components/globe/RealisticEarthSphere";
import {
  ATMOSPHERE_RIM_COLOR,
  ATMOSPHERE_RIM_OPACITY,
  ATMOSPHERE_RIM_POWER,
  CLOUD_ROTATION_SPEED,
} from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Shader source                                                              */
/* -------------------------------------------------------------------------- */

describe("RealisticEarthSphere — shader source", () => {
  it("declares vWorldNormal in the vertex shader", () => {
    expect(ATMOSPHERE_VERTEX_SHADER).toContain("vWorldNormal");
  });

  it("declares vWorldPosition in the vertex shader", () => {
    expect(ATMOSPHERE_VERTEX_SHADER).toContain("vWorldPosition");
  });

  it("transforms the normal by the model matrix", () => {
    expect(ATMOSPHERE_VERTEX_SHADER).toContain(
      "mat3(modelMatrix) * normal",
    );
  });

  it("declares the three atmosphere uniforms in the fragment shader", () => {
    expect(ATMOSPHERE_FRAGMENT_SHADER).toContain("uColor");
    expect(ATMOSPHERE_FRAGMENT_SHADER).toContain("uOpacity");
    expect(ATMOSPHERE_FRAGMENT_SHADER).toContain("uPower");
  });

  it("uses a Fresnel term and raises it to a power", () => {
    expect(ATMOSPHERE_FRAGMENT_SHADER).toContain("fresnel");
    expect(ATMOSPHERE_FRAGMENT_SHADER).toContain("pow(fresnel");
  });

  it("uses cameraPosition for the view direction", () => {
    expect(ATMOSPHERE_FRAGMENT_SHADER).toContain("cameraPosition");
  });
});

/* -------------------------------------------------------------------------- */
/* createAtmosphereUniforms                                                   */
/* -------------------------------------------------------------------------- */

describe("createAtmosphereUniforms", () => {
  it("initializes uColor to a THREE.Color matching ATMOSPHERE_RIM_COLOR", () => {
    const { uColor } = createAtmosphereUniforms();
    const expected = new THREE.Color(ATMOSPHERE_RIM_COLOR);
    expect(uColor.value.getHex()).toBe(expected.getHex());
  });

  it("initializes uOpacity to ATMOSPHERE_RIM_OPACITY", () => {
    const { uOpacity } = createAtmosphereUniforms();
    expect(uOpacity.value).toBe(ATMOSPHERE_RIM_OPACITY);
  });

  it("initializes uPower to ATMOSPHERE_RIM_POWER", () => {
    const { uPower } = createAtmosphereUniforms();
    expect(uPower.value).toBe(ATMOSPHERE_RIM_POWER);
  });

  it("returns a fresh Color instance on every call", () => {
    const a = createAtmosphereUniforms();
    const b = createAtmosphereUniforms();
    expect(a.uColor.value).not.toBe(b.uColor.value);
  });

  it("returns a fresh uniforms object on every call", () => {
    const a = createAtmosphereUniforms();
    const b = createAtmosphereUniforms();
    expect(a).not.toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* applySunToLight                                                            */
/* -------------------------------------------------------------------------- */

describe("applySunToLight — cardinal directions", () => {
  it("positions the light at the correct distance for a +X sun", () => {
    const light = new THREE.DirectionalLight();
    applySunToLight(light, { x: 1, y: 0, z: 0 }, 10);

    expect(light.position.length()).toBeCloseTo(10, 6);
    expect(Number.isFinite(light.position.x)).toBe(true);
    expect(Number.isFinite(light.position.y)).toBe(true);
    expect(Number.isFinite(light.position.z)).toBe(true);
  });

  it("leaves the +Y direction unchanged by a Y-axis rotation", () => {
    const light = new THREE.DirectionalLight();
    applySunToLight(light, { x: 0, y: 1, z: 0 }, 10);

    expect(light.position.x).toBeCloseTo(0, 6);
    expect(light.position.y).toBeCloseTo(10, 6);
    expect(light.position.z).toBeCloseTo(0, 6);
  });

  it("preserves the vector's magnitude at every cardinal direction", () => {
    const distance = 12;
    for (const dir of [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]) {
      const light = new THREE.DirectionalLight();
      applySunToLight(light, dir, distance);
      expect(light.position.length()).toBeCloseTo(distance, 6);
    }
  });

  it("does not mutate the input sun vector", () => {
    const sun = { x: 0.1, y: 0.2, z: 0.3 };
    const light = new THREE.DirectionalLight();
    applySunToLight(light, sun);

    expect(sun).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
  });
});

describe("applySunToLight — distance parameter", () => {
  it("uses a default distance of 10 when not provided", () => {
    const light = new THREE.DirectionalLight();
    applySunToLight(light, { x: 0, y: 1, z: 0 });
    expect(light.position.length()).toBeCloseTo(10, 6);
  });

  it("scales the position by the provided distance", () => {
    const light = new THREE.DirectionalLight();
    applySunToLight(light, { x: 0, y: 1, z: 0 }, 3.5);
    expect(light.position.length()).toBeCloseTo(3.5, 6);
  });

  it("handles a distance of zero without producing NaN", () => {
    /*
     * Multiplying by zero can produce `-0` when the multiplicand
     * is negative, and `toBe(0)` uses `Object.is`, which
     * distinguishes `0` from `-0`. The meaningful assertion is
     * that every component is numerically zero and finite.
     */
    const light = new THREE.DirectionalLight();
    applySunToLight(light, { x: 1, y: 1, z: 1 }, 0);

    expect(light.position.x).toBeCloseTo(0, 10);
    expect(light.position.y).toBeCloseTo(0, 10);
    expect(light.position.z).toBeCloseTo(0, 10);
    expect(Number.isNaN(light.position.x)).toBe(false);
    expect(Number.isNaN(light.position.y)).toBe(false);
    expect(Number.isNaN(light.position.z)).toBe(false);
  });
});

describe("applySunToLight — frame rotation", () => {
  it("rotates the sun by the inverse texture-frame rotation about Y", () => {
    const light = new THREE.DirectionalLight();
    applySunToLight(light, { x: 1, y: 0, z: 0 }, 10);

    const xzMagnitude = Math.hypot(
      light.position.x,
      light.position.z,
    );
    expect(xzMagnitude).toBeCloseTo(10, 6);
  });

  it("produces a different position for two orthogonal in-plane directions", () => {
    const a = new THREE.DirectionalLight();
    const b = new THREE.DirectionalLight();
    applySunToLight(a, { x: 1, y: 0, z: 0 }, 10);
    applySunToLight(b, { x: 0, y: 0, z: 1 }, 10);

    expect(
      a.position.x === b.position.x &&
        a.position.z === b.position.z,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* computeCloudRotation                                                       */
/* -------------------------------------------------------------------------- */

describe("computeCloudRotation", () => {
  it("advances by CLOUD_ROTATION_SPEED times the clamped delta", () => {
    /*
     * The delta is clamped to [0, 0.25]. A 1-second delta is
     * therefore clamped to 0.25 — the result is one quarter of
     * a full second's rotation, not a full second's.
     */
    const result = computeCloudRotation(0, 1);
    expect(result).toBeCloseTo(CLOUD_ROTATION_SPEED * 0.25, 6);
  });

  it("accumulates across calls with each delta clamped independently", () => {
    /*
     * Two 0.5-second deltas each clamp to 0.25, so the total
     * advance is `CLOUD_ROTATION_SPEED * 0.5`. This pins the
     * "clamp per call" semantics: the clamp is not a running
     * budget.
     */
    const first = computeCloudRotation(0, 0.5);
    const second = computeCloudRotation(first, 0.5);
    expect(second).toBeCloseTo(CLOUD_ROTATION_SPEED * 0.5, 6);
  });

  it("advances by the exact amount for a delta at the clamp boundary", () => {
    const result = computeCloudRotation(0, 0.25);
    expect(result).toBeCloseTo(CLOUD_ROTATION_SPEED * 0.25, 6);
  });

  it("advances by the exact amount for a delta below the clamp", () => {
    const result = computeCloudRotation(0, 0.1);
    expect(result).toBeCloseTo(CLOUD_ROTATION_SPEED * 0.1, 6);
  });

  it("clamps a large positive delta to 0.25 seconds", () => {
    const result = computeCloudRotation(0, 100);
    expect(result).toBeCloseTo(CLOUD_ROTATION_SPEED * 0.25, 6);
  });

  it("treats a negative delta as zero (no rewind)", () => {
    const result = computeCloudRotation(0, -1);
    expect(result).toBe(0);
  });

  it("treats a zero delta as a no-op", () => {
    const result = computeCloudRotation(1.5, 0);
    expect(result).toBe(1.5);
  });

  it("returns a finite value for extreme inputs", () => {
    expect(
      Number.isFinite(computeCloudRotation(0, Number.MAX_VALUE)),
    ).toBe(true);
    expect(
      Number.isFinite(computeCloudRotation(0, -Number.MAX_VALUE)),
    ).toBe(true);
    expect(
      Number.isFinite(computeCloudRotation(Number.MAX_VALUE, 1)),
    ).toBe(true);
  });

  it("is monotonic in delta up to the clamp", () => {
    let previous = computeCloudRotation(0, 0);
    for (let dt = 0.01; dt < 0.25; dt += 0.01) {
      const next = computeCloudRotation(0, dt);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it("is a pure function of its inputs", () => {
    const a = computeCloudRotation(0.5, 0.1);
    const b = computeCloudRotation(0.5, 0.1);
    expect(a).toBe(b);
  });
});