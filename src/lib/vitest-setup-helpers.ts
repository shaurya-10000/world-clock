/**
 * Pure helpers extracted from `vitest.setup.ts`.
 *
 * `vitest.setup.ts` runs side effects at module load — it
 * installs `process.on("unhandledRejection")`, replaces
 * `console.warn`, and mutates `HTMLCanvasElement.prototype`.
 * Importing that file from a test would re-run every side
 * effect in the test process, which is both wasteful and
 * potentially disruptive (a second `console.warn` wrapper
 * would stack, a second canvas stub would overwrite the
 * first).
 *
 * The three helpers in this module are the pure logic those
 * side effects rely on. Extracting them here means:
 *
 *   1. `vitest.setup.ts` imports them and installs them once.
 *   2. The test imports them and asserts on their behavior
 *      without re-running any install.
 *
 * The module has no side effects and no dependencies beyond
 * the standard library, so it can be imported from anywhere.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A single entry in the canvas call log.
 *
 * The shape is the minimum the signature function needs: a
 * method name and the arguments it was called with. The
 * canvas stub records one of these per drawing call.
 */
export interface CanvasCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/* -------------------------------------------------------------------------- */
/* Framer Motion abort filter                                                 */
/* -------------------------------------------------------------------------- */

/**
 * True when an unhandled rejection is a Framer Motion abort.
 *
 * Framer Motion (via `motion-dom`) drives animations on a
 * global frame loop. When React Testing Library unmounts a
 * component mid-animation — which happens on every test that
 * renders a `motion.*` element and then completes — the
 * in-flight animation is canceled. The cancellation rejects
 * an internal promise that nothing catches, and Vitest
 * reports every one of them as an unhandled rejection.
 *
 * The rejection is always benign: the animation was
 * intentionally aborted, the component is gone, and there is
 * nothing to do. Suppressing this specific error keeps the
 * test output readable without hiding real problems.
 *
 * ## Four-clause filter
 *
 * The filter matches on four signals, not just `name` alone:
 *
 *   1. `name === "AbortError"` — the general DOM convention
 *      for aborted async work.
 *   2. `message` contains `"animation was canceled"` — the
 *      specific wording `motion-dom` uses.
 *   3. `stack` contains `motion-dom` or `framer-motion` — the
 *      signal that scopes this to the motion package.
 *      Without this, a future `fetch` that happens to throw
 *      `new DOMException("...animation was canceled...", "AbortError")`
 *      would be swallowed.
 *   4. The value is a real `Error` (or `DOMException`, which
 *      extends `Error` in modern runtimes).
 *
 * Every one of these must hold. Matching the name alone would
 * also swallow `fetch`, `AbortController`, and file-operation
 * aborts, which would be a real bug we want to see.
 *
 * Pure function; no I/O, no mutation, no side effects.
 */
export function isFramerMotionAbort(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  if (reason.name !== "AbortError") return false;
  if (typeof reason.message !== "string") return false;
  if (!reason.message.includes("animation was canceled")) {
    return false;
  }

  /*
   * `stack` is the discriminator that scopes this to the
   * motion package. `DOMException` in happy-dom and jsdom
   * does not always populate `stack`, so treat a missing
   * stack as a non-match rather than a fall-through.
   */
  const stack = reason.stack;
  if (typeof stack !== "string") return false;

  return (
    stack.includes("motion-dom") ||
    stack.includes("framer-motion")
  );
}

/* -------------------------------------------------------------------------- */
/* Console warning filter                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The console warnings that are expected and suppressed.
 *
 * Two categories:
 *
 *   1. `[time] invalid-zone` and `[time] resolve-failed` —
 *      emitted deliberately by `lib/time.ts` when tests
 *      exercise invalid-timezone paths. The module's
 *      `reportFailure` is itself under test; the console
 *      warning is a side effect, not a failure.
 *
 *   2. `[r3f-adapters] useFrameAdapter received a new callback`
 *      — emitted deliberately by `lib/r3f-adapters.tsx` when
 *      the dev-mode stability check fires. The check is under
 *      test; the warning is the observable behavior.
 *
 * Every pattern is anchored with `^` so a warning that only
 * *contains* the phrase mid-string is not suppressed by
 * accident. Any warning that does not match passes through,
 * so a genuine unexpected warning is still visible.
 */
export const SUPPRESS_WARN_PATTERNS: readonly RegExp[] = [
  /^\[time\] (invalid-zone|resolve-failed) for time zone/,
  /^\[r3f-adapters\] useFrameAdapter received a new callback/,
];

/* -------------------------------------------------------------------------- */
/* Canvas signature                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The deterministic signature of a canvas call sequence.
 *
 * Two sequences with the same method names, arguments, and
 * order produce the same string; any difference produces a
 * different string. This is the entire contract that the
 * canvas stub's `toDataURL` relies on.
 *
 * Not cryptographic — just distinctive enough for the stub's
 * purpose.
 */
export function canvasSignature(
  calls: readonly CanvasCall[],
): string {
  return calls
    .map((c) => `${c.method}:${JSON.stringify(c.args)}`)
    .join("|");
}