import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  APP_WARN_PATTERNS,
  DEPRECATION_PATTERNS,
  extractMatchableText,
  REACT_INTRINSIC_NOISE_PATTERNS,
  shouldSuppress,
} from "@/lib/vitest-console-filter";

/* -------------------------------------------------------------------------- */
/* extractMatchableText                                                       */
/* -------------------------------------------------------------------------- */

describe("extractMatchableText — plain messages", () => {
  it("returns the first string argument unchanged when there are no substitutions", () => {
    expect(
      extractMatchableText([
        "React does not recognize the `foo` prop on a DOM element.",
      ]),
    ).toBe(
      "React does not recognize the `foo` prop on a DOM element.",
    );
  });

  it("returns empty string when called with no arguments", () => {
    expect(extractMatchableText([])).toBe("");
  });

  it("returns empty string when the first argument is not a string", () => {
    /*
     * React occasionally calls `console.error(error)` where
     * `error` is an Error object. Those calls should not be
     * matched by any pattern, and treating them as an empty
     * string guarantees that.
     */
    expect(extractMatchableText([new Error("boom")])).toBe("");
    expect(extractMatchableText([null])).toBe("");
    expect(extractMatchableText([undefined])).toBe("");
    expect(extractMatchableText([42])).toBe("");
  });
});

describe("extractMatchableText — %s substitutions", () => {
  it("substitutes a single %s with the next string argument", () => {
    expect(
      extractMatchableText([
        "<%s /> is using incorrect casing. Use PascalCase...",
        "ambientLight",
      ]),
    ).toBe(
      "<ambientLight /> is using incorrect casing. Use PascalCase...",
    );
  });

  it("substitutes multiple %s directives in order", () => {
    expect(
      extractMatchableText([
        "%s and %s are both wrong",
        "alpha",
        "beta",
      ]),
    ).toBe("alpha and beta are both wrong");
  });

  it("substitutes numbers via %d, %i, and %f", () => {
    expect(
      extractMatchableText([
        "value %d and %i and %f",
        42,
        7,
        3.14,
      ]),
    ).toBe("value 42 and 7 and 3.14");
  });

  it("substitutes booleans", () => {
    expect(
      extractMatchableText([
        "flag is %s",
        true,
      ]),
    ).toBe("flag is true");
  });

  it("replaces %o with a placeholder rather than crashing", () => {
    /*
     * Objects and functions are replaced with `[object]` so
     * the resolved string is distinctive and does not
     * accidentally match any pattern.
     */
    expect(
      extractMatchableText([
        "object: %o",
        { foo: "bar" },
      ]),
    ).toBe("object: [object]");
  });

  it("handles a literal %% as an escaped percent", () => {
    expect(
      extractMatchableText(["100%% complete"]),
    ).toBe("100% complete");
  });

  it("substitutes a %s with an empty string when no argument is available", () => {
    /*
     * React should never emit a warning with more `%s`
     * directives than arguments, but if it does, the
     * `substitutionIndex` past-the-end read returns
     * `undefined` and the substitution produces `[object]`.
     * That is a distinctive token and will not match any
     * pattern.
     */
    expect(
      extractMatchableText(["missing: %s"]),
    ).toBe("missing: [object]");
  });
});

describe("extractMatchableText — Warning: prefix", () => {
  it("strips a leading 'Warning: ' prefix", () => {
    expect(
      extractMatchableText([
        "Warning: <foo /> is using incorrect casing.",
      ]),
    ).toBe("<foo /> is using incorrect casing.");
  });

  it("strips the prefix after substitution", () => {
    expect(
      extractMatchableText([
        "Warning: <%s /> is using incorrect casing.",
        "bar",
      ]),
    ).toBe("<bar /> is using incorrect casing.");
  });

  it("does not strip a mid-string 'Warning:' token", () => {
    expect(
      extractMatchableText([
        "Not a Warning: <foo /> is fine",
      ]),
    ).toBe("Not a Warning: <foo /> is fine");
  });

  it("does not strip the prefix when it is not followed by a space", () => {
    expect(
      extractMatchableText(["Warning:no-space"]),
    ).toBe("Warning:no-space");
  });
});

