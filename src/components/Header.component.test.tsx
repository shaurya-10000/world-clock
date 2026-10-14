import { render, screen, within } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import Header from "@/components/Header";
import { resetEventBus } from "@/lib/events";

/* -------------------------------------------------------------------------- */
/* matchMedia helper                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Install a fake `matchMedia` that reports the desktop
 * breakpoint per `desktop`. Every other media query reports
 * `false`.
 */
function installMatchMedia(desktop: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) =>
      ({
        matches: query.includes("min-width: 768px")
          ? desktop
          : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  });
}

/* -------------------------------------------------------------------------- */
/* Scoped queries                                                             */
/* -------------------------------------------------------------------------- */

/*
 * Both the desktop nav and the mobile actions render a
 * "Cities" button. Only one is *visible* at any breakpoint,
 * but both are always in the DOM (Tailwind hides via CSS, and
 * RTL does not evaluate CSS). Queries therefore need to be
 * scoped to a container.
 */
function getDesktopCitiesButton(): HTMLElement {
  const nav = screen.getByRole("navigation", {
    name: "Primary navigation",
  });
  return within(nav).getByRole("button", { name: "Cities" });
}

function getMobileCitiesButton(): HTMLElement {
  const mobile = document.querySelector<HTMLElement>(".md\\:hidden");
  if (!mobile) throw new Error("Mobile actions container not found");
  return within(mobile).getByRole("button", { name: "Cities" });
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetEventBus();
  installMatchMedia(false);
  window.location.hash = "";
});

afterEach(() => {
  resetEventBus();
  vi.restoreAllMocks();
});

function renderHeader() {
  return render(
    <Header mobileView="globe" onMobileViewChange={vi.fn()} />,
  );
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("Header — structure", () => {
  it("renders a banner landmark", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders exactly one banner", () => {
    renderHeader();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("renders the brand as a link with an accessible name", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "World Clock home" }),
    ).toBeInTheDocument();
  });

  it("renders the primary navigation landmark", () => {
    renderHeader();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
  });

  it("header is sticky", () => {
    renderHeader();
    expect(screen.getByRole("banner").className).toContain("sticky");
  });

  it("header has a backdrop-blur class", () => {
    renderHeader();
    expect(screen.getByRole("banner").className).toContain(
      "backdrop-blur",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Navigation items                                                           */
/* -------------------------------------------------------------------------- */

describe("Header — navigation items", () => {
  it("renders Explore as a link", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).toBeInTheDocument();
  });

  it("renders Time Zones as a link", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toBeInTheDocument();
  });

  it("renders Cities as a button inside the desktop nav", () => {
    renderHeader();
    expect(getDesktopCitiesButton()).toBeInTheDocument();
  });

  it("nav contains exactly three items", () => {
    renderHeader();

    const nav = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    const links = nav.querySelectorAll("a");
    const buttons = nav.querySelectorAll("button");
    expect(links.length + buttons.length).toBe(3);
  });

  it("Explore link points at the explore hash", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("href", "#explore");
  });

  it("Time Zones link points at the time-zones hash", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toHaveAttribute("href", "#time-zones");
  });
});

/* -------------------------------------------------------------------------- */
/* Mobile controls                                                            */
/* -------------------------------------------------------------------------- */

describe("Header — mobile controls", () => {
  it("renders the mobile mode selector", () => {
    renderHeader();
    expect(
      screen.getByRole("radiogroup", { name: "Mobile view mode" }),
    ).toBeInTheDocument();
  });

  it("renders exactly two mode radios", () => {
    renderHeader();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("renders the mobile Cities button", () => {
    renderHeader();
    expect(getMobileCitiesButton()).toBeInTheDocument();
  });

  it("mode radios have distinct accessible names", () => {
    renderHeader();
    expect(
      screen.getByRole("radio", { name: "Globe" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Zones" }),
    ).toBeInTheDocument();
  });

  it("marks Globe as checked when mobileView is globe", () => {
    render(
      <Header mobileView="globe" onMobileViewChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("radio", { name: "Globe" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("marks Zones as checked when mobileView is zones", () => {
    render(
      <Header mobileView="zones" onMobileViewChange={vi.fn()} />,
    );
    expect(
      screen.getByRole("radio", { name: "Zones" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("Header — accessibility", () => {
  it("has a banner landmark", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("has a navigation landmark with an accessible name", () => {
    renderHeader();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
  });

  it("brand link has an accessible name", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "World Clock home" }),
    ).toHaveAccessibleName();
  });

  it("every interactive element has an accessible name", () => {
    renderHeader();

    const focusables = document.querySelectorAll<HTMLElement>(
      'a, button, [tabindex]:not([tabindex="-1"])',
    );

    for (const el of focusables) {
      const hasAccessibleName =
        el.getAttribute("aria-label") !== null ||
        el.textContent?.trim().length;
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  it("decorative icons are aria-hidden", () => {
    renderHeader();

    const svgs = document.querySelectorAll("svg");
    for (const svg of svgs) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});