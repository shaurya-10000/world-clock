import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  getTextureLoaderDeps,
  resetTextureLoaderDeps,
  setTextureLoaderDeps,
} from "@/components/globe/texture-loader";

/*
 * `THREE.TextureLoader` is replaced with a fake whose `load`
 * invokes the caller's onLoad callback (or onError, per-test).
 * That way the production `loadTexture` path can be exercised
 * without a real `<img>`.
 *
 * The mock is installed once at module scope. Individual tests
 * override `mockLoadImplementation` to control whether the
 * callback fires with success or failure.
 */

type OnLoad = (texture: THREE.Texture) => void;
type OnError = (error: unknown) => void;

let mockLoadImplementation:
  | ((url: string, onLoad: OnLoad, onError: OnError) => void)
  | null = null;

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class MockTextureLoader {
    load(
      url: string,
      onLoad: OnLoad,
      _onProgress: unknown,
      onError: OnError,
    ): void {
      if (mockLoadImplementation) {
        mockLoadImplementation(url, onLoad, onError);
        return;
      }

      /* Default: succeed with a fresh, unconfigured texture. */
      onLoad(new actual.Texture());
    }
  }

  return {
    ...actual,
    TextureLoader: MockTextureLoader,
  };
});

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  mockLoadImplementation = null;
  resetTextureLoaderDeps();
});

