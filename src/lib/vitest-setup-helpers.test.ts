import { describe, expect, it } from "vitest";

import {
  canvasSignature,
  isFramerMotionAbort,
  SUPPRESS_WARN_PATTERNS,
  type CanvasCall,
} from "./vitest-setup-helpers";

/*
 * ## Why this file exists
 *
 * `vitest.setup.ts` runs once per suite and controls two
 * things that, if broken, are invisible in the test output:
 *
 *   1. Which unhandled rejections are suppressed. A filter
 *      that is too narrow produces noise; one that is too
 *      broad hides real bugs.
 *
 *   2. Which console warnings are filtered. Same trade-off.
 *
 * The three exported helpers below are the entire pure logic
 * of that file. Testing them here means a future edit to the
 * setup cannot silently degrade the rest of the suite.
 *
 * ## What is not tested
 *
 * The side-effecting installs — `process.on`, the console.warn
 * wrapper, and the browser-API stubs — are not tested here.
 * They are one-time installs whose correctness is observable
 * only indirectly (a failing test somewhere else in the suite
 * would reveal a broken install). Adding a test that spies on
 * `process.on` would test the mechanism rather than the
 * contract.
 */

/* -------------------------------------------------------------------------- */
/* isFramerMotionAbort — positive cases                                       */
/* -------------------------------------------------------------------------- */

