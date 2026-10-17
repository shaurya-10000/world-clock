import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import Header from "@/components/Header";
import { emit, resetEventBus } from "@/lib/events";

/*
 * Replace `emit` with a spy so click tests can assert on it
 * without needing to know how the event bus delivers events.
 * Everything else in the module (including `resetEventBus`)
 * stays real.
 */
vi.mock("@/lib/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/events")>();
  return { ...actual, emit: vi.fn() };
});

/* -------------------------------------------------------------------------- */
/* matchMedia helper                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Install a fake `matchMedia` that reports the desktop
 * breakpoint per `desktop`. Every other media query
 * (including `prefers-reduced-motion`) reports `false`.
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

function setScrollY(value: number): void {
  Object.defineProperty(window, "scrollY", {
    writable: true,
    configurable: true,
    value,
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
  vi.mocked(emit).mockClear();
  installMatchMedia(false);
  setScrollY(0);
  window.location.hash = "";
});

afterEach(() => {
  resetEventBus();
  setScrollY(0);
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

  it("brand link points at the home page", () => {
    renderHeader();
    expect(
      screen.getByRole("link", { name: "World Clock home" }),
    ).toHaveAttribute("href", "/");
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
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

describe("Header — brand", () => {
  it("renders the star mark as a decorative svg", () => {
    renderHeader();

    const brand = screen.getByRole("link", {
      name: "World Clock home",
    });
    const star = brand.querySelector("svg");

    expect(star).not.toBeNull();
    expect(star).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the wordmark text inside the brand link", () => {
    renderHeader();

    const brand = screen.getByRole("link", {
      name: "World Clock home",
    });
    expect(brand).toHaveTextContent("World Clock");
  });

  it("hides the colour copy of the wordmark from assistive tech", () => {
    renderHeader();

    const brand = screen.getByRole("link", {
      name: "World Clock home",
    });
    const copies = Array.from(
      brand.querySelectorAll<HTMLElement>("span"),
    ).filter((el) => el.textContent === "World Clock");

    /* One visible copy, one aria-hidden colour copy. */
    expect(copies).toHaveLength(2);
    expect(
      copies.filter((el) => el.getAttribute("aria-hidden") === "true"),
    ).toHaveLength(1);
  });

  it("colour copy is invisible until the link is hovered", () => {
    renderHeader();

    const brand = screen.getByRole("link", {
      name: "World Clock home",
    });
    const colourCopy = brand.querySelector<HTMLElement>(
      'span[aria-hidden="true"].bg-clip-text',
    );

    expect(colourCopy).not.toBeNull();
    expect(colourCopy!.className).toContain("opacity-0");
    expect(colourCopy!.className).toContain("group-hover:opacity-100");
  });

  it("plain copy fades out on hover", () => {
    renderHeader();

    const brand = screen.getByRole("link", {
      name: "World Clock home",
    });
    const plainCopy = Array.from(
      brand.querySelectorAll<HTMLElement>("span"),
    ).find(
      (el) =>
        el.textContent === "World Clock" &&
        el.getAttribute("aria-hidden") !== "true",
    );

    expect(plainCopy).toBeDefined();
    expect(plainCopy!.className).toContain("group-hover:opacity-0");
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
/* Active state                                                               */
/* -------------------------------------------------------------------------- */

describe("Header — active state", () => {
  it("marks Explore as current when mobileView is globe", () => {
    render(
      <Header mobileView="globe" onMobileViewChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("aria-current", "location");
    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks Time Zones as current when mobileView is zones", () => {
    render(
      <Header mobileView="zones" onMobileViewChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toHaveAttribute("aria-current", "location");
    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("never marks the Cities button as current", () => {
    renderHeader();
    expect(getDesktopCitiesButton()).not.toHaveAttribute(
      "aria-current",
    );
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

  it("calls onMobileViewChange with zones when Zones is clicked", () => {
    const onChange = vi.fn();
    render(<Header mobileView="globe" onMobileViewChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Zones" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("zones");
  });

  it("calls onMobileViewChange with globe when Globe is clicked", () => {
    const onChange = vi.fn();
    render(<Header mobileView="zones" onMobileViewChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Globe" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("globe");
  });
});

/* -------------------------------------------------------------------------- */
/* Cities drawer                                                              */
/* -------------------------------------------------------------------------- */

describe("Header — cities drawer", () => {
  it("desktop Cities button emits cities:open", () => {
    renderHeader();

    fireEvent.click(getDesktopCitiesButton());

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("cities:open", undefined);
  });

  it("mobile Cities button emits cities:open", () => {
    renderHeader();

    fireEvent.click(getMobileCitiesButton());

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("cities:open", undefined);
  });

  it("clicking a section link does not open the drawer", () => {
    renderHeader();

    fireEvent.click(screen.getByRole("link", { name: "Explore" }));

    expect(emit).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Scroll state                                                               */
/* -------------------------------------------------------------------------- */

describe("Header — scroll state", () => {
  it("is transparent-bordered at the top of the page", () => {
    renderHeader();

    const header = screen.getByRole("banner");
    expect(header.className).toContain("border-transparent");
    expect(header.className).not.toContain("border-[var(--border)]");
  });

  it("gets a visible border after scrolling", () => {
    renderHeader();

    setScrollY(120);
    fireEvent.scroll(window);

    const header = screen.getByRole("banner");
    expect(header.className).toContain("border-[var(--border)]");
    expect(header.className).not.toContain("border-transparent");
  });

  it("returns to transparent when scrolled back to the top", () => {
    renderHeader();

    setScrollY(120);
    fireEvent.scroll(window);
    setScrollY(0);
    fireEvent.scroll(window);

    expect(screen.getByRole("banner").className).toContain(
      "border-transparent",
    );
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
    expect(svgs.length).toBeGreaterThan(0);

    for (const svg of svgs) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});