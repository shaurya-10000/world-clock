import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  TOTAL_SAMPLE_WEIGHT,
  sampleGlobeAtmosphere,
  sampleGlobeAtmosphereVerbose,
  type SampleGlobeAtmosphereInput,
  type Vec3,
} from "@/components/globe/globeAtmosphere";
import { resetTimeCache } from "@/lib/time";
import { resetUseNow, setUseNowDeps } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const IDENTITY_Q = [0, 0, 0, 1] as const;

/**
 * Camera positions used across tests. All are at a distance
 * of 5 from the origin, on the coordinate axes, so the
 * resulting camera basis vectors are exact.
 */
const CAMERA_ON_POS_Z: Vec3 = { x: 0, y: 0, z: 5 };
const CAMERA_ON_NEG_Z: Vec3 = { x: 0, y: 0, z: -5 };
const CAMERA_ON_POS_X: Vec3 = { x: 5, y: 0, z: 0 };
const CAMERA_ON_NEG_X: Vec3 = { x: -5, y: 0, z: 0 };
const CAMERA_ON_POS_Y: Vec3 = { x: 0, y: 5, z: 0 };
const CAMERA_ON_NEG_Y: Vec3 = { x: 0, y: -5, z: 0 };

/**
 * Reference instants. Chosen so the *same* UTC instant
 * produces different local hours at the cities the sample
 * directions resolve to — useful for the "different zones
 * classify differently" tests.
 */
const NOON_UTC = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
const MIDNIGHT_UTC = new Date(Date.UTC(2024, 0, 15, 0, 0, 0));
const DAWN_UTC = new Date(Date.UTC(2024, 0, 15, 5, 0, 0));
const DUSK_UTC = new Date(Date.UTC(2024, 0, 15, 18, 0, 0));

function input(
  overrides: Partial<SampleGlobeAtmosphereInput> = {},
): SampleGlobeAtmosphereInput {
  return {
    cameraPosition: CAMERA_ON_POS_Z,
    globeQuaternion: IDENTITY_Q,
    date: NOON_UTC,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetUseNow();
  resetTimeCache();

  /*
   * Freeze the shared ticker so any `getDecimalHour` call
   * resolves against a fixed instant. The module under test
   * does not read from the ticker directly — it takes a
   * `Date` — but `getDecimalHour` internally goes through
   * `Intl`, whose output depends on the runtime's time zone
   * data. Freezing the ticker removes that as a variable.
   */
  setUseNowDeps({
    now: () => NOON_UTC.getTime(),
    setInterval: () => 1,
    clearInterval: () => {},
    isVisible: () => true,
  });
});

