import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import {
  canvasSignature,
  isFramerMotionAbort,
  type CanvasCall,
} from "@/lib/vitest-setup-helpers";

/*
 * Console output filtering lives in
 * `src/lib/vitest-console-filter.ts`, which is listed first
 * in `test.setupFiles`. That file must run before this one
 * so the wrapper is installed before any dependency (React,
 * Framer Motion, etc.) captures a reference to
 * `console.error`. Do not move the filter logic here — the
 * imports at the top of this file are hoisted and evaluated
 * before any executable statement, which means they would
 * defeat the ordering.
 *
 * ## What the filter suppresses
 *
 * 1. **Application warnings** — the `[time] invalid-zone`
 *    and `[r3f-adapters] useFrameAdapter` patterns that
 *    `lib/time.ts` and `lib/r3f-adapters.tsx` emit
 *    deliberately on tests that exercise their failure
 *    paths.
 *
 * 2. **React intrinsic warnings** — `<mesh>`,
 *    `<directionalLight>`, `<shaderMaterial>`, `<points>`,
 *    etc., rendered outside a `<Canvas>`. React's DOM
 *    renderer does not know what these are; the warnings
 *    carry no signal for this codebase.
 *
 * 3. **Upstream deprecation warnings** — `THREE.Clock` from
 *    `@react-three/fiber` and `require("three")` from
 *    three.js submodules. Both originate in dependencies
 *    and cannot be fixed from this codebase.
 *
 * React's `act()` warning is deliberately **not** filtered:
 * it is a real signal that a test is missing an `act()`
 * wrapper.
 */

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */

afterEach(() => {
  cleanup();
});

/* -------------------------------------------------------------------------- */
/* Framer Motion abort-error suppression                                      */
/* -------------------------------------------------------------------------- */

if (typeof process !== "undefined") {
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (reason: unknown) => {
    if (isFramerMotionAbort(reason)) return;
    queueMicrotask(() => {
      throw reason;
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Node process-level deprecation suppression                                 */
/* -------------------------------------------------------------------------- */

if (typeof process !== "undefined" && process.emitWarning) {
  const originalEmitWarning = process.emitWarning.bind(process);

  process.emitWarning = ((
    warning: string | Error,
    ...rest: unknown[]
  ): void => {
    const message =
      typeof warning === "string"
        ? warning
        : warning instanceof Error
          ? warning.message
          : "";

    if (
      message.includes("`require(\"three\")` is deprecated") ||
      message.includes("Replace `const THREE = require(\"three\")`")
    ) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (originalEmitWarning as any)(warning, ...rest);
  }) as typeof process.emitWarning;
}

/* -------------------------------------------------------------------------- */
/* Browser API stubs                                                          */
/* -------------------------------------------------------------------------- */

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (!window.ResizeObserver) {
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
}

if (!window.IntersectionObserver) {
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return [];
      }
      root: Element | null = null;
      rootMargin = "";
      thresholds: readonly number[] = [];
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Canvas 2D context stub                                                     */
/* -------------------------------------------------------------------------- */

const canvasCallLog = new WeakMap<
  HTMLCanvasElement,
  CanvasCall[]
>();

function installCanvasStub(): void {
  if (typeof HTMLCanvasElement === "undefined") return;

  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: unknown;
    toDataURL: unknown;
  };

  try {
    const probe = document.createElement("canvas");
    if (
      (probe.getContext as (id: string) => unknown)("2d") !== null
    ) {
      return;
    }
  } catch {
    /* fall through — install the stub */
  }

  proto.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
  ): RenderingContext | null {
    if (contextId !== "2d") return null;

    const log: CanvasCall[] = [];
    canvasCallLog.set(this, log);

    const record =
      (method: string) =>
      (...args: unknown[]): void => {
        log.push({ method, args });
      };

    const ctx = {
      canvas: this,

      fillStyle: "",
      strokeStyle: "",
      shadowColor: "",
      shadowBlur: 0,
      globalCompositeOperation: "source-over",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",

      save: record("save"),
      restore: record("restore"),
      beginPath: record("beginPath"),
      closePath: record("closePath"),
      arc: record("arc"),
      arcTo: record("arcTo"),
      moveTo: record("moveTo"),
      lineTo: record("lineTo"),
      bezierCurveTo: record("bezierCurveTo"),
      quadraticCurveTo: record("quadraticCurveTo"),
      rect: record("rect"),
      fill: record("fill"),
      stroke: record("stroke"),
      clip: record("clip"),
      translate: record("translate"),
      rotate: record("rotate"),
      scale: record("scale"),
      clearRect: record("clearRect"),
      fillRect: record("fillRect"),
      strokeRect: record("strokeRect"),
      drawImage: record("drawImage"),
      createLinearGradient: () => ({
        addColorStop: (): void => {},
      }),
      createRadialGradient: () => ({
        addColorStop: (): void => {},
      }),
      measureText: () => ({ width: 0 }),
      fillText: record("fillText"),
      strokeText: record("strokeText"),
    };

    return ctx as unknown as CanvasRenderingContext2D;
  };

  proto.toDataURL = function (
    this: HTMLCanvasElement,
    type?: string,
  ): string {
    const mime = type ?? "image/png";
    const calls = canvasCallLog.get(this) ?? [];
    const signature = canvasSignature(calls);

    const encoded =
      typeof btoa === "function"
        ? btoa(signature).slice(0, 64)
        : signature.length.toString(36);

    return `data:${mime};base64,${encoded}`;
  };
}

installCanvasStub();