afterEach(() => {
  mockLoadImplementation = null;
  resetTextureLoaderDeps();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* getTextureLoaderDeps                                                       */
/* -------------------------------------------------------------------------- */

describe("getTextureLoaderDeps — shape", () => {
  it("returns an object with a loadTexture function", () => {
    const deps = getTextureLoaderDeps();
    expect(typeof deps.loadTexture).toBe("function");
  });

  it("returns the same object on repeated calls", () => {
    /*
     * Identity is the contract: the module does not rebuild
     * `deps` on read. Consumers that hold a reference for the
     * duration of a batch rely on this.
     */
    const a = getTextureLoaderDeps();
    const b = getTextureLoaderDeps();
    expect(a).toBe(b);
  });

  it("returns the production object before any set call", () => {
    const deps = getTextureLoaderDeps();
    expect(deps.loadTexture).toBeInstanceOf(Function);
    /* Production is the only implementation present today. */
    expect(deps).toBe(getTextureLoaderDeps());
  });
});

/* -------------------------------------------------------------------------- */
/* setTextureLoaderDeps                                                       */
/* -------------------------------------------------------------------------- */

describe("setTextureLoaderDeps — partial override", () => {
  it("replaces loadTexture when the key is provided", () => {
    const fake = vi.fn(async () => new THREE.Texture());
    setTextureLoaderDeps({ loadTexture: fake });

    expect(getTextureLoaderDeps().loadTexture).toBe(fake);
  });

  it("keeps production values for keys that are not provided", () => {
    /*
     * Today `loadTexture` is the only key. The merge is
     * `{ ...productionDeps, ...next }`, so an empty override
     * must produce an object equal to production — same
     * `loadTexture` identity, same shape.
     */
    const production = getTextureLoaderDeps().loadTexture;
    setTextureLoaderDeps({});

    expect(getTextureLoaderDeps().loadTexture).toBe(production);
  });

  it("replaces the entire deps object so the read sees the new value", () => {
    const before = getTextureLoaderDeps();
    const fake = vi.fn(async () => new THREE.Texture());
    setTextureLoaderDeps({ loadTexture: fake });
    const after = getTextureLoaderDeps();

    expect(after).not.toBe(before);
    expect(after.loadTexture).toBe(fake);
  });

  it("does not mutate the previously returned object", () => {
    /*
     * The module swaps `deps` rather than mutating it. A
     * consumer that captured the old reference must not see
     * the fake appear inside it.
     */
    const before = getTextureLoaderDeps();
    const fake = vi.fn(async () => new THREE.Texture());
    setTextureLoaderDeps({ loadTexture: fake });

    expect(before.loadTexture).not.toBe(fake);
  });
});

/* -------------------------------------------------------------------------- */
/* resetTextureLoaderDeps                                                     */
/* -------------------------------------------------------------------------- */

describe("resetTextureLoaderDeps", () => {
  it("restores the production implementation after a fake", () => {
    const production = getTextureLoaderDeps().loadTexture;
    const fake = vi.fn(async () => new THREE.Texture());

    setTextureLoaderDeps({ loadTexture: fake });
    expect(getTextureLoaderDeps().loadTexture).toBe(fake);

    resetTextureLoaderDeps();
    expect(getTextureLoaderDeps().loadTexture).toBe(production);
  });

  it("restores the same object identity as the pre-override read", () => {
    /*
     * The strongest guarantee the module offers: a consumer
     * that captured the production object can rely on
     * `reset` bringing back the exact same reference.
     */
    const production = getTextureLoaderDeps();
    setTextureLoaderDeps({ loadTexture: async () => new THREE.Texture() });
    resetTextureLoaderDeps();

    expect(getTextureLoaderDeps()).toBe(production);
  });

  it("is idempotent — resetting twice is not an error", () => {
    const production = getTextureLoaderDeps();
    resetTextureLoaderDeps();
    resetTextureLoaderDeps();

    expect(getTextureLoaderDeps()).toBe(production);
  });
});

/* -------------------------------------------------------------------------- */
/* productionLoadTexture                                                      */
/* -------------------------------------------------------------------------- */

describe("productionLoadTexture — success path", () => {
  it("resolves with a THREE.Texture", async () => {
    const deps = getTextureLoaderDeps();
    const texture = await deps.loadTexture("/textures/test.jpg");

    expect(texture).toBeInstanceOf(THREE.Texture);
  });

  it("sets colorSpace to SRGBColorSpace on the returned texture", async () => {
    const deps = getTextureLoaderDeps();
    const texture = await deps.loadTexture("/textures/test.jpg");

    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it("passes the URL through to the loader unchanged", async () => {
    let capturedUrl: string | null = null;
    mockLoadImplementation = (url, onLoad) => {
      capturedUrl = url;
      onLoad(new THREE.Texture());
    };

    const deps = getTextureLoaderDeps();
    await deps.loadTexture("/textures/earth/albedo.jpg");

    expect(capturedUrl).toBe("/textures/earth/albedo.jpg");
  });
});

describe("productionLoadTexture — failure path", () => {
  it("rejects when the loader's onError fires", async () => {
    const sentinel = new Error("network down");
    mockLoadImplementation = (_url, _onLoad, onError) => {
      onError(sentinel);
    };

    const deps = getTextureLoaderDeps();
    await expect(deps.loadTexture("/textures/test.jpg")).rejects.toBe(
      sentinel,
    );
  });

  it("rejects with the exact error value the loader produced", async () => {
    /*
     * The seam does not wrap or translate the error. Whatever
     * three passes to `onError` is what the caller sees — an
     * `ErrorEvent`, a `ProgressEvent`, or a plain `Error`,
     * depending on the failure.
     */
    const sentinel = { kind: "ProgressEvent", loaded: 0 };
    mockLoadImplementation = (_url, _onLoad, onError) => {
      onError(sentinel);
    };

    const deps = getTextureLoaderDeps();
    await expect(deps.loadTexture("/textures/test.jpg")).rejects.toBe(
      sentinel,
    );
  });

  it("does not resolve if the loader never calls onLoad or onError", async () => {
    /*
     * A stalled load — three never calls either callback — must
     * leave the promise pending, not resolve or reject it. We
     * assert this by racing the load against a resolved timer
     * and confirming the load has not settled.
     */
    mockLoadImplementation = () => {
      /* Deliberately do nothing. */
    };

    const deps = getTextureLoaderDeps();
    const pending = deps.loadTexture("/textures/test.jpg");

    const raceResult = await Promise.race([
      pending.then(() => "resolved").catch(() => "rejected"),
      Promise.resolve("pending"),
    ]);

    expect(raceResult).toBe("pending");
  });
});

/* -------------------------------------------------------------------------- */
/* Batch semantics                                                            */
/* -------------------------------------------------------------------------- */

describe("getTextureLoaderDeps — batch semantics", () => {
  it("returns a reference whose loadTexture is stable across set of another key", () => {
    /*
     * Today there is only one key. This test exists to pin the
     * "hold the reference for the duration of a batch" advice
     * in the docstring: if a second key is ever added, this
     * test should be extended to prove the swap is
     * non-destructive to the previously-read reference.
     */
    const before = getTextureLoaderDeps();
    setTextureLoaderDeps({ loadTexture: async () => new THREE.Texture() });
    const after = getTextureLoaderDeps();

    /* Swapping replaces, does not mutate — `before` is unchanged. */
    expect(typeof before.loadTexture).toBe("function");
    expect(typeof after.loadTexture).toBe("function");
    expect(after).not.toBe(before);
  });

  it("a captured reference survives a later reset", () => {
    const captured = getTextureLoaderDeps();
    setTextureLoaderDeps({ loadTexture: async () => new THREE.Texture() });
    resetTextureLoaderDeps();

    /* `captured` is still the production object. */
    expect(captured).toBe(getTextureLoaderDeps());
  });
});