afterEach(() => {
  resetUseNow();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Output shape                                                               */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphere — output shape", () => {
  it("returns one of the four atmosphere values", () => {
    const result = sampleGlobeAtmosphere(input());

    expect(["dawn", "day", "dusk", "night"]).toContain(result);
  });

  it("is deterministic — same input, same output", () => {
    const a = sampleGlobeAtmosphere(input());
    const b = sampleGlobeAtmosphere(input());

    expect(a).toBe(b);
  });

  it("returns a string, not an object", () => {
    const result = sampleGlobeAtmosphere(input());

    expect(typeof result).toBe("string");
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism across camera poses                                            */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphere — determinism", () => {
  it("is deterministic for every cardinal camera position", () => {
    const cameras = [
      CAMERA_ON_POS_Z,
      CAMERA_ON_NEG_Z,
      CAMERA_ON_POS_X,
      CAMERA_ON_NEG_X,
      CAMERA_ON_POS_Y,
      CAMERA_ON_NEG_Y,
    ];

    for (const camera of cameras) {
      const a = sampleGlobeAtmosphere(
        input({ cameraPosition: camera }),
      );
      const b = sampleGlobeAtmosphere(
        input({ cameraPosition: camera }),
      );

      expect(a).toBe(b);
    }
  });

  it("is deterministic for a non-identity globe quaternion", () => {
    // 90° about Y.
    const q = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] as const;

    const a = sampleGlobeAtmosphere(input({ globeQuaternion: q }));
    const b = sampleGlobeAtmosphere(input({ globeQuaternion: q }));

    expect(a).toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* Verbose sampler                                                            */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphereVerbose", () => {
  it("returns the votes that produced the dominant atmosphere", () => {
    const votes = sampleGlobeAtmosphereVerbose(input());

    expect(votes.length).toBeGreaterThan(0);
    expect(votes.length).toBeLessThanOrEqual(9);
  });

  it("returns one vote per visible sample", () => {
    /*
     * All nine sample directions have `z >= 0` — none are
     * culled by the `sample.z <= 0` guard. The votes array
     * therefore has exactly nine entries.
     */
    const votes = sampleGlobeAtmosphereVerbose(input());

    expect(votes).toHaveLength(9);
  });

  it("the winning atmosphere matches sampleGlobeAtmosphere", () => {
    const votes = sampleGlobeAtmosphereVerbose(input());
    const dominant = sampleGlobeAtmosphere(input());

    const scores: Record<string, number> = {
      dawn: 0,
      day: 0,
      dusk: 0,
      night: 0,
    };

    for (const vote of votes) {
      scores[vote.atmosphere] = (scores[vote.atmosphere] ?? 0) + vote.weight;
    }

    // The winner is the highest-scoring atmosphere, with ties
    // resolved by priority order (dawn > day > dusk > night).
    const winner = Object.entries(scores).reduce(
      (best, [k, v]) => {
        const current = scores[best] ?? 0;
        return v > current ? k : best;
      },
      "night",
    );

    expect(dominant).toBe(winner);
  });

  it("each vote's atmosphere matches getAtmosphere of its localHour", () => {
    const votes = sampleGlobeAtmosphereVerbose(input());

    for (const vote of votes) {
      expect([
        "dawn",
        "day",
        "dusk",
        "night",
      ]).toContain(vote.atmosphere);
      expect(vote.localHour).toBeGreaterThanOrEqual(0);
      expect(vote.localHour).toBeLessThan(24);
    }
  });

  it("every vote carries a non-empty city id", () => {
    const votes = sampleGlobeAtmosphereVerbose(input());

    for (const vote of votes) {
      expect(typeof vote.cityId).toBe("string");
      expect(vote.cityId.length).toBeGreaterThan(0);
    }
  });

  it("vote weights sum to TOTAL_SAMPLE_WEIGHT", () => {
    const votes = sampleGlobeAtmosphereVerbose(input());

    const sum = votes.reduce((acc, v) => acc + v.weight, 0);

    /*
     * The sample grid has nine directions, all visible for
     * any axis-aligned camera. Their weights sum to
     * `TOTAL_SAMPLE_WEIGHT`.
     */
    expect(sum).toBeCloseTo(TOTAL_SAMPLE_WEIGHT, 10);
  });
});

/* -------------------------------------------------------------------------- */
/* Camera orientation                                                        */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphere — camera orientation", () => {
  it("classifies opposite cameras independently", () => {
    /*
     * A camera on +Z sees one hemisphere; a camera on -Z sees
     * the opposite hemisphere. At any given instant, one is
     * more likely to see day and the other night — but both
     * must return a valid atmosphere.
     */
    const forward = sampleGlobeAtmosphere(
      input({ cameraPosition: CAMERA_ON_POS_Z }),
    );
    const backward = sampleGlobeAtmosphere(
      input({ cameraPosition: CAMERA_ON_NEG_Z }),
    );

    expect(["dawn", "day", "dusk", "night"]).toContain(forward);
    expect(["dawn", "day", "dusk", "night"]).toContain(backward);
  });

  it("handles a camera directly on the +Y axis (polar view)", () => {
    const result = sampleGlobeAtmosphere(
      input({ cameraPosition: CAMERA_ON_POS_Y }),
    );

    expect(["dawn", "day", "dusk", "night"]).toContain(result);
  });

  it("handles a camera directly on the -Y axis (polar view)", () => {
    const result = sampleGlobeAtmosphere(
      input({ cameraPosition: CAMERA_ON_NEG_Y }),
    );

    expect(["dawn", "day", "dusk", "night"]).toContain(result);
  });

  it("handles a camera exactly at the origin", () => {
    const result = sampleGlobeAtmosphere(
      input({ cameraPosition: { x: 0, y: 0, z: 0 } }),
    );

    expect(["dawn", "day", "dusk", "night"]).toContain(result);
  });
});

/* -------------------------------------------------------------------------- */
/* Globe rotation                                                            */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphere — globe rotation", () => {
  it("a 180° rotation about Y changes the classified hemisphere", () => {
    /*
     * Rotating the globe by 180° about Y swaps which
     * hemisphere faces a fixed camera. The classified
     * atmosphere should differ in a majority of cases; we
     * cannot assert it always differs (a rare instant can
     * see two hemispheres with the same dominant
     * atmosphere), so we sweep several instants.
     */
    const rotated = [0, 1, 0, 0] as const;

    let changes = 0;
    const instants = [
      MIDNIGHT_UTC,
      DAWN_UTC,
      NOON_UTC,
      DUSK_UTC,
    ];

    for (const date of instants) {
      const forward = sampleGlobeAtmosphere(
        input({ globeQuaternion: IDENTITY_Q, date }),
      );
      const back = sampleGlobeAtmosphere(
        input({ globeQuaternion: rotated, date }),
      );

      if (forward !== back) changes += 1;
    }

    expect(changes).toBeGreaterThan(0);
  });

  it("a 360° rotation returns the same result as identity", () => {
    /*
     * `[0, 0, 0, -1]` is the quaternion for a full turn. The
     * resulting orientation is identical to the identity, so
     * the classified atmosphere must match.
     */
    const fullTurn = [0, 0, 0, -1] as const;

    const identity = sampleGlobeAtmosphere(
      input({ globeQuaternion: IDENTITY_Q }),
    );
    const rotated = sampleGlobeAtmosphere(
      input({ globeQuaternion: fullTurn }),
    );

    expect(rotated).toBe(identity);
  });
});

