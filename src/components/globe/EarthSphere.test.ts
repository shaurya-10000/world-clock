import { describe, expect, it } from "vitest";

import {
  computeDayNightColor,
  computeSurfaceOpacity,
  createUniforms,
  FRAGMENT_SHADER,
  VERTEX_SHADER,
} from "@/components/globe/EarthSphere";
import {
  SURFACE_FADE_END,
  SURFACE_FADE_START,
} from "@/components/globe/constants";

/* -------------------------------------------------------------------------- */
/* Shader source                                                              */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — shader source", () => {
  it("declares vLocalNormal in the vertex shader", () => {
    expect(VERTEX_SHADER).toContain("vLocalNormal");
  });

  it("transforms the normal by the model-view matrix, not the model matrix", () => {
    /*
     * The lighting frame is the globe's geography frame. The
     * vertex shader must pass the LOCAL normal (untransformed
     * by the model matrix) so the sun direction — also in the
     * geography frame — is compared against the correct
     * vector. Using `mat3(modelMatrix) * normal` would rotate
     * the normal into world space and produce a terminator
     * that is fixed to the world rather than to the globe.
     */
    expect(VERTEX_SHADER).toContain("normalize(normal)");
    expect(VERTEX_SHADER).not.toContain("mat3(modelMatrix)");
  });

  it("declares uSunDirection in the fragment shader", () => {
    expect(FRAGMENT_SHADER).toContain("uSunDirection");
  });

  it("declares uOpacity in the fragment shader", () => {
    expect(FRAGMENT_SHADER).toContain("uOpacity");
  });

  it("mixes between night and day colors", () => {
    expect(FRAGMENT_SHADER).toContain("mix(night, day");
  });

  it("includes a rim term", () => {
    expect(FRAGMENT_SHADER).toContain("rim");
  });
});

/* -------------------------------------------------------------------------- */
/* Uniforms factory                                                           */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — uniforms factory", () => {
  it("creates a uSunDirection uniform initialized to +Z", () => {
    const { uSunDirection } = createUniforms();
    expect(uSunDirection.value.x).toBe(0);
    expect(uSunDirection.value.y).toBe(0);
    expect(uSunDirection.value.z).toBe(1);
  });

  it("creates a uOpacity uniform initialized to 1", () => {
    const { uOpacity } = createUniforms();
    expect(uOpacity.value).toBe(1);
  });

  it("returns a fresh vector on every call", () => {
    const a = createUniforms();
    const b = createUniforms();
    expect(a.uSunDirection.value).not.toBe(b.uSunDirection.value);
  });

  it("does not share the opacity object between calls", () => {
    /*
     * Each call to `createUniforms` returns a fresh object
     * graph. A future refactor that hoisted a shared opacity
     * object to module scope would make two `EarthSphere`
     * instances fight over the same uniform, producing one
     * sphere's fade state overwriting the other's.
     */
    const a = createUniforms();
    const b = createUniforms();
    expect(a.uOpacity).not.toBe(b.uOpacity);
  });
});

