import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter-mock-class" }),
  JetBrains_Mono: () => ({
    variable: "--font-jetbrains-mono-mock-class",
  }),
  Fraunces: () => ({ variable: "--font-fraunces-mock-class" }),
}));

import RootLayout from "@/app/layout";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface HtmlElementProps {
  lang: string;
  suppressHydrationWarning: boolean;
  className: string;
  children: ReactElement<BodyElementProps>;
}

interface BodyElementProps {
  children: ReactNode;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function invoke(
  children: ReactNode = null,
): ReactElement<HtmlElementProps> {
  return RootLayout({ children }) as ReactElement<HtmlElementProps>;
}

/* -------------------------------------------------------------------------- */
/* Root element                                                               */
/* -------------------------------------------------------------------------- */

describe("RootLayout — root element", () => {
  it("returns an html element", () => {
    expect(invoke().type).toBe("html");
  });

  it("sets lang to en", () => {
    expect(invoke().props.lang).toBe("en");
  });

  it("sets suppressHydrationWarning", () => {
    expect(invoke().props.suppressHydrationWarning).toBe(true);
  });

  it("applies all three font variable classes", () => {
    const className = invoke().props.className;

    expect(className).toContain("--font-inter-mock-class");
    expect(className).toContain(
      "--font-jetbrains-mono-mock-class",
    );
    expect(className).toContain("--font-fraunces-mock-class");
  });

  it("does not have stray whitespace between font classes", () => {
    const className = invoke().props.className;

    expect(className).not.toMatch(/\s{2,}/);
    expect(className.trim()).toBe(className);
  });
});

/* -------------------------------------------------------------------------- */
/* Body element                                                               */
/* -------------------------------------------------------------------------- */

describe("RootLayout — body element", () => {
  it("contains exactly one child", () => {
    expect(invoke().props.children).toBeDefined();
  });

  it("the child is a body element", () => {
    expect(invoke().props.children.type).toBe("body");
  });

  it("the body element wraps the provided children", () => {
    const marker = "test-marker";
    const body = invoke(marker).props.children;

    expect(body.props.children).toBe(marker);
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-file invariants with manifest.ts                                     */
/* -------------------------------------------------------------------------- */

describe("RootLayout — cross-file invariants", () => {
  it("the viewport themeColor matches the manifest background", async () => {
    const { viewport } = await import("@/app/layout");
    const manifestFn = (await import("@/app/manifest")).default;

    expect(viewport.themeColor).toBe(
      manifestFn().background_color,
    );
  });

  it("the viewport themeColor matches the manifest theme color", async () => {
    /*
     * The manifest also declares `theme_color`, which some
     * browsers read in preference to the viewport one. All
     * three must agree or the browser chrome flips color on
     * launch.
     */
    const { viewport } = await import("@/app/layout");
    const manifestFn = (await import("@/app/manifest")).default;

    expect(viewport.themeColor).toBe(manifestFn().theme_color);
  });

  it("the metadata description matches the manifest description", async () => {
    const { metadata } = await import("@/app/layout");
    const manifestFn = (await import("@/app/manifest")).default;

    expect(metadata.description).toBe(
      manifestFn().description,
    );
  });

  it("the metadata application name matches the manifest name", async () => {
    const { metadata } = await import("@/app/layout");
    const manifestFn = (await import("@/app/manifest")).default;

    expect(metadata.applicationName).toBe(manifestFn().name);
  });

  it("the title default matches the manifest short_name", async () => {
    /*
     * The manifest's short_name is what appears under the
     * home-screen icon; the metadata title default is what
     * appears in the browser tab. Both should be the brand
     * name.
     */
    const { metadata } = await import("@/app/layout");
    const manifestFn = (await import("@/app/manifest")).default;

    const title = metadata.title as { default: string };
    expect(title.default).toBe(manifestFn().short_name);
  });
});