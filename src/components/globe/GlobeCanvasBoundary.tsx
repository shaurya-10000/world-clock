"use client";

import { Component, type ReactNode } from "react";
import { Globe2 } from "lucide-react";

import { logError } from "@/lib/logger";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface GlobeCanvasBoundaryProps {
  readonly children: ReactNode;
}

interface GlobeCanvasBoundaryState {
  readonly hasError: boolean;
}

/* -------------------------------------------------------------------------- */
/* Fallback                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The visual fallback when the globe canvas fails to load or
 * render.
 *
 * ## What it catches
 *
 * Three failure modes reach this component:
 *
 *   1. The dynamically-imported chunk fails to load (network
 *      error, cache corruption, CDN outage). The rejection
 *      surfaces as a thrown error during React's render phase
 *      of the lazy component.
 *   2. WebGL is unavailable or fails to initialize (old
 *      devices, hardware-accelerated graphics disabled,
 *      sandboxed iframes without `webgl` permission). R3F
 *      throws when it tries to acquire a context.
 *   3. A shader compilation error, or any other exception
 *      thrown during R3F's render phase.
 *
 * ## Why no retry button
 *
 * Retrying a failed WebGL context or a chunk load without a
 * page refresh is unlikely to succeed — the underlying cause
 * (missing GPU, blocked network request, exhausted WebGL
 * context limit) is not transient. A retry button that does
 * nothing is worse than a clear message telling the user the
 * rest of the page still works.
 *
 * ## Why it is a function component
 *
 * React error boundaries must be class components — that rule
 * applies to the boundary itself, not to the fallback. The
 * fallback renders nothing stateful and subscribes to nothing,
 * so a function component is the correct choice for it.
 */
export function GlobeCanvasFallback() {
  return (
    <div
      aria-label="Interactive globe unavailable"
      className="
        flex
        h-full
        w-full
        flex-col
        items-center
        justify-center
        gap-4
        px-6
        text-center
      "
    >
      <div
        className="
          flex
          size-14
          items-center
          justify-center
          rounded-2xl
          border
          border-white/[0.08]
          bg-white/[0.02]
        "
      >
        <Globe2
          aria-hidden="true"
          className="size-6 text-white/30"
          strokeWidth={1.4}
        />
      </div>

      <div className="max-w-xs">
        <p
          className="
            text-[11px]
            font-black
            uppercase
            tracking-[0.18em]
            text-white/45
          "
        >
          Globe unavailable
        </p>

        <p className="mt-2 text-xs leading-relaxed text-white/35">
          Your browser or network blocked the 3D view. Everything
          else on this page still works.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Boundary                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Catches any exception thrown while rendering the globe canvas
 * subtree.
 *
 * ## Why a class component
 *
 * React error boundaries must be class components — there is
 * no functional equivalent (`useErrorBoundary` is not part of
 * React; the community libraries that provide one still use a
 * class under the hood). This is the only class component in
 * the codebase, and it earns its exception to the
 * functional-only rule by being the single thing React
 * requires a class for.
 *
 * ## Scope
 *
 * The boundary is deliberately narrow: it wraps only the
 * `<GlobeCanvas>` subtree. If something outside the canvas
 * throws — a header, a controls panel, a data-fetch hook —
 * the route-level `error.tsx` still catches it. This boundary
 * exists specifically so a WebGL failure degrades one section
 * of the page instead of the whole app.
 *
 * ## Why `getDerivedStateFromError` is static and pure
 *
 * React calls `getDerivedStateFromError` during the render
 * phase, before any DOM has been committed. It must be pure
 * and must not access `this` — hence the static. Its only job
 * is to produce the new state that flips the boundary into
 * the error branch. Anything that has side effects (logging,
 * metrics) belongs in `componentDidCatch`, which React calls
 * after the error has been committed.
 *
 * ## Why `componentDidCatch` only takes `error`
 *
 * React passes a second `ErrorInfo` argument carrying the
 * component stack. That stack is useful for source-map-based
 * debugging but not useful with the current `logError`
 * signature, so the parameter is omitted rather than declared
 * and ignored. If `logError` grows a stack parameter, add the
 * second argument back.
 *
 * @example
 * ```tsx
 * <GlobeCanvasBoundary>
 *   <GlobeCanvas />
 * </GlobeCanvasBoundary>
 * ```
 */
export default class GlobeCanvasBoundary extends Component<
  GlobeCanvasBoundaryProps,
  GlobeCanvasBoundaryState
> {
  state: GlobeCanvasBoundaryState = { hasError: false };

  static getDerivedStateFromError(): GlobeCanvasBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    logError("globe canvas failed", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <GlobeCanvasFallback />;
    }

    return this.props.children;
  }
}