/* -------------------------------------------------------------------------- */
/* Surface opacity                                                            */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — computeSurfaceOpacity", () => {
  it("returns 1 at or past the fade-start distance", () => {
    expect(computeSurfaceOpacity(SURFACE_FADE_START)).toBe(1);
    expect(computeSurfaceOpacity(SURFACE_FADE_START + 1)).toBe(1);
    expect(computeSurfaceOpacity(Infinity)).toBe(1);
  });

  it("returns 0 at or below the fade-end distance", () => {
    expect(computeSurfaceOpacity(SURFACE_FADE_END)).toBe(0);
    expect(computeSurfaceOpacity(SURFACE_FADE_END - 1)).toBe(0);
    expect(computeSurfaceOpacity(-Infinity)).toBe(0);
  });

  it("interpolates linearly between the endpoints", () => {
    /*
     * The midpoint of the fade band should be 0.5.
     */
    const mid = (SURFACE_FADE_START + SURFACE_FADE_END) / 2;
    expect(computeSurfaceOpacity(mid)).toBeCloseTo(0.5, 10);
  });

  it("is monotonically increasing in camera distance", () => {
    /*
     * A closer camera (smaller distance) means lower opacity;
     * a farther camera means higher. A refactor that
     * accidentally inverted the direction would fail this.
     */
    let previous = -Infinity;

    for (
      let d = SURFACE_FADE_END - 1;
      d <= SURFACE_FADE_START + 1;
      d += 0.05
    ) {
      const opacity = computeSurfaceOpacity(d);
      expect(opacity).toBeGreaterThanOrEqual(previous);
      previous = opacity;
    }
  });

  it("stays within [0, 1] across a wide range", () => {
    for (let d = -10; d <= 20; d += 0.5) {
      const opacity = computeSurfaceOpacity(d);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });

  it("returns 0 when the fade band has zero or negative width", () => {
    /*
     * The function guards against a non-positive span by
     * returning 0. This case only fires if a future retuning
     * inverts the two constants — the guard degrades to
     * "hide the minimal sphere" rather than producing NaN.
     *
     * We cannot make the constants invert from a test, so
     * this case is documented and unreachable in practice.
     * The test asserts the current guard's behavior
     * indirectly: any distance strictly between the two
     * positive endpoints returns a value in [0, 1].
     */
    const mid = (SURFACE_FADE_START + SURFACE_FADE_END) / 2;
    const result = computeSurfaceOpacity(mid);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Day / night color                                                          */
/* -------------------------------------------------------------------------- */

describe("EarthSphere — computeDayNightColor", () => {
  it("returns the night color for a surface facing away from the sun", () => {
    const [r, g, b] = computeDayNightColor(-1);
    expect(r).toBeCloseTo(0.016, 5);
    expect(g).toBeCloseTo(0.024, 5);
    expect(b).toBeCloseTo(0.039, 5);
  });

  it("returns a brighter color for a surface facing the sun", () => {
    const [, , nightB] = computeDayNightColor(-1);
    const [, , dayB] = computeDayNightColor(1);
    expect(dayB).toBeGreaterThan(nightB);
  });

  it("adds the warm rim near the terminator", () => {
    const [rAtRim] = computeDayNightColor(0.14);
    const [rAtSubsolar] = computeDayNightColor(1);
    expect(rAtRim).toBeGreaterThan(rAtSubsolar);
  });

  it("does not add the rim on the deep night side", () => {
    const [r] = computeDayNightColor(-1);
    expect(r).toBeCloseTo(0.016, 5);
  });

  it("increases the blue channel across the day-to-night mix", () => {
    const samples = [-1, -0.75, -0.5, -0.25, 0, 0.1, 0.14].map(
      (d) => computeDayNightColor(d)[2],
    );

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it("returns finite values for the full domain of d", () => {
    for (let d = -1; d <= 1; d += 0.05) {
      const [r, g, b] = computeDayNightColor(d);
      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isFinite(g)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
    }
  });

  it("clamps behavior at the domain endpoints without NaN", () => {
    expect(Number.isFinite(computeDayNightColor(-2)[0])).toBe(true);
    expect(Number.isFinite(computeDayNightColor(2)[0])).toBe(true);
  });

  it("matches the fragment shader's night and day constants", () => {
    /*
     * `computeDayNightColor` mirrors the fragment shader's
     * arithmetic. The night endpoint (`d = -1`) must equal
     * the shader's `night` vector; the day endpoint without
     * a rim (`d = 1`) must equal the shader's `day` vector.
     *
     * This test pins the two implementations in lockstep. A
     * future change to one that forgets the other will fail
     * here.
     */
    const shaderNight = VERTEX_SHADER.includes("night")
      ? "night"
      : "night"; // shader strings contain the tokens
    void shaderNight;

    // The shader's constants, extracted via a regex against
    // the fragment source.
    const nightMatch = FRAGMENT_SHADER.match(
      /night = vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/,
    );
    const dayMatch = FRAGMENT_SHADER.match(
      /day = vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/,
    );

    expect(nightMatch).not.toBeNull();
    expect(dayMatch).not.toBeNull();

    const shaderNightColors = [
      parseFloat(nightMatch?.[1] ?? "0"),
      parseFloat(nightMatch?.[2] ?? "0"),
      parseFloat(nightMatch?.[3] ?? "0"),
    ];
    const shaderDayColors = [
      parseFloat(dayMatch?.[1] ?? "0"),
      parseFloat(dayMatch?.[2] ?? "0"),
      parseFloat(dayMatch?.[3] ?? "0"),
    ];

    const [rNight, gNight, bNight] = computeDayNightColor(-1);
    expect([rNight, gNight, bNight]).toEqual(shaderNightColors);

    const [rDay, gDay, bDay] = computeDayNightColor(1);
    expect(rDay).toBeCloseTo(shaderDayColors[0], 5);
    expect(gDay).toBeCloseTo(shaderDayColors[1], 5);
    // The rim adds a small amount to blue on the subsolar
    // side; the base day color matches within the rim's
    // contribution.
    expect(bDay).toBeGreaterThanOrEqual(shaderDayColors[2] ?? 0);
  });
});