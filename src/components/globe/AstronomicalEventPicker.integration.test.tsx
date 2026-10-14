import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

/*
 * A second fixture where the *last* option is disabled. This
 * is what the "End lands on a disabled option" test needs:
 * with `End` jumping to `events[events.length - 1]`, the
 * disabled option must be last for that test to actually
 * exercise the intended no-op.
 */
const EVENTS_WITH_DISABLED_LAST: readonly AstronomicalEventOption[] = [
  option("now", "Right now"),
  option("next-solstice", "Next solstice"),
  option("sunrise", "Sunrise", {
    available: false,
    unavailableReason: "Select a city first",
  }),
];

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A parent that owns `activeEventId` state and passes it
 * down, mirroring the shape `Globe.tsx` uses. Selecting an
 * option from the picker updates the state and re-renders the
 * picker with the new active id.
 */
function Harness({
  initialActive = null as AstronomicalEventId | null,
  events = EVENTS,
  onSelect,
}: {
  initialActive?: AstronomicalEventId | null;
  events?: readonly AstronomicalEventOption[];
  onSelect?: (id: AstronomicalEventId) => void;
}) {
  const [active, setActive] = useState<AstronomicalEventId | null>(
    initialActive,
  );

  const handleSelect = (id: AstronomicalEventId) => {
    setActive(id);
    onSelect?.(id);
  };

  return (
    <AstronomicalEventPicker
      events={events}
      activeEventId={active}
      onSelect={handleSelect}
      reducedMotion={false}
    />
  );
}

function trigger() {
  return screen.getByRole("button", { name: /Astronomical events/ });
}

