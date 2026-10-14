import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/* -------------------------------------------------------------------------- */
/* File contents                                                              */
/* -------------------------------------------------------------------------- */

const css = readFileSync(
  resolve(__dirname, "globals.css"),
  "utf8",
);

/* -------------------------------------------------------------------------- */
/* Design tokens                                                              */
/* -------------------------------------------------------------------------- */

describe("globals.css — design tokens", () => {
  /**
   * Every token the codebase references via `var(--name)` or
   * a Tailwind `(--name)` utility must be declared in `:root`.
   * A missing token is a silent failure: the fallback used by
   * the browser is whatever the property's initial value is,
   * which is almost never what was intended.
   */
  const REQUIRED_TOKENS = [
    "--background",
    "--foreground",
    "--surface",
    "--surface-strong",
    "--muted",
    "--subtle",
    "--border",
    "--accent",
    "--accent-glow",
    "--favorite",
    "--favorite-glow",
    "--live",
    "--sun-glow-core",
    "--sun-glow-mid",
    "--sun-glow-edge",
    "--radius-sm",
    "--radius-md",
    "--radius-lg",
    "--radius-xl",
    "--radius-2xl",
    "--radius-3xl",
    "--radius-4xl",
    "--font-sans",
    "--font-mono",
    "--font-display",
  ];

  it.each(REQUIRED_TOKENS)(
    "declares the %s token in :root",
    (token) => {
      expect(css).toContain(`${token}:`);
    },
  );

  it("declares the background as the brand dark hex", () => {
    expect(css).toMatch(/--background:\s*#05070a/);
  });

  it("declares the foreground as the brand light hex", () => {
    expect(css).toMatch(/--foreground:\s*#f5f7f8/);
  });

  it("declares the accent as the brand gold hex", () => {
    expect(css).toMatch(/--accent:\s*#c5a059/);
  });
});

/* -------------------------------------------------------------------------- */
/* Tailwind import                                                            */
/* -------------------------------------------------------------------------- */

describe("globals.css — tailwind import", () => {
  it("imports the tailwindcss package at the top of the file", () => {
    /*
     * Tailwind v4 uses a single `@import "tailwindcss";` line
     * and no config file. If this line is missing or moved
     * below other rules, the entire design system stops
     * working — every utility silently becomes a no-op.
     */
    const firstNonComment = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    expect(firstNonComment.startsWith('@import "tailwindcss"')).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Font overrides                                                             */
/* -------------------------------------------------------------------------- */

describe("globals.css — font overrides", () => {
  it("overrides the font-serif utility to use the display token", () => {
    expect(css).toMatch(
      /\.font-serif\s*\{[^}]*font-family:\s*var\(--font-display\)/,
    );
  });

  it("overrides the font-mono utility to use the mono token", () => {
    expect(css).toMatch(
      /\.font-mono\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Base                                                                       */
/* -------------------------------------------------------------------------- */

describe("globals.css — base", () => {
  it("sets color-scheme: dark on html", () => {
    expect(css).toMatch(/color-scheme:\s*dark/);
  });

  it("applies the background token to html", () => {
    expect(css).toMatch(/html\s*\{[^}]*background:\s*var\(--background\)/);
  });

  it("applies the background token to body", () => {
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--background\)/);
  });

  it("applies the foreground token to body", () => {
    expect(css).toMatch(/body\s*\{[^}]*color:\s*var\(--foreground\)/);
  });

  it("sets the sans font on body", () => {
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility blocks                                                       */
/* -------------------------------------------------------------------------- */

describe("globals.css — accessibility blocks", () => {
  it("declares a prefers-reduced-motion block", () => {
    /*
     * If this block is ever removed, users who requested
     * reduced motion will see every animation play at full
     * duration. This test is the canary.
     */
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    );
  });

  it("collapses animation and transition durations in the reduced-motion block", () => {
    const block = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/,
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it("declares a forced-colors block", () => {
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)/);
  });

  it("declares a focus-visible outline for buttons and links", () => {
    expect(css).toMatch(/button:focus-visible/);
    expect(css).toMatch(/a:focus-visible/);
  });

  it("suppresses the outline when a focus-visible ring is present", () => {
    /*
     * The utility class `focus-visible:ring-*` is the explicit
     * focus indicator for those elements. Doubling it with the
     * fallback outline is visual noise.
     */
    expect(css).toMatch(
      /\[class\*="focus-visible:ring"\]:focus-visible/,
    );
  });

  it("uses the parenthesis token form in forced-colors selectors", () => {
    /*
     * Regression guard: an earlier version of this file used
     * the bracket form `[var(--token)]`, which never matched a
     * rendered Tailwind v4 class string. If someone reverts
     * to that form, the forced-colors overrides silently stop
     * applying.
     */
    expect(css).not.toMatch(/\[class\*="border-\[var\(--border\)\]"\]/);
    expect(css).not.toMatch(/\[class\*="text-\[var\(--muted\)\]"\]/);
    expect(css).not.toMatch(/\[class\*="text-\[var\(--subtle\)\]"\]/);
  });
});

/* -------------------------------------------------------------------------- */
/* Scrollbar                                                                  */
/* -------------------------------------------------------------------------- */

describe("globals.css — scrollbar", () => {
  it("declares a WebKit scrollbar thumb rule", () => {
    expect(css).toMatch(/html::-webkit-scrollbar-thumb/);
  });

  it("declares a Firefox scrollbar styling on html", () => {
    expect(css).toMatch(/scrollbar-width:\s*thin/);
    expect(css).toMatch(/scrollbar-color:/);
  });
});

/* -------------------------------------------------------------------------- */
/* Tap highlight                                                              */
/* -------------------------------------------------------------------------- */

describe("globals.css — tap highlight", () => {
  it("disables the WebKit tap highlight on buttons and links", () => {
    /*
     * The default blue flash on mobile Safari and Chrome
     * fights the dark palette. This rule keeps the interaction
     * feedback entirely in the app's own styles.
     */
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
  });
});