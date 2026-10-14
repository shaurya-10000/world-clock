import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Loading from "@/app/loading";

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

describe("Loading — rendering", () => {
  it("renders without throwing", () => {
    expect(() => render(<Loading />)).not.toThrow();
  });

  it("renders the brand label", () => {
    render(<Loading />);
    expect(screen.getByText("World Clock")).toBeInTheDocument();
  });

  it("the brand label is exactly 'World Clock'", () => {
    /*
     * The brand is capitalised. If a future change lowercases
     * it for aesthetic reasons, this test fails — that is the
     * point. The brand string is a cross-file contract.
     */
    render(<Loading />);
    expect(screen.getByText("World Clock").textContent).toBe(
      "World Clock",
    );
  });

  it("does not render a heading", () => {
    /*
     * A heading would be announced as page content and could
     * confuse screen readers about whether the page has
     * loaded. The loading fallback is a status, not content.
     */
    render(<Loading />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("does not render any buttons or links", () => {
    /*
     * The fallback must not offer interaction — the page is
     * not ready yet, and a "Try again" button here would be a
     * duplicate of the error boundary's affordance.
     */
    render(<Loading />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("contains no nested headings", () => {
    const { container } = render(<Loading />);

    for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      expect(container.querySelectorAll(tag)).toHaveLength(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("Loading — accessibility", () => {
  it("exposes the wrapper as a status region", () => {
    /*
     * `role="status"` is what makes the `aria-label` actually
     * announce. A bare `<div>` has implicit role `generic`,
     * which does not support naming, and the label would be
     * silently ignored by screen readers.
     */
    render(<Loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("marks the status region busy", () => {
    render(<Loading />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-busy")).toBe("true");
  });

  it("gives the busy region an accessible name", () => {
    render(<Loading />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-label")).toBe(
      "Loading World Clock",
    );
  });

  it("exposes the accessible name through getByLabelText", () => {
    /*
     * Proves the label is wired to an element that can
     * actually be named — getByLabelText ignores aria-label
     * on non-nameable roles.
     */
    render(<Loading />);
    expect(
      screen.getByLabelText("Loading World Clock"),
    ).toBeInTheDocument();
  });

  it("hides the decorative dot from assistive tech", () => {
    const { container } = render(<Loading />);
    const decorative = container.querySelector(
      'span[aria-hidden="true"]',
    );
    expect(decorative).not.toBeNull();
  });

  it("hides exactly one decorative element", () => {
    /*
     * The label must remain the only thing announced. If a
     * second decorative element is ever added without
     * aria-hidden, this test catches it before a screen
     * reader does.
     */
    const { container } = render(<Loading />);
    expect(
      container.querySelectorAll('[aria-hidden="true"]'),
    ).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Focus                                                                      */
/* -------------------------------------------------------------------------- */

describe("Loading — focus", () => {
  it("is not focusable", () => {
    /*
     * A loading fallback must never be reachable by Tab. It
     * has no interaction and would only get in the way of
     * keyboard navigation.
     */
    render(<Loading />);
    const region = screen.getByRole("status");
    expect(region).not.toHaveAttribute("tabindex");
  });

  it("contains no focusable descendants", () => {
    const { container } = render(<Loading />);
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]',
    );
    expect(focusable).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("Loading — structure", () => {
  it("has a single top-level element", () => {
    const { container } = render(<Loading />);
    expect(container.children).toHaveLength(1);
  });

  it("centers content in a full-height region", () => {
    const { container } = render(<Loading />);
    const root = container.firstElementChild;

    expect(root?.className).toContain("min-h-screen");
    expect(root?.className).toContain("items-center");
    expect(root?.className).toContain("justify-center");
  });

  it("uses the brand background token", () => {
    const { container } = render(<Loading />);
    const root = container.firstElementChild;

    expect(root?.className).toContain("bg-(--background)");
  });
});