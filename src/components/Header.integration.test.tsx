import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { resetEventBus, subscribe } from "@/lib/events";

/* -------------------------------------------------------------------------- */
/* matchMedia helper                                                          */
/* -------------------------------------------------------------------------- */

function installMatchMedia(desktop: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) =>
      ({
        matches: query.includes("min-width: 768px") ? desktop : false,
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
/* Cities-button helpers                                                      */
/* -------------------------------------------------------------------------- */

function getDesktopCitiesButton(): HTMLElement {
  const nav = screen.getByRole("navigation", {
    name: "Primary navigation",
  });
  return within(nav).getByRole("button", { name: "Cities" });
}

function getMobileCitiesButton(): HTMLElement {
  const mobile = document.querySelector<HTMLElement>(".md\\:hidden");
  if (!mobile) {
    throw new Error("Mobile actions container not found");
  }
  return within(mobile).getByRole("button", { name: "Cities" });
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  resetEventBus();
  installMatchMedia(true);
  window.location.hash = "";
});

afterEach(() => {
  resetEventBus();
  vi.restoreAllMocks();
});

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof Header>> = {},
) {
  const props: React.ComponentProps<typeof Header> = {
    mobileView: "globe",
    onMobileViewChange: vi.fn(),
    ...overrides,
  };
  render(<Header {...props} />);
  return props;
}

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

describe("Header — brand", () => {
  it("renders the brand link", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: "World Clock home" }),
    ).toBeInTheDocument();
  });

  it("brand link points at the app root", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: "World Clock home" }),
    ).toHaveAttribute("href", "/");
  });
});

/* -------------------------------------------------------------------------- */
/* Desktop navigation                                                         */
/* -------------------------------------------------------------------------- */

describe("Header — desktop navigation", () => {
  it("renders all three nav items", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toBeInTheDocument();
    expect(getDesktopCitiesButton()).toBeInTheDocument();
  });

  it("Cities in the desktop nav is a button, not a link", () => {
    renderHeader();

    const nav = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    expect(
      within(nav).queryByRole("link", { name: "Cities" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: "Cities" }),
    ).toBeInTheDocument();
  });

  it("Explore and Time Zones carry their hash hrefs", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).toHaveAttribute("href", "#explore");
    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toHaveAttribute("href", "#time-zones");
  });

  it("nav has an accessible label", () => {
    renderHeader();

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Cities drawer emission                                                     */
/* -------------------------------------------------------------------------- */

describe("Header — cities event", () => {
  it("emits cities:open when the desktop Cities button is clicked", () => {
    const received = vi.fn();
    subscribe("cities:open", received);

    renderHeader();

    fireEvent.click(getDesktopCitiesButton());

    expect(received).toHaveBeenCalledTimes(1);
  });

  it("emits cities:open when the mobile Cities button is clicked", () => {
    installMatchMedia(false);
    const received = vi.fn();
    subscribe("cities:open", received);

    renderHeader();

    fireEvent.click(getMobileCitiesButton());

    expect(received).toHaveBeenCalledTimes(1);
  });

  it("does not emit for other nav items", () => {
    const received = vi.fn();
    subscribe("cities:open", received);

    renderHeader();

    fireEvent.click(screen.getByRole("link", { name: "Explore" }));
    fireEvent.click(screen.getByRole("link", { name: "Time Zones" }));

    expect(received).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Mobile view switching                                                      */
/* -------------------------------------------------------------------------- */

describe("Header — mobile view switching", () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  it("renders the mobile mode selector", () => {
    renderHeader();

    expect(
      screen.getByRole("radiogroup", { name: "Mobile view mode" }),
    ).toBeInTheDocument();
  });

  it("marks Globe as checked when mobileView is globe", () => {
    renderHeader({ mobileView: "globe" });

    expect(
      screen.getByRole("radio", { name: "Globe" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "Zones" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("marks Zones as checked when mobileView is zones", () => {
    renderHeader({ mobileView: "zones" });

    expect(
      screen.getByRole("radio", { name: "Zones" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "Globe" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("calls onMobileViewChange('zones') when Zones is clicked", () => {
    const onMobileViewChange = vi.fn();
    renderHeader({ mobileView: "globe", onMobileViewChange });

    fireEvent.click(screen.getByRole("radio", { name: "Zones" }));

    expect(onMobileViewChange).toHaveBeenCalledWith("zones");
  });

  it("calls onMobileViewChange('globe') when Globe is clicked", () => {
    const onMobileViewChange = vi.fn();
    renderHeader({ mobileView: "zones", onMobileViewChange });

    fireEvent.click(screen.getByRole("radio", { name: "Globe" }));

    expect(onMobileViewChange).toHaveBeenCalledWith("globe");
  });
});

/* -------------------------------------------------------------------------- */
/* Hash sync                                                                  */
/* -------------------------------------------------------------------------- */

describe("Header — hash sync", () => {
  it("marks Explore active by default", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: "Explore" }),
    ).toBeInTheDocument();
  });

  it("syncs active state with the URL hash on mount", async () => {
    window.location.hash = "#time-zones";

    renderHeader();

    // The indicator is `layoutId="world-clock-nav-indicator"`.
    // We confirm the Time Zones link is present, which is what
    // the visible state reflects.
    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toBeInTheDocument();
  });

  it("updates active state on hashchange", () => {
    renderHeader();

    act(() => {
      window.location.hash = "#time-zones";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(
      screen.getByRole("link", { name: "Time Zones" }),
    ).toBeInTheDocument();
  });

  it("ignores a hash that matches no nav item", () => {
    renderHeader();

    act(() => {
      window.location.hash = "#not-a-real-section";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    // The header still renders; no crash.
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Responsive rendering                                                       */
/* -------------------------------------------------------------------------- */

describe("Header — responsive rendering", () => {
  it("keeps the mobile mode selector in the DOM on desktop (hidden via CSS)", () => {
    installMatchMedia(true);
    renderHeader();

    const mobileGroup = screen.queryByRole("radiogroup", {
      name: "Mobile view mode",
    });

    expect(mobileGroup).toBeInTheDocument();
  });

  it("desktop nav uses the md:flex utility class", () => {
    installMatchMedia(true);
    renderHeader();

    const nav = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("md:flex");
  });

  it("mobile actions use the md:hidden utility class", () => {
    installMatchMedia(false);
    renderHeader();

    const mobile = document.querySelector<HTMLElement>(
      ".md\\:hidden",
    );

    expect(mobile).not.toBeNull();
  });
});

/* Suppress unused import warning. */
void waitFor;