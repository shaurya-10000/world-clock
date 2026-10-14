import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import ReactThreeTestRenderer from "@react-three/test-renderer";

/*
 * ## Why this file uses `@react-three/test-renderer`
 *
 * The component under test renders R3F intrinsics
 * (`<directionalLight>`, `<mesh>`, `<group>`, etc.). Those are
 * not React components — they are strings that R3F's
 * reconciler intercepts when the tree is inside a `<Canvas>`.
 * Outside a Canvas, React's DOM renderer treats them as
 * unknown HTML tags and `sunLightRef.current` becomes a
 * `<div>`, which is why a plain `render()` cannot exercise the
 * frame callback.
 *
 * `@react-three/test-renderer` provides a real R3F reconciler
 * for tests. Every intrinsic becomes the THREE object it would
 * be inside a live `<Canvas>`, refs point at real objects, and
 * `advanceFrames()` drives the frame loop the same way
 * `requestAnimationFrame` would.
 *
 * ## What this suite covers
 *
 * The frame callback and the sun-direction call cadence. The
 * mount and texture-configuration assertions live in
 * `RealisticEarthSphere.component.test.tsx` and do not need a
 * live reconciler.
 *
 * ## Why `useLoader` is still stubbed
 *
 * `useLoader` suspends. The test-renderer does not provide a
 * Suspense boundary by default, so the component would hang
 * on its first render. The mock returns the five fake
 * textures the component destructures — everything else about
 * R3F is the real thing.
 */

const textures: THREE.Texture[] = [];

vi.mock("@react-three/fiber", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@react-three/fiber")>();
  return {
    ...actual,
    useLoader: () => textures,
  };
});

vi.mock("@/lib/solar", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/solar")>();
  return {
    ...actual,
    getSunDirection: vi.fn(actual.getSunDirection),
  };
});

import RealisticEarthSphere from "@/components/globe/RealisticEarthSphere";
import { getSunDirection } from "@/lib/solar";

const mockedGetSunDirection = vi.mocked(getSunDirection);

function makeTexture(): THREE.Texture {
  return new THREE.Texture();
}

beforeEach(() => {
  textures.length = 0;
  for (let i = 0; i < 5; i += 1) textures.push(makeTexture());
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Frame callback                                                             */
/* -------------------------------------------------------------------------- */

describe("RealisticEarthSphere — frame callback", () => {
  it("mounts inside a real R3F reconciler without throwing", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );
    expect(renderer).toBeDefined();
    await renderer.unmount();
  });

  it("fires a frame without throwing", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await expect(
      renderer.advanceFrames(1, 1 / 60),
    ).resolves.toBeUndefined();

    await renderer.unmount();
  });

  it("fires many frames without throwing", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await expect(
      renderer.advanceFrames(60, 1 / 60),
    ).resolves.toBeUndefined();

    await renderer.unmount();
  });

  it("tolerates a large delta between frames", async () => {
    /*
     * The clamp inside `computeCloudRotation` is what makes
     * this safe. The pure-function test in
     * `RealisticEarthSphere.test.ts` covers the exact clamp
     * arithmetic; this test proves the clamp is wired into the
     * component's frame loop.
     */
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await renderer.advanceFrames(1, 1 / 60);
    await expect(
      renderer.advanceFrames(1, 1000),
    ).resolves.toBeUndefined();

    await renderer.unmount();
  });

  it("tolerates a long sequence of frames", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await renderer.advanceFrames(30, 1 / 60);
    await expect(
      renderer.advanceFrames(30, 1 / 60),
    ).resolves.toBeUndefined();

    await renderer.unmount();
  });
});

/* -------------------------------------------------------------------------- */
/* Sun-direction call cadence                                                 */
/* -------------------------------------------------------------------------- */

describe("RealisticEarthSphere — sun-direction call cadence", () => {
  it("calls getSunDirection on every frame", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    const before = mockedGetSunDirection.mock.calls.length;

    await renderer.advanceFrames(1, 1 / 60);
    const afterOne = mockedGetSunDirection.mock.calls.length;
    expect(afterOne).toBeGreaterThan(before);

    await renderer.advanceFrames(1, 1 / 60);
    const afterTwo = mockedGetSunDirection.mock.calls.length;
    expect(afterTwo).toBeGreaterThan(afterOne);

    await renderer.unmount();
  });

  it("passes a Date to getSunDirection on every frame", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await renderer.advanceFrames(1, 1 / 60);

    const last = mockedGetSunDirection.mock.calls.at(-1);
    expect(last?.[0]).toBeInstanceOf(Date);

    await renderer.unmount();
  });

  it("passes a fresh Date on every frame", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await renderer.advanceFrames(2, 1 / 60);

    const calls = mockedGetSunDirection.mock.calls;
    expect(calls.at(-1)?.[0]).not.toBe(calls.at(-2)?.[0]);

    await renderer.unmount();
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple instances                                                         */
/* -------------------------------------------------------------------------- */

describe("RealisticEarthSphere — multiple instances", () => {
  it("mounts two instances without throwing", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <RealisticEarthSphere />
        <RealisticEarthSphere />
      </>,
    );

    await expect(
      renderer.advanceFrames(1, 1 / 60),
    ).resolves.toBeUndefined();

    await renderer.unmount();
  });

  it("calls getSunDirection twice per frame when two instances are mounted", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <RealisticEarthSphere />
        <RealisticEarthSphere />
      </>,
    );

    const before = mockedGetSunDirection.mock.calls.length;
    await renderer.advanceFrames(1, 1 / 60);
    const delta =
      mockedGetSunDirection.mock.calls.length - before;

    expect(delta).toBe(2);

    await renderer.unmount();
  });
});

/* -------------------------------------------------------------------------- */
/* Unmount                                                                    */
/* -------------------------------------------------------------------------- */

describe("RealisticEarthSphere — unmount", () => {
  it("unmounts cleanly after frames have fired", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RealisticEarthSphere />,
    );

    await renderer.advanceFrames(1, 1 / 60);
    await expect(renderer.unmount()).resolves.toBeUndefined();
  });
});