import { render } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/* Disposal counters                                                          */
/* -------------------------------------------------------------------------- */

const disposed = {
  geometries: 0,
  materials: 0,
};

/* -------------------------------------------------------------------------- */
/* three-globe mock                                                           */
/* -------------------------------------------------------------------------- */

vi.mock("three-globe", () => {
  class MockThreeGlobe {
    scale = { setScalar: () => undefined };

    showGlobe() {
      return this;
    }
    polygonsData() {
      return this;
    }
    polygonCapColor() {
      return this;
    }
    polygonSideColor() {
      return this;
    }
    polygonStrokeColor() {
      return this;
    }
    polygonAltitude() {
      return this;
    }
    clear() {
      return this;
    }

    traverse(cb: (object: THREE.Object3D) => void) {
      const single = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial(),
      );
      single.geometry.dispose = () => {
        disposed.geometries += 1;
      };
      (single.material as THREE.Material).dispose = () => {
        disposed.materials += 1;
      };

      const a = new THREE.MeshBasicMaterial();
      const b = new THREE.MeshBasicMaterial();
      a.dispose = () => {
        disposed.materials += 1;
      };
      b.dispose = () => {
        disposed.materials += 1;
      };
      const multi = new THREE.Mesh(new THREE.BufferGeometry(), [
        a,
        b,
      ]);
      multi.geometry.dispose = () => {
        disposed.geometries += 1;
      };

      cb(single);
      cb(multi);
    }
  }

  return { default: MockThreeGlobe };
});

vi.mock("@react-three/fiber", () => ({
  primitive: ({ object }: { object: unknown }) => (
    <div
      data-testid="r3f-primitive"
      data-object={String(!!object)}
    />
  ),
}));

import CountryPolygons, {
  disposeObject,
} from "@/components/globe/CountryPolygons";

beforeEach(() => {
  disposed.geometries = 0;
  disposed.materials = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Resource disposal through the component                                    */
/* -------------------------------------------------------------------------- */

describe("CountryPolygons — resource disposal", () => {
  it("disposes the geometry of every mesh in the scene graph", () => {
    const { unmount } = render(<CountryPolygons />);
    unmount();
    expect(disposed.geometries).toBe(2);
  });

  it("disposes a single material on a mesh whose material is not an array", () => {
    const { unmount } = render(<CountryPolygons />);
    unmount();
    /* 1 single-material mesh + 2 from the array-material mesh. */
    expect(disposed.materials).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* disposeObject helper                                                       */
/* -------------------------------------------------------------------------- */

describe("disposeObject — direct", () => {
  it("disposes the geometry of a mesh", () => {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    let disposedGeometry = false;
    mesh.geometry.dispose = () => {
      disposedGeometry = true;
    };

    disposeObject(mesh);

    expect(disposedGeometry).toBe(true);
  });

  it("disposes a single material", () => {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    let disposedMaterial = false;
    (mesh.material as THREE.Material).dispose = () => {
      disposedMaterial = true;
    };

    disposeObject(mesh);

    expect(disposedMaterial).toBe(true);
  });

  it("disposes each material in a material array", () => {
    const materials = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ];
    let disposed = 0;
    materials.forEach((m) => {
      m.dispose = () => {
        disposed += 1;
      };
    });

    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      materials,
    );

    disposeObject(mesh);

    expect(disposed).toBe(2);
  });

  it("ignores objects that are not meshes", () => {
    const group = new THREE.Group();
    const point = new THREE.Points();
    const line = new THREE.Line();

    expect(() => disposeObject(group)).not.toThrow();
    expect(() => disposeObject(point)).not.toThrow();
    expect(() => disposeObject(line)).not.toThrow();
  });

  it("does not throw when the geometry is null", () => {
    /*
     * A three.js `Mesh` cannot be *constructed* with a null
     * geometry — the constructor calls `updateMorphTargets`,
     * which reads `geometry.morphAttributes`. But the field
     * is writable, so a mesh can be *mutated* to have a null
     * geometry after construction. That is the scenario
     * `disposeObject` guards against with its optional
     * chaining.
     */
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    mesh.geometry = null as unknown as THREE.BufferGeometry;

    expect(() => disposeObject(mesh)).not.toThrow();
  });

  it("does not throw when the material is null", () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.material = null as unknown as THREE.Material;

    expect(() => disposeObject(mesh)).not.toThrow();
  });

  it("does not throw when a material in the array is null", () => {
    /*
     * A malformed material array is possible with three-globe's
     * internal mesh construction. The optional-chaining guard
     * skips the null entries without a crash.
     */
    const materials = [
      new THREE.MeshBasicMaterial(),
      null,
      new THREE.MeshBasicMaterial(),
    ] as unknown as THREE.Material[];

    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      materials,
    );

    let disposed = 0;
    materials.forEach((m) => {
      if (m) {
        m.dispose = () => {
          disposed += 1;
        };
      }
    });

    expect(() => disposeObject(mesh)).not.toThrow();
    expect(disposed).toBe(2);
  });

  it("does not throw when the mesh has no geometry and no material", () => {
    const mesh = new THREE.Mesh();
    mesh.geometry = null as unknown as THREE.BufferGeometry;
    mesh.material = null as unknown as THREE.Material;

    expect(() => disposeObject(mesh)).not.toThrow();
  });
});