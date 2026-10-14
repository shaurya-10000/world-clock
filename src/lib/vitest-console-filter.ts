/*
 * Console filtering, installed before any other module
 * evaluates.
 *
 * This file is listed first in `test.setupFiles` in
 * `vitest.config.mts`, so it runs before `vitest.setup.ts`
 * and before any test file's imports resolve. That ordering
 * is the entire point: React's dev runtime, Framer Motion's
 * dev channel, and any other dependency that captures a
 * reference to `console.error` at its own module-evaluation
 * time must see our wrapper, not the raw original.
 *
 * If this file were merged into `vitest.setup.ts`, the
 * imports at the top of that file would evaluate *before*
 * any executable statement (ES module hoisting), and any
 * module they transitively pull in that captures
 * `console.error` would bypass the filter.
 *
 * The patterns are duplicated from `lib/vitest-setup-helpers`
 * rather than imported for the same reason: importing
 * `@/lib/vitest-setup-helpers` here would evaluate that
 * module (and its transitive imports) before the wrapper
 * installs. The duplication is small, and the test in
 * `vitest-console-filter.test.ts` pins the behavior of the
 * patterns directly.
 */

/* -------------------------------------------------------------------------- */
/* Message extraction                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Extract a matchable message string from console arguments.
 *
 * React's warning pipeline uses `%s`-style formatting on some
 * code paths and direct string passing on others. Examples of
 * the two shapes:
 *
 *   console.error("<%s /> is using incorrect casing. ...", "ambientLight");
 *   console.error("Warning: %s", "The tag <foo> is unrecognized ...");
 *
 * This function resolves both into a single string so the
 * patterns below can match the fully-substituted message. It
 * also strips a leading `"Warning: "` prefix, which React
 * adds on some code paths and not others.
 *
 * Non-string arguments (React's component stack, arbitrary
 * objects) are ignored — they never contribute to the
 * warning's identity and including them would produce
 * false positives on unrelated console calls.
 */
export function extractMatchableText(
  args: readonly unknown[],
): string {
  if (args.length === 0) return "";

  const first = args[0];
  if (typeof first !== "string") return "";

  let substitutionIndex = 1;

  const resolved = first.replace(/%[sdifoO%]/g, (match) => {
    if (match === "%%") return "%";

    const sub = args[substitutionIndex];
    substitutionIndex += 1;

    if (typeof sub === "string") return sub;
    if (typeof sub === "number") return String(sub);
    if (typeof sub === "boolean") return String(sub);

    /*
     * Objects and functions: React rarely interpolates these
     * into a warning's primary message. A distinct placeholder
     * avoids a crash and produces a token that no pattern
     * below will match.
     */
    return "[object]";
  });

  return resolved.startsWith("Warning: ")
    ? resolved.slice("Warning: ".length)
    : resolved;
}

/* -------------------------------------------------------------------------- */
/* Pattern sets                                                               */
/* -------------------------------------------------------------------------- */

/**
 * React's intrinsic-element warnings. Every pattern is
 * anchored with `^` on React's own message prefixes so an
 * unrelated warning that happens to contain the same words is
 * not suppressed.
 */
export const REACT_INTRINSIC_NOISE_PATTERNS: readonly RegExp[] = [
  /^<[a-zA-Z]+ \/> is using incorrect casing\./,
  /^The tag <[a-zA-Z]+> is unrecognized in this browser\./,
  /^React does not recognize the `[a-zA-Z]+` prop on a DOM element\./,
  /^Received `true` for a non-boolean attribute `[a-zA-Z]+`\./,
  /^Invalid value for prop `[a-zA-Z]+` on <[a-zA-Z]+> tag\./,
];

/**
 * Upstream deprecation warnings. These come from `three` and
 * `@react-three/fiber`, not from this codebase.
 */
export const DEPRECATION_PATTERNS: readonly RegExp[] = [
  /^THREE\.Clock: This module has been deprecated\./,
];

/**
 * Application-level expected warnings. These mirror
 * `SUPPRESS_WARN_PATTERNS` in `lib/vitest-setup-helpers.ts`.
 * Both lists are kept in sync by convention; a change to one
 * should be reflected in the other. See that file for the
 * rationale behind each pattern.
 */
export const APP_WARN_PATTERNS: readonly RegExp[] = [
  /^\[time\] (invalid-zone|resolve-failed) for time zone/,
  /^\[r3f-adapters\] useFrameAdapter received a new callback/,
];

/* -------------------------------------------------------------------------- */
/* Suppression decision                                                       */
/* -------------------------------------------------------------------------- */

/**
 * True when a message matches any of the active pattern sets.
 *
 * `includeAppPatterns` is `true` for `console.warn` and
 * `false` for `console.error`. The app-level expected
 * warnings are emitted via `console.warn` in production; a
 * warning appearing on the wrong channel would be a signal
 * worth seeing, so the `console.error` path does not suppress
 * them.
 */
export function shouldSuppress(
  message: string,
  includeAppPatterns: boolean,
): boolean {
  if (includeAppPatterns) {
    if (APP_WARN_PATTERNS.some((re) => re.test(message))) {
      return true;
    }
  }
  if (REACT_INTRINSIC_NOISE_PATTERNS.some((re) => re.test(message))) {
    return true;
  }
  if (DEPRECATION_PATTERNS.some((re) => re.test(message))) {
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Console wrapper installation                                               */
/* -------------------------------------------------------------------------- */

/*
 * `console.warn` filters all three pattern sets.
 * `console.error` filters only React intrinsics and
 * deprecations — see `shouldSuppress` for why.
 *
 * React's `act()` warning goes to `console.error` and is
 * deliberately **not** filtered: it is a real signal that a
 * test is missing an `act()` wrapper.
 */
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

console.warn = (...args: unknown[]): void => {
  if (shouldSuppress(extractMatchableText(args), true)) {
    return;
  }
  originalWarn(...args);
};

console.error = (...args: unknown[]): void => {
  if (shouldSuppress(extractMatchableText(args), false)) {
    return;
  }
  originalError(...args);
};