function listbox() {
  return screen.queryByRole("listbox");
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Click-driven round trips                                                   */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — round trips", () => {
  it("updates the trigger label after activating a new option", () => {
    render(<Harness />);

    expect(
      screen.getByRole("button", { name: "Astronomical events" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Astronomical events" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: /Next solstice/ }),
    );

    expect(
      screen.getByRole("button", {
        name: "Astronomical events: Next solstice",
      }),
    ).toBeInTheDocument();
  });

  it("closes the popup after an option click", () => {
    /*
     * The click on an option is an activation. Activations
     * dismiss the popup — the same way Enter does. Without
     * this, the popup would remain visible until the user
     * clicked somewhere else.
     */
    render(<Harness />);

    fireEvent.click(trigger());
    fireEvent.click(
      screen.getByRole("option", { name: /Next solstice/ }),
    );

    expect(listbox()).not.toBeInTheDocument();
  });

  it("returns focus to the trigger after an option click", () => {
    render(<Harness />);

    fireEvent.click(trigger());
    fireEvent.click(
      screen.getByRole("option", { name: /Next solstice/ }),
    );

    expect(trigger()).toHaveFocus();
  });

  it("updates aria-selected after activation", () => {
    render(<Harness />);

    fireEvent.click(trigger());
    fireEvent.click(
      screen.getByRole("option", { name: /Next solstice/ }),
    );

    /*
     * The popup closed after the click. Re-open it with the
     * trigger — since the popup is closed, the trigger's
     * click opens it (rather than toggling it closed).
     */
    fireEvent.click(trigger());
    const active = screen.getByRole("option", {
      name: /Next solstice/,
    });
    expect(active).toHaveAttribute("aria-selected", "true");
  });

  it("notifies the parent on each activation", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(trigger());
    fireEvent.click(
      screen.getByRole("option", { name: /Next solstice/ }),
    );

    /* The popup closed after the first activation. Re-open. */
    fireEvent.click(trigger());
    fireEvent.click(
      screen.getByRole("option", { name: /Next equinox/ }),
    );

    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([
      "next-solstice",
      "next-equinox",
    ]);
  });

  it("reflects an initial active id in the trigger label", () => {
    render(<Harness initialActive="next-equinox" />);

    expect(
      screen.getByRole("button", {
        name: "Astronomical events: Next equinox",
      }),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Keyboard round trips — the trigger path                                    */
/* -------------------------------------------------------------------------- */

/*
 * ## Why this block exists
 *
 * The click-driven round trips above prove that the popup's
 * activation path produces the right state updates. They do
 * not prove that a keyboard user can reach the popup at all,
 * because they open the popup with a click.
 *
 * The tests below open the popup with a *key press on the
 * trigger* and navigate entirely by keyboard. They are the
 * regression guard for the bug where `handleTriggerKeyDown`
 * was defined but never wired to the `Trigger` component —
 * without that wiring, ArrowDown on the trigger did nothing,
 * and every test in this block would have failed.
 *
 * The distinction matters because a real browser delivers
 * every key press to the *trigger*, not the popup: the popup
 * has no focusable children and the listbox pattern signals
 * focus via `aria-activedescendant`.
 *
 * ## Navigation arithmetic
 *
 * Several tests below fire a precise number of `ArrowDown`
 * presses to reach a target option. The count is derived from
 * the highlight's starting position, which is:
 *
 *   - **On the first press after open:** whichever option
 *     is highlighted by the picker's own open logic. When
 *     `activeEventId` is set, this is the active option's
 *     index. When it is `null`, the picker starts on index
 *     0.
 *   - **On every subsequent press:** the previous highlight
 *     index, moved by one (with wrapping).
 *
 * Off-by-one errors here are the most common source of
 * assertion failures in this block, so each test that
 * navigates more than once documents its arithmetic in the
 * test body.
 */

describe("AstronomicalEventPicker — keyboard round trips", () => {
  it("opens the popup when ArrowDown is pressed on the trigger", () => {
    render(<Harness />);

    expect(listbox()).not.toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(listbox()).toBeInTheDocument();
  });

  it("highlights the first option when opened via ArrowDown", () => {
    render(<Harness />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });

    const first = screen.getAllByRole("option")[0];
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      first?.id,
    );
  });

  it("updates the trigger label after activating a new option via keyboard", () => {
    render(<Harness />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(
      screen.getByRole("button", {
        name: "Astronomical events: Next solstice",
      }),
    ).toBeInTheDocument();
  });

  it("closes the popup after a keyboard activation", () => {
    render(<Harness />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(listbox()).not.toBeInTheDocument();
  });

  it("returns focus to the trigger after a keyboard activation", () => {
    render(<Harness />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(trigger()).toHaveFocus();
  });

  it("updates aria-selected after a keyboard activation", () => {
    render(<Harness />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    const active = screen.getByRole("option", {
      name: /Next solstice/,
    });
    expect(active).toHaveAttribute("aria-selected", "true");
  });

  it("starts the highlight on the active option when reopened via keyboard", () => {
    /*
     * The same continuity contract the click path already
     * covers: reopening the popup puts the highlight back on
     * whatever is currently active, so a keyboard user does
     * not have to re-navigate to the option they just picked.
     */
    render(<Harness initialActive="next-equinox" />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });

    const active = screen.getByRole("option", {
      name: /Next equinox/,
    });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      active.id,
    );
  });

  it("notifies the parent on each keyboard activation", () => {
    /*
     * ## Navigation arithmetic
     *
     * First activation:
     *
     *   - Open with `ArrowDown` — the picker's open logic
     *     highlights index 0 (`Right now`) because no
     *     `activeEventId` was supplied.
     *   - One more `ArrowDown` — moves to index 1
     *     (`next-solstice`).
     *   - `Enter` — activates `next-solstice`.
     *
     * Second activation:
     *
     *   - Reopen with `ArrowDown` — the picker now has an
     *     active id, so the highlight lands on the active
     *     option (index 1, `next-solstice`).
     *   - One more `ArrowDown` — moves to index 2
     *     (`next-equinox`).
     *   - `Enter` — activates `next-equinox`.
     *
     * ## Why one `ArrowDown` on the reopen, not two
     *
     * An earlier version of this test fired two `ArrowDown`
     * presses on the reopen, expecting to land on
     * `next-equinox`. That produced `subsolar-now` (index 3):
     * the reopen highlights the *active* option (index 1), so
     * two presses move to index 3, not index 2. One press is
     * the correct count.
     *
     * The click-driven counterpart of this test
     * ("notifies the parent on each activation", above) uses
     * `getByRole("option", { name: ... })` to select by
     * accessible name rather than by navigating to it. That
     * path is insensitive to how many presses are needed, so
     * it passed with the same off-by-one mistake.
     */
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([
      "next-solstice",
      "next-equinox",
    ]);
  });

  it("navigates with End and activates via keyboard", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "End" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    /*
     * The last non-disabled option is `solar-noon`. The
     * fixture's last option (index 6) is enabled; the
     * disabled sunrise sits at index 4, between the two
     * points End would land on.
     */
    expect(onSelect).toHaveBeenCalledWith("solar-noon");
  });

  it("does not activate a disabled option via keyboard from the trigger", () => {
    const onSelect = vi.fn();
    render(
      <Harness
        events={EVENTS_WITH_DISABLED_LAST}
        onSelect={onSelect}
      />,
    );

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "End" });
    fireEvent.keyDown(trigger(), { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Disabled options round trip                                                */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — disabled options", () => {
  it("renders the unavailable reason instead of the description", () => {
    render(<Harness />);
    fireEvent.click(trigger());

    const sunrise = screen.getByRole("option", {
      name: /Sunrise/,
    });

    expect(sunrise).toHaveTextContent("Select a city first");
    expect(sunrise).not.toHaveTextContent("Sunrise description");
  });

  it("marks the disabled option as disabled in the DOM", () => {
    render(<Harness />);
    fireEvent.click(trigger());

    const sunrise = screen.getByRole("option", { name: /Sunrise/ });
    expect(sunrise).toBeDisabled();
  });

  it("does not update aria-selected when the disabled option is clicked", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: /Sunrise/ }));

    expect(onSelect).not.toHaveBeenCalled();
    /*
     * The popup stays open because no activation happened —
     * the disabled option's click is a no-op, and the popup
     * only closes on a successful activation.
     */
    expect(listbox()).toBeInTheDocument();
  });

  it("does not activate a disabled option via keyboard", () => {
    /*
     * The fixture for this test has the disabled option last,
     * so `End` lands directly on it. That is the case the
     * test is meant to exercise: Enter on a
     * highlighted-but-disabled option is a no-op.
     */
    const onSelect = vi.fn();
    render(
      <Harness events={EVENTS_WITH_DISABLED_LAST} onSelect={onSelect} />,
    );

    fireEvent.click(trigger());
    fireEvent.keyDown(listbox()!, { key: "End" });
    fireEvent.keyDown(listbox()!, { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still lets the user read the disabled option's reason via keyboard highlight", () => {
    /*
     * The disabled option can be highlighted — that is how a
     * keyboard user reads the `unavailableReason`. Only the
     * Enter activation is suppressed.
     */
    render(<Harness events={EVENTS_WITH_DISABLED_LAST} />);

    fireEvent.click(trigger());
    fireEvent.keyDown(listbox()!, { key: "End" });

    const disabled = screen.getByRole("option", { name: /Sunrise/ });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      disabled.id,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Highlight continuity                                                       */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — highlight continuity", () => {
  it("starts the highlight on the active option when the picker opens", () => {
    render(<Harness initialActive="next-equinox" />);
    fireEvent.click(trigger());

    const active = screen.getByRole("option", {
      name: /Next equinox/,
    });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      active.id,
    );
  });

  it("returns to the active option after close and reopen", () => {
    render(<Harness initialActive="next-equinox" />);

    fireEvent.click(trigger());
    fireEvent.keyDown(listbox()!, { key: "Home" });
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(trigger());
    const active = screen.getByRole("option", {
      name: /Next equinox/,
    });
    expect(listbox()?.getAttribute("aria-activedescendant")).toBe(
      active.id,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Outside click does not steal state                                         */
/* -------------------------------------------------------------------------- */

describe("AstronomicalEventPicker — outside click", () => {
  it("does not clear the active id when closed by outside click", () => {
    render(<Harness initialActive="next-solstice" />);

    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);

    /* The active id is unchanged; the label still reflects it. */
    expect(
      screen.getByRole("button", {
        name: "Astronomical events: Next solstice",
      }),
    ).toBeInTheDocument();
  });
});