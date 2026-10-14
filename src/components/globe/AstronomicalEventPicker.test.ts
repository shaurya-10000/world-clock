import { describe, expect, it } from "vitest";

import { getTriggerLabel } from "@/components/globe/AstronomicalEventPicker";
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
): AstronomicalEventOption {
  return {
    id,
    label,
    description: `${label} description`,
    available: true,
    unavailableReason: null,
  };
}

const EVENTS: readonly AstronomicalEventOption[] = [
  option("now", "Right now"),
  option("next-solstice", "Next solstice"),
  option("next-equinox", "Next equinox"),
  option("subsolar-now", "Show the sun's current location"),
  option("sunrise", "Sunrise"),
  option("sunset", "Sunset"),
  option("solar-noon", "Solar noon"),
];

/* -------------------------------------------------------------------------- */
/* getTriggerLabel                                                            */
/* -------------------------------------------------------------------------- */

describe("getTriggerLabel", () => {
  it("returns 'Astronomy' when no active event is set", () => {
    expect(getTriggerLabel(EVENTS, null)).toBe("Astronomy");
  });

  it("returns the active event's label", () => {
    expect(getTriggerLabel(EVENTS, "next-solstice")).toBe(
      "Next solstice",
    );
  });

  it("returns the label of every event by its id", () => {
    for (const event of EVENTS) {
      expect(getTriggerLabel(EVENTS, event.id)).toBe(event.label);
    }
  });

  it("falls back to 'Astronomy' when the active id is not in the list", () => {
    /*
     * The active id is set by the hook from the same events
     * array, so this should never happen in practice. The
     * fallback exists so a stale or corrupted id does not
     * crash the trigger — the button still renders with a
     * sensible label.
     */
    expect(
      getTriggerLabel([], "next-solstice"),
    ).toBe("Astronomy");
  });

  it("falls back to 'Astronomy' when the events array is empty", () => {
    expect(getTriggerLabel([], null)).toBe("Astronomy");
    expect(getTriggerLabel([], "sunrise")).toBe("Astronomy");
  });

  it("is pure — the same inputs produce the same output", () => {
    expect(getTriggerLabel(EVENTS, "sunrise")).toBe(
      getTriggerLabel(EVENTS, "sunrise"),
    );
  });

  it("does not mutate the events array", () => {
    const copy = [...EVENTS];
    getTriggerLabel(EVENTS, "next-equinox");
    expect(EVENTS).toEqual(copy);
  });

  it("returns a string for every valid input combination", () => {
    for (const id of [null, ...EVENTS.map((e) => e.id)] as const) {
      const label = getTriggerLabel(EVENTS, id);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});