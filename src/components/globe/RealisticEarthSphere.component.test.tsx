import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * ## Why this file does not touch the frame callback
 *
 * The component renders R3F intrinsics (`<group>`, `<mesh>`,
 * `<directionalLight>`, etc.). Those tags are not React
 * components — they are strings that R3F's reconciler
 * intercepts when the tree is inside a `<Canvas>`. Outside a
 * Canvas, React's DOM renderer sees `<directionalLight>` as an
 * unknown HTML element and `sunLightRef.current` becomes a
 * `<div>` rather than a `THREE.DirectionalLight`.
 *
 * That means the frame callback (which does
 * `light.position.set(...)`) cannot run safely here, and
 * mocking `@react-three/fiber` cannot fix it — the intrinsics
 * are not module exports, so there is nothing to mock.
 *
 * The frame callback is exercised in
 * `RealisticEarthSphere.integration.test.tsx`, which mounts
 * inside `@react-three/test-renderer`'s reconciler and
 * therefore has real THREE objects behind every intrinsic.
 *
 * This file asserts what the component owns independently of
 * a live R3F tree: mount behavior, texture configuration, and
 * the absence of interactive DOM.
 *
 * ## What the mock below replaces
 *
 * Only the two R3F *hooks* the component actually imports:
 *
 *   - `useLoader` — stubbed to return the five fake textures
 *     the component destructures, without suspending.
 *   - `useFrame` — a no-op, because the frame callback cannot
 *     run against a non-THREE camera in this environment. The
 *     `integration` file exercises it against real objects.
 *
 * Earlier versions of this mock also listed entries like
 * `mesh: () => null` and `directionalLight: () => null` under
 * the impression that they intercepted the JSX intrinsics.
 * They do not — `vi.mock` replaces module exports, and JSX
 * intrinsics are strings, not exports. The entries were dead
 * code and have been removed. The React warnings those
 * intrinsics emit when rendered outside a Canvas are filtered
 * by `vitest.setup.ts`.
 */

const state = vi.hoisted(() => {
  return {
    textures: [] as unknown[],
  };
});

vi.mock("@react-three/fiber", async () => {
  return {
    useLoader: () => state.textures,
    useFrame: () => {
      /* Intentionally does nothing — see file header. */
    },
  };
});

vi.mock("@/lib/solar", () => ({
  getSunDirection: () => ({ x: 0.25, y: 0.5, z: 0.75 }),
}));

vi.mock("@/components/globe/frameDate", () => ({
  resolveFrameDate: () => new Date(0),
}));

import RealisticEarthSphere from "@/components/globe/RealisticEarthSphere";
import { EARTH_TEXTURE_ANISOTROPY } from "@/components/globe/constants";

function makeTexture(): THREE.Texture {
  const t = new THREE.Texture();
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 1;
  return t;
}

beforeEach(() => {
  state.textures.length = 0;
  for (let i = 0; i < 5; i += 1) {
    state.textures.push(makeTexture());
  }
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RealisticEarthSphere — mount", () => {
  it("renders without throwing", () => {
    expect(() => render(<RealisticEarthSphere />)).not.toThrow();
  });

  it("does not introduce any focusable elements", () => {
    const { container } = render(<RealisticEarthSphere />);
    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("renders no text content to the DOM", () => {
    const { container } = render(<RealisticEarthSphere />);
    expect(container.textContent).toBe("");
  });
});

describe("RealisticEarthSphere — texture configuration", () => {
  it("sets the albedo texture's color space to sRGB", () => {
    render(<RealisticEarthSphere />);
    const t = state.textures[0] as THREE.Texture;
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it("sets the bump map's color space to linear (NoColorSpace)", () => {
    render(<RealisticEarthSphere />);
    const t = state.textures[1] as THREE.Texture;
    expect(t.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("sets the water map's color space to linear (NoColorSpace)", () => {
    render(<RealisticEarthSphere />);
    const t = state.textures[2] as THREE.Texture;
    expect(t.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("sets the night map's color space to sRGB", () => {
    render(<RealisticEarthSphere />);
    const t = state.textures[3] as THREE.Texture;
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it("sets the cloud map's color space to linear (NoColorSpace)", () => {
    render(<RealisticEarthSphere />);
    const t = state.textures[4] as THREE.Texture;
    expect(t.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("sets the anisotropy level on every texture", () => {
    render(<RealisticEarthSphere />);
    for (const raw of state.textures) {
      const t = raw as THREE.Texture;
      expect(t.anisotropy).toBe(EARTH_TEXTURE_ANISOTROPY);
    }
  });
});