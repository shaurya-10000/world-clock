import { describe, expect, it, vi } from "vitest";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
  JetBrains_Mono: () => ({ variable: "--font-jetbrains-mono" }),
  Fraunces: () => ({ variable: "--font-fraunces" }),
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

/**
 * `RootLayout` returns a `<html>` element. React Testing Library
 * cannot mount that — RTL renders into a `<div>`, and the DOM
 * refuses to nest `<html>` inside a `<div>`. Instead of
 * rendering, we call the component as a plain function and
 * inspect the returned element tree.
 */
function invoke(
  children: ReactNode = null,
): ReactElement<HtmlElementProps> {
  return RootLayout({ children }) as ReactElement<HtmlElementProps>;
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("RootLayout — structure", () => {
  it("returns a valid React element", () => {
    const tree = invoke();
    expect(isValidElement(tree)).toBe(true);
  });

  it("the root element is html", () => {
    expect(invoke().type).toBe("html");
  });

  it("the html element's child is body", () => {
    const body = invoke().props.children;
    expect(body.type).toBe("body");
  });

  it("the body element contains the children passed in", () => {
    const marker = <span data-testid="page">page</span>;
    const body = invoke(marker).props.children;

    expect(body.props.children).toBe(marker);
  });
});

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

describe("RootLayout — content", () => {
  it("accepts an array of children and passes them through unchanged", () => {
    const children = [
      <span key="a" data-testid="a">
        a
      </span>,
      <span key="b" data-testid="b">
        b
      </span>,
    ];
    const body = invoke(children).props.children;

    expect(body.props.children).toBe(children);
  });

  it("accepts null children without throwing", () => {
    expect(() => invoke(null)).not.toThrow();
  });

  it("accepts undefined children without throwing", () => {
    expect(() => invoke(undefined)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Attribute correctness                                                      */
/* -------------------------------------------------------------------------- */

describe("RootLayout — attribute correctness", () => {
  it("lang is the exact string 'en', not just truthy", () => {
    expect(invoke().props.lang).toBe("en");
  });

  it("suppressHydrationWarning is the boolean true, not truthy", () => {
    expect(invoke().props.suppressHydrationWarning).toBe(true);
  });

  it("className is a string, not an array", () => {
    /*
     * Some implementations `.join(" ")` to produce the class
     * string; React would accept an array but produce a
     * runtime warning. This catches a refactor that forgets
     * the join.
     */
    expect(typeof invoke().props.className).toBe("string");
  });

  it("className contains all three font variables", () => {
    const className = invoke().props.className;

    expect(className).toContain("--font-inter");
    expect(className).toContain("--font-jetbrains-mono");
    expect(className).toContain("--font-fraunces");
  });

  it("className has no stray whitespace", () => {
    const className = invoke().props.className;

    expect(className).not.toMatch(/\s{2,}/);
    expect(className.trim()).toBe(className);
  });
});