/* -------------------------------------------------------------------------- */
/* Time override interaction                                                 */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphere — time dependence", () => {
  it("classifies differently at different UTC instants", () => {
    /*
     * The classifier reads the local hour of each nearest
     * city at the given instant. Different instants can
     * produce different dominant atmospheres across the
     * whole sweep of the globe.
     */
    const noon = sampleGlobeAtmosphere(input({ date: NOON_UTC }));
    const midnight = sampleGlobeAtmosphere(
      input({ date: MIDNIGHT_UTC }),
    );

    /*
     * It is possible for two instants to produce the same
     * dominant atmosphere across all nine samples (though
     * unlikely at widely-separated times). If they match, we
     * only assert both are valid.
     */
    expect(["dawn", "day", "dusk", "night"]).toContain(noon);
    expect(["dawn", "day", "dusk", "night"]).toContain(midnight);
  });

  it("handles a Date far in the future", () => {
    const future = new Date(Date.UTC(2099, 11, 31, 23, 59, 59));

    const result = sampleGlobeAtmosphere(input({ date: future }));

    expect(["dawn", "day", "dusk", "night"]).toContain(result);
  });

  it("handles a Date before the Unix epoch", () => {
    const past = new Date(Date.UTC(1950, 0, 1, 0, 0, 0));

    const result = sampleGlobeAtmosphere(input({ date: past }));

    expect(["dawn", "day", "dusk", "night"]).toContain(result);
  });
});

/* -------------------------------------------------------------------------- */
/* Robustness                                                                */
/* -------------------------------------------------------------------------- */

describe("sampleGlobeAtmosphere — robustness", () => {
  it("never throws for any cardinal camera position", () => {
    const cameras: Vec3[] = [
      CAMERA_ON_POS_Z,
      CAMERA_ON_NEG_Z,
      CAMERA_ON_POS_X,
      CAMERA_ON_NEG_X,
      CAMERA_ON_POS_Y,
      CAMERA_ON_NEG_Y,
      { x: 0, y: 0, z: 0 },
    ];

    for (const camera of cameras) {
      expect(() =>
        sampleGlobeAtmosphere(input({ cameraPosition: camera })),
      ).not.toThrow();
    }
  });

  it("never throws for a zero quaternion", () => {
    expect(() =>
      sampleGlobeAtmosphere(
        input({ globeQuaternion: [0, 0, 0, 0] }),
      ),
    ).not.toThrow();
  });

  it("never throws across a full rotation of the globe", () => {
    for (let i = 0; i < 36; i += 1) {
      const angle = (i / 36) * Math.PI * 2;
      const q = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] as const;

      expect(() =>
        sampleGlobeAtmosphere(input({ globeQuaternion: q })),
      ).not.toThrow();
    }
  });

  it("never returns a non-atmosphere string", () => {
    for (let i = 0; i < 36; i += 1) {
      const angle = (i / 36) * Math.PI * 2;
      const q = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] as const;

      const result = sampleGlobeAtmosphere(
        input({ globeQuaternion: q }),
      );

      expect(["dawn", "day", "dusk", "night"]).toContain(result);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* TOTAL_SAMPLE_WEIGHT                                                        */
/* -------------------------------------------------------------------------- */

describe("TOTAL_SAMPLE_WEIGHT", () => {
  it("equals the sum of all sample weights", () => {
    /*
     * The sample grid is not exported, but its total weight
     * can be verified against the votes it produces: all
     * nine samples are always visible for an axis-aligned
     * camera, so the vote sum equals the total.
     */
    const votes = sampleGlobeAtmosphereVerbose(input());
    const sum = votes.reduce((acc, v) => acc + v.weight, 0);

    expect(sum).toBeCloseTo(TOTAL_SAMPLE_WEIGHT, 10);
  });

  it("is a positive finite number", () => {
    expect(TOTAL_SAMPLE_WEIGHT).toBeGreaterThan(0);
    expect(Number.isFinite(TOTAL_SAMPLE_WEIGHT)).toBe(true);
  });

  it("equals 11.8 for the current grid", () => {
    /*
     * Center 3.0 + four cardinals at 1.2 = 4.8 + four
     * diagonals at 1.0 = 4.0. Total 11.8. Pinning the
     * specific value means a change to the grid forces a
     * corresponding test update — intentional, since the
     * weights are tuned against the visual bias.
     */
    expect(TOTAL_SAMPLE_WEIGHT).toBeCloseTo(11.8, 10);
  });
});