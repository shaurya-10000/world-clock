import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import ReactThreeTestRenderer from "@react-three/test-renderer";

/*
 * Integration scope: prop-driven transitions across re-renders
 * and the click-handler round trip.
 *
 * Uses `@react-three/test-renderer` so R3F intrinsics become
 * real THREE objects. See the component test for the full
 * reasoning on why a plain `render` cannot work here.
 */

import GlobeMarker, {
  createMarkerClickHandler,
} from "@/components/globe/GlobeMarker";
import {
  MARKER_COLOR,
  MARKER_COLOR_FAVORITED,
  MARKER_COLOR_SELECTED,
} from "@/components/globe/constants";
import { WORLD_LOCATIONS, type WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const TOKYO: WorldLocation = WORLD_LOCATIONS.find(
  (loc) => loc.id === "tokyo",
)!;
const LONDON: WorldLocation = WORLD_LOCATIONS.find(
  (loc) => loc.id === "london",
)!;

/* -------------------------------------------------------------------------- */
/* Structural helpers                                                         */
/* -------------------------------------------------------------------------- */

/*
 * The test-renderer's return type is not exported as a public
 * namespace, so the helpers below accept a structurally-typed
 * argument. See the component test for the same pattern.
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

function findMaterials(renderer: TestRenderer): TestInstance[] {
  return renderer.scene.findAll(
    (node) => node.instance instanceof THREE.MeshBasicMaterial,
  );
}

function findMeshes(renderer: TestRenderer): TestInstance[] {
  return renderer.scene.findAllByType("Mesh");
}

function meshColorHex(
  renderer: TestRenderer,
  index: number,
): string {
  const material = findMaterials(renderer)[index]!
    .instance as THREE.MeshBasicMaterial;
  return `#${material.color.getHexString()}`;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

let renderers: Array<{
  unmount: () => Promise<unknown> | unknown;
  update: (element: React.ReactNode) => Promise<unknown> | unknown;
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

async function createMarker(
  props: Partial<Parameters<typeof GlobeMarker>[0]> = {},
) {
  const onSelect = vi.fn();
  const renderer = await ReactThreeTestRenderer.create(
    <GlobeMarker
      location={props.location ?? TOKYO}
      selected={props.selected ?? false}
      favorited={props.favorited ?? false}
      transient={props.transient ?? false}
      traveling={props.traveling ?? false}
      visualMode={props.visualMode ?? "minimal"}
      onSelect={onSelect}
    />,
  );
  renderers.push(renderer);
  return { renderer, onSelect };
}

/* -------------------------------------------------------------------------- */
/* Prop-driven color transitions                                              */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — prop-driven color transitions", () => {
  it("switches from gray to gold when selected becomes true", async () => {
    const { renderer } = await createMarker({ selected: false });
    expect(meshColorHex(renderer, 0).toLowerCase()).toBe(
      MARKER_COLOR.toLowerCase(),
    );

    await renderer.update(
      <GlobeMarker
        location={TOKYO}
        selected
        favorited={false}
        transient={false}
        traveling={false}
        visualMode="minimal"
        onSelect={vi.fn()}
      />,
    );

    expect(meshColorHex(renderer, 0).toLowerCase()).toBe(
      MARKER_COLOR_SELECTED.toLowerCase(),
    );
  });

  it("switches from gray to pink when favorited becomes true", async () => {
    const { renderer } = await createMarker({ favorited: false });

    await renderer.update(
      <GlobeMarker
        location={TOKYO}
        selected={false}
        favorited
        transient={false}
        traveling={false}
        visualMode="minimal"
        onSelect={vi.fn()}
      />,
    );

    expect(meshColorHex(renderer, 0).toLowerCase()).toBe(
      MARKER_COLOR_FAVORITED.toLowerCase(),
    );
  });

  it("keeps the favorite pink when the marker becomes selected", async () => {
    const { renderer } = await createMarker({
      favorited: true,
      selected: false,
    });

    await renderer.update(
      <GlobeMarker
        location={TOKYO}
        selected
        favorited
        transient={false}
        traveling={false}
        visualMode="minimal"
        onSelect={vi.fn()}
      />,
    );

    expect(meshColorHex(renderer, 0).toLowerCase()).toBe(
      MARKER_COLOR_FAVORITED.toLowerCase(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Prop-driven size transitions                                               */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — prop-driven size transitions", () => {
  it("adds a halo when the marker becomes selected", async () => {
    const { renderer } = await createMarker({ selected: false });
    expect(findMeshes(renderer)).toHaveLength(1);

    await renderer.update(
      <GlobeMarker
        location={TOKYO}
        selected
        favorited={false}
        transient={false}
        traveling={false}
        visualMode="minimal"
        onSelect={vi.fn()}
      />,
    );

    expect(findMeshes(renderer)).toHaveLength(2);
  });

  it("removes the halo when the marker becomes unselected", async () => {
    const { renderer } = await createMarker({ selected: true });
    expect(findMeshes(renderer)).toHaveLength(2);

    await renderer.update(
      <GlobeMarker
        location={TOKYO}
        selected={false}
        favorited={false}
        transient={false}
        traveling={false}
        visualMode="minimal"
        onSelect={vi.fn()}
      />,
    );

    expect(findMeshes(renderer)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Selection handler wiring                                                   */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — selection handler wiring", () => {
  it("does not fire onSelect when the marker is not clicked", async () => {
    const { onSelect } = await createMarker();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("passes the current location to onSelect when clicked", () => {
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      TOKYO,
      false,
      onSelect,
    );
    handler({ stopPropagation: vi.fn() });
    expect(onSelect).toHaveBeenCalledWith(TOKYO);
  });

  it("does not call onSelect when the parent reports traveling", () => {
    const onSelect = vi.fn();
    const handler = createMarkerClickHandler(
      TOKYO,
      true,
      onSelect,
    );
    handler({ stopPropagation: vi.fn() });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("stops propagation even while traveling", () => {
    const handler = createMarkerClickHandler(TOKYO, true, vi.fn());
    const event = { stopPropagation: vi.fn() };
    handler(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Location change                                                            */
/* -------------------------------------------------------------------------- */

describe("GlobeMarker — location change", () => {
  it("does not throw when the location changes", async () => {
    const { renderer } = await createMarker({ location: TOKYO });

    await expect(
      renderer.update(
        <GlobeMarker
          location={LONDON}
          selected={false}
          favorited={false}
          transient={false}
          traveling={false}
          visualMode="minimal"
          onSelect={vi.fn()}
        />,
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the location changes rapidly", async () => {
    const { renderer } = await createMarker({ location: TOKYO });

    for (const loc of [LONDON, TOKYO, LONDON, TOKYO]) {
      await expect(
        renderer.update(
          <GlobeMarker
            location={loc}
            selected={false}
            favorited={false}
            transient={false}
            traveling={false}
            visualMode="minimal"
            onSelect={vi.fn()}
          />,
        ),
      ).resolves.toBeUndefined();
    }
  });
});