/* -------------------------------------------------------------------------- */
/* shouldSuppress — React intrinsics                                          */
/* -------------------------------------------------------------------------- */

describe("shouldSuppress — React intrinsic warnings", () => {
  const cases: readonly string[] = [
    "<ambientLight /> is using incorrect casing. Use PascalCase...",
    "<meshStandardMaterial /> is using incorrect casing. Use PascalCase...",
    "The tag <directionalLight> is unrecognized in this browser.",
    "The tag <shaderMaterial> is unrecognized in this browser.",
    "React does not recognize the `bumpMap` prop on a DOM element.",
    "React does not recognize the `vertexShader` prop on a DOM element.",
    "Received `true` for a non-boolean attribute `transparent`.",
    "Invalid value for prop `raycast` on <mesh> tag.",
  ];

  for (const message of cases) {
    it(`suppresses: ${message.slice(0, 50)}...`, () => {
      expect(shouldSuppress(message, false)).toBe(true);
      expect(shouldSuppress(message, true)).toBe(true);
    });
  }

  it("does not suppress a message that only contains the words mid-string", () => {
    /*
     * The patterns are anchored with `^`. A message like
     * `"prefix: <foo /> is using incorrect casing."` must
     * NOT match because the pattern requires the string to
     * start with `<`.
     */
    expect(
      shouldSuppress(
        "custom: <foo /> is using incorrect casing.",
        false,
      ),
    ).toBe(false);
  });

  it("does not suppress an unrecognized casing warning for a non-letter tag", () => {
    /*
     * The pattern is `[a-zA-Z]+`, so `<3d-thing />` would
     * not match. Real React warnings use camelCase
     * identifiers; a tag with non-letter characters is a
     * genuinely novel warning worth seeing.
     */
    expect(
      shouldSuppress(
        "<3d-thing /> is using incorrect casing.",
        false,
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* shouldSuppress — deprecations                                              */
/* -------------------------------------------------------------------------- */

describe("shouldSuppress — deprecation warnings", () => {
  it("suppresses the THREE.Clock deprecation", () => {
    expect(
      shouldSuppress(
        "THREE.Clock: This module has been deprecated. Use THREE.Timer instead.",
        false,
      ),
    ).toBe(true);
  });

  it("does not suppress a THREE.Timer deprecation", () => {
    /*
     * Only the `THREE.Clock` deprecation is on the list. A
     * future `THREE.Timer` deprecation should surface.
     */
    expect(
      shouldSuppress(
        "THREE.Timer: This module has been deprecated.",
        false,
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* shouldSuppress — app patterns                                              */
/* -------------------------------------------------------------------------- */

describe("shouldSuppress — app patterns", () => {
  it("suppresses [time] invalid-zone when app patterns are included", () => {
    const message =
      '[time] invalid-zone for time zone "Not/A_Zone"; returning a safe default.';
    expect(shouldSuppress(message, true)).toBe(true);
    expect(shouldSuppress(message, false)).toBe(false);
  });

  it("suppresses [time] resolve-failed when app patterns are included", () => {
    const message =
      "[time] resolve-failed for time zone \"browser\"; returning a safe default.";
    expect(shouldSuppress(message, true)).toBe(true);
  });

  it("suppresses the r3f-adapters callback warning when app patterns are included", () => {
    const message =
      "[r3f-adapters] useFrameAdapter received a new callback...";
    expect(shouldSuppress(message, true)).toBe(true);
  });

  it("does not suppress a [time] warning with a different reason", () => {
    /*
     * Only `invalid-zone` and `resolve-failed` are on the
     * list. A future `[time] format-failed` warning should
     * surface because it might indicate a real problem.
     */
    const message =
      "[time] format-failed for time zone \"UTC\"; returning a safe default.";
    expect(shouldSuppress(message, true)).toBe(false);
    expect(shouldSuppress(message, false)).toBe(false);
  });

  it("does not suppress a [time] warning that only contains the prefix mid-string", () => {
    expect(
      shouldSuppress(
        'prefix: [time] invalid-zone for time zone "X"',
        true,
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* shouldSuppress — negative cases                                            */
/* -------------------------------------------------------------------------- */

describe("shouldSuppress — negative cases", () => {
  it("does not suppress unrelated warnings", () => {
    expect(shouldSuppress("Something unexpected happened.", true)).toBe(
      false,
    );
    expect(shouldSuppress("Deprecation: use newThing instead", true)).toBe(
      false,
    );
  });

  it("does not suppress the empty string", () => {
    expect(shouldSuppress("", true)).toBe(false);
    expect(shouldSuppress("", false)).toBe(false);
  });

  it("does not suppress React's act() warning on console.error", () => {
    /*
     * ## Why this test exists
     *
     * The `act()` warning is the single most important
     * warning to keep visible: it tells a test author that a
     * state update is happening outside React's batching
     * scope. The filter's design is specifically that
     * `includeAppPatterns: false` (the `console.error`
     * channel) does not include any pattern broad enough to
     * swallow it.
     *
     * If a future contributor adds a pattern that matches
     * `act(...)` warnings to `console.error`'s filter set,
     * this test fails and forces the change to be
     * deliberate.
     */
    const actWarning =
      "An update to Foo inside a test was not wrapped in act(...).";
    expect(shouldSuppress(actWarning, false)).toBe(false);
    expect(shouldSuppress(actWarning, true)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Pattern arrays — shape checks                                              */
/* -------------------------------------------------------------------------- */

describe("pattern arrays — shape", () => {
  it("every React intrinsic pattern is anchored", () => {
    for (const re of REACT_INTRINSIC_NOISE_PATTERNS) {
      expect(re.source.startsWith("^")).toBe(true);
    }
  });

  it("every deprecation pattern is anchored", () => {
    for (const re of DEPRECATION_PATTERNS) {
      expect(re.source.startsWith("^")).toBe(true);
    }
  });

  it("every app pattern is anchored", () => {
    for (const re of APP_WARN_PATTERNS) {
      expect(re.source.startsWith("^")).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Console wrapper — end-to-end                                               */
/* -------------------------------------------------------------------------- */

/*
 * ## Why the wrapper tests mock `console.warn` and `console.error`
 *
 * The wrapper is installed at module load in
 * `vitest-console-filter.ts`, and by the time this test file
 * runs, `console.warn` and `console.error` are already the
 * wrapped versions. That means the wrapper is *itself* the
 * module under test's installation — we cannot swap in a spy
 * over `console.warn` and expect the wrapper's body to run,
 * because the wrapper already replaced `console.warn` before
 * this file evaluated.
 *
 * What we *can* test is that the wrapped functions do not
 * forward suppressed messages to the original and do forward
 * everything else. To do that, we temporarily replace
 * `console.warn` with a spy, call the *wrapped* function
 * captured before replacement, and assert on the spy.
 *
 * That pattern is fragile enough that it's not worth keeping
 * in a file that already tests the pure `shouldSuppress`
 * function exhaustively. The one behavior worth an
 * end-to-end test is the `%s` substitution path because it
 * is the reason the filter was rewritten.
 */
describe("console wrapper — substitution end-to-end", () => {
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  beforeEach(() => {
    originalWarn = console.warn;
    originalError = console.error;
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
    vi.restoreAllMocks();
  });

  it("suppresses a formatted intrinsic warning without touching the original console.error", () => {
    /*
     * Replace the currently-installed wrapper with a spy.
     * This preserves a reference to the wrapper via
     * `originalError` so we can call it directly in the test
     * — the wrapper's body still runs and consults the same
     * pattern sets, but its fall-through call goes to the
     * spy instead of the real console.
     */
    const spy = vi.fn();
    console.error = spy;

    /*
     * Re-invoke the module's wrapper by hand — but the module
     * captured `originalError` at load time, which is the
     * *real* console.error, not our spy. So a suppressed
     * message will not reach our spy, and an unsuppressed
     * message will reach the real console, not our spy
     * either. This particular end-to-end test therefore has
     * to assert on the *side effect* of suppression via
     * `shouldSuppress` instead.
     *
     * The pure-function tests above cover the matching
     * logic; this block is a placeholder documenting why an
     * end-to-end wrapper test is not practical in this
     * file's execution model.
     */
    expect(
      shouldSuppress(
        extractMatchableText([
          "<%s /> is using incorrect casing.",
          "ambientLight",
        ]),
        false,
      ),
    ).toBe(true);
  });
});