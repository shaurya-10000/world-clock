import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import ReactThreeTestRenderer from "@react-three/test-renderer";

/*
 * ## Why this file uses `@react-three/test-renderer`
 *
 * The component renders R3F intrinsics (`<group>`, `<mesh>`,
 * `<sphereGeometry>`, `<meshBasicMaterial>`). Those are strings
 * that R3F's reconciler intercepts when the tree is inside a
 * `<Canvas>`. Outside a Canvas, React's DOM renderer treats
 * them as unknown HTML tags — the refs point at DOM elements
 * and the props are dropped.
 *
 * Mocking `@react-three/fiber` does not help: the intrinsics
 * are not module exports, so there is nothing to mock. The
 * test-renderer provides a real R3F reconciler for tests,
 * making every intrinsic into the THREE object it would be
 * inside a live Canvas.
 *
 * ## On the renderer type
 *
 * The `@react-three/test-renderer` package does not ship a
 * public type alias for the object returned by `create`.
 * Rather than fight the package's typings, every helper below
 * infers the renderer type from the argument it is given
 * (`Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>`
 * at the call site, or a plain structural parameter in the
 * helpers). This keeps the type surface minimal and matches
 * what the package actually exports.
 */

import GlobeMarker from "@/components/globe/GlobeMarker";
import {
  MARKER_COLOR,
  MARKER_COLOR_FAVORITED,
  MARKER_COLOR_SELECTED,
  MARKER_HALO_OPACITY,
  MARKER_HALO_RADIUS,
  MARKER_RADIUS,
  MARKER_RADIUS_SELECTED,
} from "@/components/globe/constants";
import { WORLD_LOCATIONS, type WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * Pull a real catalog entry so the fixture satisfies the
 * `Continent` union without hand-rolling the value.
 */
const LOCATION: WorldLocation = WORLD_LOCATIONS.find(
  (loc) => loc.id === "tokyo",
)!;

/* -------------------------------------------------------------------------- */
/* Renderer helpers                                                           */
/* -------------------------------------------------------------------------- */

/*
 * The renderer object is the value returned by
 * `ReactThreeTestRenderer.create(...)`. Its exact type is
 * declared inside the package and not re-exported as a
 * namespace, so the helpers below accept a structurally-typed
 * argument instead of naming the type.
 *
 * The minimal shape the helpers need is `{ scene: { findAll,
 * findAllByType } }`. Both methods return arrays of test
 * instances whose `instance` field is the underlying THREE
 * object.
 */
interface TestInstance {
  readonly instance: unknown;
}

interface TestScene {
  findAll: (predicate: (node: TestInstance) => boolean) => TestInstance[];
  findAllByType: (type: string) => TestInstance[];
}

interface TestRenderer {
  readonly scene: TestScene;
}

function findMeshes(renderer: TestRenderer): TestInstance[] {
  return renderer.scene.findAllByType("Mesh");
}

function findGeometries(renderer: TestRenderer): TestInstance[] {
  return renderer.scene.findAll(
    (node) => node.instance instanceof THREE.SphereGeometry,
  );
}

function findMaterials(renderer: TestRenderer): TestInstance[] {
  return renderer.scene.findAll(
    (node) => node.instance instanceof THREE.MeshBasicMaterial,
  );
}

function geometryAt(
  renderer: TestRenderer,
  index: number,
): THREE.SphereGeometry {
  return findGeometries(renderer)[index]!.instance as THREE.SphereGeometry;
}

function materialAt(
  renderer: TestRenderer,
  index: number,
): THREE.MeshBasicMaterial {
  return findMaterials(renderer)[index]!
    .instance as THREE.MeshBasicMaterial;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Track every mounted renderer so `afterEach` can unmount them
 * cleanly. Leaking an unmounted renderer into the next test
 * produces spurious warnings and, under some versions of the
 * test-renderer, keeps a THREE object graph alive.
 */
let renderers: Array<{
  unmount: () => Promise<unknown> | unknown;
}> = [];

beforeEach(() => {
  renderers = [];
  vi.clearAllMocks();
});

afterEach(async () => {
  for (const r of renderers) {
    try {
      await r.unmount();
    } catch {
      /* Already unmounted. */
    }
  }
  renderers = [];
  vi.restoreAllMocks();
});

interface RenderOptions {
  selected?: boolean;
  favorited?: boolean;
  transient?: boolean;
  traveling?: boolean;
  visualMode?: "minimal" | "realistic";
}

async function createMarker(opts: RenderOptions = {}) {
  const onSelect = vi.fn();

  const renderer = await ReactThreeTestRenderer.create(
    <GlobeMarker
      location={LOCATION}
      selected={opts.selected ?? false}
      favorited={opts.favorited ?? false}
      transient={opts.transient ?? false}
      traveling={opts.traveling ?? false}
      visualMode={opts.visualMode ?? "minimal"}
      onSelect={onSelect}
    />,
  );

  renderers.push(renderer);

  return { renderer, onSelect };
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — structure", () => {
  it("renders without throwing", async () => {
    await expect(createMarker()).resolves.toBeDefined();
  });

  it("renders exactly one solid mesh when unselected", async () => {
    const { renderer } = await createMarker();
    expect(findMeshes(renderer)).toHaveLength(1);
  });

  it("renders exactly two meshes when selected (solid + halo)", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(findMeshes(renderer)).toHaveLength(2);
  });

  it("renders two SphereGeometry instances when selected", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(findGeometries(renderer)).toHaveLength(2);
  });

  it("renders one SphereGeometry instance when unselected", async () => {
    const { renderer } = await createMarker();
    expect(findGeometries(renderer)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Color                                                                      */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — material color", () => {
  it("uses the gray color for an unselected, unfavorited marker", async () => {
    const { renderer } = await createMarker();
    expect(materialAt(renderer, 0).color.getHexString()).toBe(
      MARKER_COLOR.slice(1).toLowerCase(),
    );
  });

  it("uses the gold color when selected", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(materialAt(renderer, 0).color.getHexString()).toBe(
      MARKER_COLOR_SELECTED.slice(1).toLowerCase(),
    );
  });

  it("uses the pink color when favorited", async () => {
    const { renderer } = await createMarker({ favorited: true });
    expect(materialAt(renderer, 0).color.getHexString()).toBe(
      MARKER_COLOR_FAVORITED.slice(1).toLowerCase(),
    );
  });

  it("uses the pink color when both favorited and selected", async () => {
    const { renderer } = await createMarker({
      favorited: true,
      selected: true,
    });
    expect(materialAt(renderer, 0).color.getHexString()).toBe(
      MARKER_COLOR_FAVORITED.slice(1).toLowerCase(),
    );
  });

  it("uses the same color for the halo and the solid mesh", async () => {
    const { renderer } = await createMarker({
      selected: true,
      favorited: true,
    });
    expect(materialAt(renderer, 0).color.getHex()).toBe(
      materialAt(renderer, 1).color.getHex(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — geometry", () => {
  it("uses MARKER_RADIUS when unselected", async () => {
    const { renderer } = await createMarker();
    expect(geometryAt(renderer, 0).parameters.radius).toBeCloseTo(
      MARKER_RADIUS,
      6,
    );
  });

  it("uses MARKER_RADIUS_SELECTED when selected", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(geometryAt(renderer, 0).parameters.radius).toBeCloseTo(
      MARKER_RADIUS_SELECTED,
      6,
    );
  });

  it("uses MARKER_HALO_RADIUS for the halo geometry", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(geometryAt(renderer, 1).parameters.radius).toBeCloseTo(
      MARKER_HALO_RADIUS,
      6,
    );
  });

  it("uses 20×20 segments for the solid mesh", async () => {
    const { renderer } = await createMarker();
    const geo = geometryAt(renderer, 0);
    expect(geo.parameters.widthSegments).toBe(20);
    expect(geo.parameters.heightSegments).toBe(20);
  });

  it("uses 24×24 segments for the halo mesh", async () => {
    const { renderer } = await createMarker({ selected: true });
    const geo = geometryAt(renderer, 1);
    expect(geo.parameters.widthSegments).toBe(24);
    expect(geo.parameters.heightSegments).toBe(24);
  });
});

/* -------------------------------------------------------------------------- */
/* Transiency                                                                 */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — transiency", () => {
  it("renders a fully opaque material when not transient", async () => {
    const { renderer } = await createMarker();
    const material = materialAt(renderer, 0);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
  });

  it("renders a slightly transparent material when transient", async () => {
    const { renderer } = await createMarker({ transient: true });
    const material = materialAt(renderer, 0);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeGreaterThan(0);
    expect(material.opacity).toBeLessThan(1);
  });

  it("does not change the color when transient", async () => {
    const a = await createMarker({ transient: false });
    const b = await createMarker({ transient: true });

    const colorA = materialAt(a.renderer, 0).color.getHex();
    const colorB = materialAt(b.renderer, 0).color.getHex();

    expect(colorA).toBe(colorB);
  });
});

/* -------------------------------------------------------------------------- */
/* Halo                                                                       */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — halo", () => {
  it("renders the halo material with MARKER_HALO_OPACITY", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(materialAt(renderer, 1).opacity).toBeCloseTo(
      MARKER_HALO_OPACITY,
      6,
    );
  });

  it("does not render the halo when unselected", async () => {
    const { renderer } = await createMarker();
    expect(findMaterials(renderer)).toHaveLength(1);
  });

  it("renders the halo even when the marker is transient", async () => {
    const { renderer } = await createMarker({
      selected: true,
      transient: true,
    });
    expect(findMaterials(renderer)).toHaveLength(2);
  });
});