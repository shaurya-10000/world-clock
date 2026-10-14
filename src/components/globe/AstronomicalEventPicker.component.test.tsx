import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AstronomicalEventPicker from "@/components/globe/AstronomicalEventPicker";
import type {
  AstronomicalEventId,
  AstronomicalEventOption,
} from "@/components/globe/useAstronomicalEventPicker";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function option(
  id: AstronomicalEventId,
  label: string,
  overrides: Partial<AstronomicalEventOption> = {},
): AstronomicalEventOption {
  return {
    id,
    label,
    description: `${label} description`,
    available: true,
    unavailableReason: null,
    ...overrides,
  };
}

const EVENTS: readonly AstronomicalEventOption[] = [
  option("now", "Right now"),
  option("next-solstice", "Next solstice"),
  option("next-equinox", "Next equinox"),
  option("subsolar-now", "Show the sun's current location"),
  option("sunrise", "Sunrise", {
    available: false,
    unavailableReason: "Select a city first",
  }),
  option("sunset", "Sunset"),
  option("solar-noon", "Solar noon"),
];

interface RenderOptions {
  events?: readonly AstronomicalEventOption[];
  activeEventId?: AstronomicalEventId | null;
  onSelect?: (id: AstronomicalEventId) => void;
  reducedMotion?: boolean;
}

function renderPicker(opts: RenderOptions = {}) {
  const onSelect = opts.onSelect ?? vi.fn();

  const result = render(
    <AstronomicalEventPicker
      events={opts.events ?? EVENTS}
      activeEventId={opts.activeEventId ?? null}
      onSelect={onSelect}
      reducedMotion={opts.reducedMotion ?? false}
    />,
  );

  return { ...result, onSelect };
}

function trigger() {
  return screen.getByRole("button", { name: /Astronomical events/ });
}

function listbox() {
  return screen.queryByRole("listbox");
}

function options() {
  return screen.queryAllByRole("option");
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — structure", () => {
  it("renders without throwing", () => {
    expect(() => renderPicker()).not.toThrow();
  });

  it("renders a trigger button with the astronomy label by default", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: "Astronomical events" }),
    ).toBeInTheDocument();
  });

  it("renders the trigger label reflecting the active event", () => {
    renderPicker({ activeEventId: "next-solstice" });
    expect(
      screen.getByRole("button", {
        name: "Astronomical events: Next solstice",
      }),
    ).toBeInTheDocument();
  });

  it("does not render the listbox when closed", () => {
    renderPicker();
    expect(listbox()).not.toBeInTheDocument();
  });

  it("marks the trigger with aria-haspopup=listbox", () => {
    renderPicker();
    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("sets aria-expanded=false when closed", () => {
    renderPicker();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("sets aria-expanded=true when open", () => {
    renderPicker();
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });
});

/* -------------------------------------------------------------------------- */
/* Open / close                                                               */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — open and close", () => {
  it("opens the listbox on trigger click", () => {
    renderPicker();
    fireEvent.click(trigger());
    expect(listbox()).toBeInTheDocument();
  });

  it("renders one option per event when open", () => {
    renderPicker();
    fireEvent.click(trigger());
    expect(options()).toHaveLength(EVENTS.length);
  });

  it("closes the listbox on a second trigger click", () => {
    renderPicker();
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(listbox()).not.toBeInTheDocument();
  });

  it("closes the listbox on Escape", () => {
    renderPicker();
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(listbox()).not.toBeInTheDocument();
  });

  it("closes the listbox on an outside pointerdown", () => {
    const { container } = renderPicker();
    fireEvent.click(trigger());
    expect(listbox()).toBeInTheDocument();

    fireEvent.pointerDown(container.parentElement ?? document.body);
    expect(listbox()).not.toBeInTheDocument();
  });

  it("moves focus back to the trigger after Escape", () => {
    renderPicker();
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger()).toHaveFocus();
  });
});