describe("isFramerMotionAbort — positive cases", () => {
  it("matches a real AbortError from motion-dom", () => {
    const err = new Error("animation was canceled");
    err.name = "AbortError";
    err.stack =
      "AbortError: animation was canceled\n" +
      "    at motion-dom/dist/index.js:123:45";

    expect(isFramerMotionAbort(err)).toBe(true);
  });

  it("matches a real AbortError from framer-motion", () => {
    const err = new Error("animation was canceled");
    err.name = "AbortError";
    err.stack =
      "AbortError: animation was canceled\n" +
      "    at framer-motion/dist/index.js:456:78";

    expect(isFramerMotionAbort(err)).toBe(true);
  });

  it("matches when the motion package appears anywhere in the stack", () => {
    /*
     * The stack check is a `includes`, not a `startsWith`.
     * A real browser stack has multiple frames; the motion
     * frame is often not the first.
     */
    const err = new Error("animation was canceled");
    err.name = "AbortError";
    err.stack =
      "AbortError: animation was canceled\n" +
      "    at some-other-fn (chunk.js:1:1)\n" +
      "    at motion-dom/dist/index.js:200:10\n" +
      "    at another-fn (chunk.js:2:2)";

    expect(isFramerMotionAbort(err)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* isFramerMotionAbort — negative cases                                       */
/* -------------------------------------------------------------------------- */

describe("isFramerMotionAbort — negative cases", () => {
  it("rejects an abort error with no motion signature in the stack", () => {
    /*
     * The most important negative case. A `fetch` abort is
     * also an `AbortError` with a message that happens to
     * contain "aborted" — but it is not from motion-dom, so
     * it must pass through. If the stack check is ever
     * removed, this is the test that fails.
     */
    const err = new Error("the operation was aborted");
    err.name = "AbortError";
    err.stack =
      "AbortError: the operation was aborted\n" +
      "    at fetch (native)";

    expect(isFramerMotionAbort(err)).toBe(false);
  });

  it("rejects a DOMException-shaped abort from fetch", () => {
    const err = new Error("animation was canceled");
    err.name = "AbortError";
    err.stack =
      "AbortError: animation was canceled\n" +
      "    at AbortController.abort (native)";

    expect(isFramerMotionAbort(err)).toBe(false);
  });

  it("rejects an error whose name is not AbortError", () => {
    const err = new Error("animation was canceled");
    err.name = "TypeError";
    err.stack = "at motion-dom/dist/index.js:1:1";

    expect(isFramerMotionAbort(err)).toBe(false);
  });

  it("rejects an error whose message does not contain the motion phrase", () => {
    const err = new Error("something else went wrong");
    err.name = "AbortError";
    err.stack = "at motion-dom/dist/index.js:1:1";

    expect(isFramerMotionAbort(err)).toBe(false);
  });

  it("rejects an AbortError with a missing stack", () => {
    const err = new Error("animation was canceled");
    err.name = "AbortError";
    /* Some runtimes do not populate `stack`. */
    Object.defineProperty(err, "stack", { value: undefined });

    expect(isFramerMotionAbort(err)).toBe(false);
  });

  it("rejects a non-Error value", () => {
    expect(isFramerMotionAbort("animation was canceled")).toBe(false);
    expect(isFramerMotionAbort(null)).toBe(false);
    expect(isFramerMotionAbort(undefined)).toBe(false);
    expect(isFramerMotionAbort({ name: "AbortError" })).toBe(false);
  });

  it("rejects an object with the right shape but the wrong prototype", () => {
    /*
     * `instanceof Error` is the first check. A plain object
     * that quacks like an Error does not match, which is
     * deliberate — the filter should be conservative.
     */
    const fake = {
      name: "AbortError",
      message: "animation was canceled",
      stack: "at motion-dom/dist/index.js:1:1",
    };

    expect(isFramerMotionAbort(fake)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* SUPPRESS_WARN_PATTERNS                                                     */
/* -------------------------------------------------------------------------- */

describe("SUPPRESS_WARN_PATTERNS", () => {
  it("matches the time module's invalid-zone warning", () => {
    const warning =
      "[time] invalid-zone for time zone \"Not/AZone\": using UTC";
    expect(
      SUPPRESS_WARN_PATTERNS.some((re) => re.test(warning)),
    ).toBe(true);
  });

  it("matches the time module's resolve-failed warning", () => {
    const warning =
      "[time] resolve-failed for time zone \"Bad/Zone\": falling back";
    expect(
      SUPPRESS_WARN_PATTERNS.some((re) => re.test(warning)),
    ).toBe(true);
  });

  it("matches the r3f-adapters stability warning", () => {
    const warning =
      "[r3f-adapters] useFrameAdapter received a new callback";
    expect(
      SUPPRESS_WARN_PATTERNS.some((re) => re.test(warning)),
    ).toBe(true);
  });

  it("does not match an unrelated warning", () => {
    const warning = "[some-other-module] something happened";
    expect(
      SUPPRESS_WARN_PATTERNS.some((re) => re.test(warning)),
    ).toBe(false);
  });

  it("does not match a warning with the wrong prefix", () => {
    /*
     * The patterns are anchored with `^`. A message that
     * merely contains the phrase mid-string must not match.
     */
    const warning =
      "Wrapped: [time] invalid-zone for time zone \"X\"";
    expect(
      SUPPRESS_WARN_PATTERNS.some((re) => re.test(warning)),
    ).toBe(false);
  });

  it("does not match a warning with the wrong severity tag", () => {
    const warning =
      "[time] some-other-error for time zone \"X\"";
    expect(
      SUPPRESS_WARN_PATTERNS.some((re) => re.test(warning)),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* canvasSignature                                                            */
/* -------------------------------------------------------------------------- */

describe("canvasSignature", () => {
  it("returns an empty string for an empty call list", () => {
    expect(canvasSignature([])).toBe("");
  });

  it("produces distinct signatures for distinct call sequences", () => {
    const a = canvasSignature([
      { method: "fill", args: [] },
      { method: "stroke", args: [] },
    ]);
    const b = canvasSignature([
      { method: "stroke", args: [] },
      { method: "fill", args: [] },
    ]);
    expect(a).not.toBe(b);
  });

  it("produces the same signature for identical call sequences", () => {
    const call: CanvasCall = {
      method: "arc",
      args: [0, 0, 5, 0, Math.PI * 2],
    };
    expect(canvasSignature([call])).toBe(canvasSignature([call]));
  });

  it("distinguishes calls that differ only in arguments", () => {
    const a = canvasSignature([
      { method: "arc", args: [0, 0, 5, 0, 6.28] },
    ]);
    const b = canvasSignature([
      { method: "arc", args: [0, 0, 6, 0, 6.28] },
    ]);
    expect(a).not.toBe(b);
  });

  it("encodes the call order into the signature", () => {
    /*
     * Position matters: swapping two calls must produce
     * different signatures, or the URL-determinism contract
     * the canvas stub promises is broken.
     */
    const forward = canvasSignature([
      { method: "beginPath", args: [] },
      { method: "arc", args: [0, 0, 5, 0, 6.28] },
    ]);
    const reversed = canvasSignature([
      { method: "arc", args: [0, 0, 5, 0, 6.28] },
      { method: "beginPath", args: [] },
    ]);
    expect(forward).not.toBe(reversed);
  });

  it("distinguishes calls with the same method but different arg counts", () => {
    const a = canvasSignature([
      { method: "lineTo", args: [1, 2] },
    ]);
    const b = canvasSignature([
      { method: "lineTo", args: [1, 2, 3] },
    ]);
    expect(a).not.toBe(b);
  });
});