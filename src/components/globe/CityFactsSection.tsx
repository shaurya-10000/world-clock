"use client";

/**
 * The city facts section of the arrival card.
 *
 * A small block of label/value rows showing static facts
 * about the selected city: population, elevation, area,
 * language, and currency. Positioned in the card below the
 * coordinates, above the "Open in Google Maps" link.
 *
 * ## Why a separate component
 *
 * The section has three concerns that belong together and
 * separate from the rest of the card:
 *
 *   1. It reads from `getCityFactRows` and receives a
 *      formatted array — it does no computation itself.
 *   2. It renders nothing when the array is empty, so the
 *      caller never needs to check "does this city have
 *      facts?" before rendering it.
 *   3. It owns the label/value layout, which is reused
 *      across all five rows and should not be duplicated at
 *      each call site.
 *
 * ## Styling contract
 *
 * The wrapper class and the caption class are the same ones
 * the "Coordinates" section of `CityArrivalCard` uses. That
 * is not a coincidence — the two sections are siblings in
 * the same card and must read as a matched pair. The
 * constants are exported so the card imports them rather
 * than duplicating them, and so a change to one section's
 * spacing is automatically picked up by the other.
 *
 * This is a deliberate inversion of the naive
 * "each component owns its own styles" pattern. It is
 * correct here because the two sections are visually coupled
 * — a change to one that is not mirrored in the other
 * produces a broken card, not a slightly-off card. Coupling
 * them at the source is cheaper than coupling them at the
 * review.
 *
 * ## Accessibility
 *
 * The section is a `<dl>` — a definition list — which is the
 * semantically correct element for a set of term/value pairs.
 *
 * A `<table>` would have been the wrong choice: it introduces
 * a `table` role and a row/column structure into the
 * accessibility tree, implying that the facts are tabular
 * data that can be sorted or filtered. They are not — they
 * are independent term/value pairs where order is meaningful
 * but grid structure is not. Screen readers announce each
 * `<dt>`/`<dd>` pair as a single "label, value" unit, which
 * is what a user wants.
 *
 * The section label is rendered as a plain `<p>` rather than
 * a heading, because it does not introduce a navigable
 * subsection; it is a caption for the following list.
 *
 * The `aria-hidden` treatment used by the decorative chrome
 * elsewhere in the card does **not** apply here. Facts are
 * content, not decoration. They are read aloud.
 */

import { getCityFactRows } from "@/lib/city-facts";

/* -------------------------------------------------------------------------- */
/* Layout constants                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The section's structural class string.
 *
 * Mirrors the "Coordinates" section of `CityArrivalCard` so
 * the two blocks read as a matched pair: same top margin,
 * same border, same vertical padding, same responsive
 * breakpoints.
 *
 * Exported so `CityArrivalCard` imports this value rather
 * than duplicating it. The dependency direction is
 * intentional: this component is the more general of the
 * two, and the card is a specific consumer.
 */
export const CARD_SECTION_WRAPPER_CLASS = `
  mt-2.5
  border-t
  border-[var(--border)]
  pt-2.5
  sm:mt-3.5
  sm:pt-3
`;

/**
 * The section caption's class string.
 *
 * Uppercase, widely tracked, and small — matching the
 * "Coordinates" caption in `CityArrivalCard` exactly.
 *
 * Exported alongside `CARD_SECTION_WRAPPER_CLASS` for the
 * same reason.
 */
export const CARD_SECTION_CAPTION_CLASS = `
  text-[8px]
  font-medium
  tracking-[0.12em]
  text-[var(--subtle)]
  uppercase
  sm:text-[9px]
  sm:tracking-[0.14em]
`;

/**
 * The `<dl>` grid template.
 *
 * Two columns: the term is sized to its content (with a gap),
 * and the value fills the remainder. Exported because the
 * "Coordinates" section uses the same template — the two
 * sections always appear together in the same card, and
 * different column templates would produce a visible
 * misalignment between their rows.
 */
export const CARD_SECTION_GRID_CLASS = `
  mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1
`;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface CityFactsSectionProps {
  /**
   * The stable ID of the location whose facts to render,
   * matching `WorldLocation.id`.
   *
   * The component looks up the facts internally rather than
   * accepting the rows as a prop. This keeps the caller's
   * JSX minimal — `CityArrivalCard` renders
   * `<CityFactsSection locationId={location.id} />` and does
   * not need to know that the facts exist, what they
   * contain, or how they are formatted.
   */
  readonly locationId: string;
}

/* -------------------------------------------------------------------------- */
/* FactRow                                                                    */
/* -------------------------------------------------------------------------- */

interface FactRowProps {
  readonly label: string;
  readonly value: string;
}

/**
 * A single term/value pair.
 *
 * Rendered as `<dt>` / `<dd>` rather than a plain `<div>` or
 * `<span>` pair because the parent is a `<dl>` and the
 * browser uses the dt/dd relationship to expose the row
 * correctly to screen readers — "Population, 8,335,897"
 * rather than two disconnected fragments.
 *
 * Extracted into its own component so the section's map
 * callback stays readable.
 */
function FactRow({ label, value }: FactRowProps) {
  return (
    <>
      <dt
        className="
          text-[9px]
          text-[var(--muted)]
          sm:text-[10px]
        "
      >
        {label}
      </dt>

      <dd
        className="
          truncate
          text-right
          font-mono
          text-[9px]
          tabular-nums
          text-[var(--muted)]
          sm:text-[10px]
        "
      >
        {value}
      </dd>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CityFactsSection({
  locationId,
}: CityFactsSectionProps) {
  const rows = getCityFactRows(locationId);

  /*
   * No facts means no section. Returning `null` rather than
   * rendering an empty shell keeps the DOM clean and lets the
   * caller place the section unconditionally. A city with no
   * entry in `CITY_FACTS` — which is most of the catalog
   * today — renders the card exactly as before this feature
   * existed.
   */
  if (rows.length === 0) return null;

  return (
    <div className={CARD_SECTION_WRAPPER_CLASS}>
      <p className={CARD_SECTION_CAPTION_CLASS}>City</p>

      <dl className={CARD_SECTION_GRID_CLASS}>
        {/*
         * Keyed on label and index together.
         *
         * The index is what makes the key unique: a future
         * fact that shares a label with an existing one
         * (e.g. a second "Language" row for a country with
         * two official languages) would collide on the
         * label alone. `getCityFactRows` returns rows in a
         * deterministic order for a given location, so the
         * index is stable across renders.
         *
         * The label is included for readability in React
         * DevTools — the key shows as `"Population-0"`
         * rather than just `0`.
         */}
        {rows.map((row, index) => (
          <FactRow
            key={`${row.label}-${index}`}
            label={row.label}
            value={row.value}
          />
        ))}
      </dl>
    </div>
  );
}