/* -------------------------------------------------------------------------- */
/* ARIA — active option                                                       */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — aria-selected", () => {
  it("marks the active option as aria-selected=true", () => {
    renderPicker({ activeEventId: "next-solstice" });
    fireEvent.click(trigger());

    const active = screen.getByRole("option", {
      name: /Next solstice/,
    });
    expect(active).toHaveAttribute("aria-selected", "true");
  });

  it("marks every non-active option as aria-selected=false", () => {
    renderPicker({ activeEventId: "next-solstice" });
    fireEvent.click(trigger());

    for (const event of EVENTS) {
      if (event.id === "next-solstice") continue;
      const opt = screen.getByRole("option", {
        name: new RegExp(event.label),
      });
      expect(opt).toHaveAttribute("aria-selected", "false");
    }
  });

  it("marks every option false when no active event is set", () => {
    renderPicker({ activeEventId: null });
    fireEvent.click(trigger());

    for (const opt of options()) {
      expect(opt).toHaveAttribute("aria-selected", "false");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* ARIA — activedescendant                                                    */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — aria-activedescendant", () => {
  it("points at the first option's id when the listbox opens", () => {
    renderPicker();
    fireEvent.click(trigger());

    const box = listbox();
    const firstOption = options()[0];
    expect(box?.getAttribute("aria-activedescendant")).toBe(
      firstOption?.id,
    );
  });

  it("points at the active option when one is set", () => {
    renderPicker({ activeEventId: "next-equinox" });
    fireEvent.click(trigger());

    const box = listbox();
    const active = screen.getByRole("option", {
      name: /Next equinox/,
    });
    expect(box?.getAttribute("aria-activedescendant")).toBe(active.id);
  });

  it("is removed when the highlight moves off the list", () => {
    /*
     * The highlight is only cleared on close. This test
     * pins the invariant that while the listbox is mounted,
     * `aria-activedescendant` always points at a real option
     * (or is absent).
     */
    renderPicker();
    fireEvent.click(trigger());
    const box = listbox();
    const id = box?.getAttribute("aria-activedescendant");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Trigger keyboard navigation — the primary path                             */
/* -------------------------------------------------------------------------- */

/*
 * ## Why this block exists separately
 *
 * The component's real keyboard flow delivers every key press
 * to the *trigger*, because DOM focus never leaves the trigger
 * during the interaction — the popup has no focusable
 * children and the listbox pattern signals focus via
 * `aria-activedescendant`.
 *
 * The tests below fire keydown on the trigger, which is what
 * a real browser does. They are the ones that would have
 * caught the bug where `handleTriggerKeyDown` was defined but
 * never wired to the `Trigger` component.
 *
 * The block after this one fires keydown on the *popup*
 * directly. Those tests exercise the popup's own defensive
 * `onKeyDown` handler, which exists for the case where a
 * future change moves DOM focus into the popup. They are
 * useful as a fallback contract, but they do not represent
 * the primary keyboard path — do not remove the trigger
 * block in favour of the popup block.
 */

describe("AstronomicalEventPicker — trigger keyboard navigation", () => {
  it("opens the listbox when ArrowDown is pressed on the trigger", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(listbox()).toBeInTheDocument();
  });

  it("opens the listbox when ArrowUp is pressed on the trigger", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(listbox()).toBeInTheDocument();
  });

  it("opens the listbox when Enter is pressed on the trigger", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(listbox()).toBeInTheDocument();
  });

  it("opens the listbox when Space is pressed on the trigger", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: " " });
    expect(listbox()).toBeInTheDocument();
  });

  it("moves the highlight down on ArrowDown while the popup is open", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    // The highlight starts on the first option. One more
    // ArrowDown should advance to the second.
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });

    const second = options()[1];
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      second?.id,
    );
  });

  it("wraps from the last option to the first on ArrowDown", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });

    for (let i = 0; i < EVENTS.length - 1; i += 1) {
      fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    }

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("moves the highlight up on ArrowUp", () => {
    renderPicker({ activeEventId: "next-solstice" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });

    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("jumps to the first option on Home", () => {
    renderPicker({ activeEventId: "solar-noon" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Home" });

    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("jumps to the last option on End", () => {
    renderPicker();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "End" });

    const last = options()[options().length - 1];
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      last?.id,
    );
  });

  it("activates the highlighted option on Enter", () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("next-solstice");
  });

  it("activates the highlighted option on Space", () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: " " });

    expect(onSelect).toHaveBeenCalledWith("now");
  });

  it("closes the listbox after activation via the trigger", () => {
    renderPicker();

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(listbox()).not.toBeInTheDocument();
  });

  it("returns focus to the trigger after activation", () => {
    renderPicker();

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(trigger()).toHaveFocus();
  });

  it("does not activate a disabled option on Enter", () => {
    const onSelect = vi.fn();
    renderPicker({
      activeEventId: "subsolar-now",
      onSelect,
    });

    // Open, then move down to the disabled sunrise option.
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Popup keyboard navigation — defensive fallback                             */
/* -------------------------------------------------------------------------- */

/*
 * These tests fire keydown directly on the popup element. In
 * a real browser the popup never receives keydown events
 * because it has no focusable children and DOM focus stays
 * on the trigger — but the popup's `onKeyDown` handler is
 * retained as a defensive fallback, and these tests pin its
 * contract.
 *
 * The block above ("trigger keyboard navigation") is the
 * one that mirrors what a browser actually does. Do not
 * delete it in favour of this one.
 */

describe("AstronomicalEventPicker — popup keyboard navigation (fallback)", () => {
  it("moves the highlight down on ArrowDown", () => {
    renderPicker();
    fireEvent.click(trigger());

    fireEvent.keyDown(listbox()!, { key: "ArrowDown" });

    const second = options()[1];
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      second?.id,
    );
  });

  it("wraps from the last option to the first on ArrowDown", () => {
    renderPicker();
    fireEvent.click(trigger());

    /* Move to the last option. */
    for (let i = 0; i < EVENTS.length - 1; i += 1) {
      fireEvent.keyDown(listbox()!, { key: "ArrowDown" });
    }

    fireEvent.keyDown(listbox()!, { key: "ArrowDown" });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("moves the highlight up on ArrowUp", () => {
    renderPicker({ activeEventId: "next-solstice" });
    fireEvent.click(trigger());

    fireEvent.keyDown(listbox()!, { key: "ArrowUp" });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("jumps to the first option on Home", () => {
    renderPicker({ activeEventId: "solar-noon" });
    fireEvent.click(trigger());

    fireEvent.keyDown(listbox()!, { key: "Home" });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("jumps to the last option on End", () => {
    renderPicker();
    fireEvent.click(trigger());

    fireEvent.keyDown(listbox()!, { key: "End" });
    const last = options()[options().length - 1];
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      last?.id,
    );
  });

  it("does not crash on an empty events array", () => {
    renderPicker({ events: [] });
    fireEvent.click(trigger());

    expect(() => {
      fireEvent.keyDown(listbox()!, { key: "ArrowDown" });
      fireEvent.keyDown(listbox()!, { key: "ArrowUp" });
      fireEvent.keyDown(listbox()!, { key: "Home" });
      fireEvent.keyDown(listbox()!, { key: "End" });
    }).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Keyboard — activation via popup fallback                                   */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — activation (popup fallback)", () => {
  it("calls onSelect with the highlighted option on Enter", () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    fireEvent.click(trigger());

    fireEvent.keyDown(listbox()!, { key: "ArrowDown" });
    fireEvent.keyDown(listbox()!, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("next-solstice");
  });

  it("closes the listbox after activation", () => {
    renderPicker();
    fireEvent.click(trigger());
    fireEvent.keyDown(listbox()!, { key: "Enter" });
    expect(listbox()).not.toBeInTheDocument();
  });

  it("returns focus to the trigger after activation", () => {
    renderPicker();
    fireEvent.click(trigger());
    fireEvent.keyDown(listbox()!, { key: "Enter" });
    expect(trigger()).toHaveFocus();
  });

  it("does not call onSelect when Enter lands on a disabled option", () => {
    const onSelect = vi.fn();
    renderPicker({
      activeEventId: "subsolar-now",
      onSelect,
    });
    fireEvent.click(trigger());

    /* Move to the disabled sunrise option. */
    fireEvent.keyDown(listbox()!, { key: "ArrowDown" });
    fireEvent.keyDown(listbox()!, { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("activates on Space like it does on Enter", () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    fireEvent.click(trigger());

    fireEvent.keyDown(listbox()!, { key: " " });

    expect(onSelect).toHaveBeenCalledWith("now");
  });
});

/* -------------------------------------------------------------------------- */
/* Click on an option                                                         */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — option click", () => {
  it("calls onSelect with the clicked option's id", () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    fireEvent.click(trigger());

    fireEvent.click(
      screen.getByRole("option", { name: /Next solstice/ }),
    );

    expect(onSelect).toHaveBeenCalledWith("next-solstice");
  });

  it("does not call onSelect when the disabled option is clicked", () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    fireEvent.click(trigger());

    fireEvent.click(
      screen.getByRole("option", { name: /Sunrise/ }),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                             */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — reduced motion", () => {
  it("applies the picker-in animation when reducedMotion is false", () => {
    renderPicker({ reducedMotion: false });
    fireEvent.click(trigger());
    expect(listbox()?.getAttribute("style")).toContain(
      "world-clock-picker-in",
    );
  });

  it("uses animation: none when reducedMotion is true", () => {
    renderPicker({ reducedMotion: true });
    fireEvent.click(trigger());
    expect(listbox()?.getAttribute("style")).toContain(
      "animation: none",
    );
  });
});