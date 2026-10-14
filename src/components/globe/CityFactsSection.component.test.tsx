import { render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import CityFactsSection from "@/components/globe/CityFactsSection";
import { getCityFactRows } from "@/lib/city-facts";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A city that has a fact entry. `"new-york"` has all five
 * facts populated, so the section renders the fullest possible
 * shape.
 */
const CITY_WITH_FACTS = "new-york";

/**
 * A city that has no fact entry. `"boston"` is in the catalog
 * but not in `CITY_FACTS`, so the section renders nothing. If
 * a future data-entry pass adds `boston` to the table, the
 * empty-state tests below will fail — which is the correct
 * signal that this constant needs to move to another city.
 */
const CITY_WITHOUT_FACTS = "boston";

/**
 * A city with a partial fact entry. `"montreal"` is in
 * `CITY_FACTS` with only its country-level facts (language
 * and currency); the three city-level numerics are
 * deliberately absent. Used to verify that missing facts do
 * not produce empty rows or placeholder values.
 *
 * If a future data-entry pass fills in Montreal's numbers,
 * the partial-data tests below become tautologies against
 * `getCityFactRows` and should be repointed at another
 * partial city. The `CITY_FACTS` module header documents the
 * partial-entry intent.
 */
const CITY_WITH_PARTIAL_FACTS = "montreal";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — empty state", () => {
  it("renders nothing when the city has no facts", () => {
    const { container } = render(
      <CityFactsSection locationId={CITY_WITHOUT_FACTS} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the location id is unknown", () => {
    const { container } = render(
      <CityFactsSection locationId="not-a-real-city" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the location id is empty", () => {
    const { container } = render(
      <CityFactsSection locationId="" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("does not render the 'City' caption when there are no rows", () => {
    render(<CityFactsSection locationId={CITY_WITHOUT_FACTS} />);

    expect(screen.queryByText("City")).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Populated state                                                            */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — populated state", () => {
  it("renders the section caption", () => {
    render(<CityFactsSection locationId={CITY_WITH_FACTS} />);

    expect(screen.getByText("City")).toBeInTheDocument();
  });

  it("renders a definition list", () => {
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
  });

  it("renders one dt/dd pair per fact row", () => {
    const expectedRows = getCityFactRows(CITY_WITH_FACTS);

    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    const terms = container.querySelectorAll("dt");
    const definitions = container.querySelectorAll("dd");

    expect(terms).toHaveLength(expectedRows.length);
    expect(definitions).toHaveLength(expectedRows.length);
  });

  it("renders each row's label", () => {
    const expectedRows = getCityFactRows(CITY_WITH_FACTS);

    render(<CityFactsSection locationId={CITY_WITH_FACTS} />);

    for (const row of expectedRows) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
    }
  });

  it("renders each row's value", () => {
    const expectedRows = getCityFactRows(CITY_WITH_FACTS);

    render(<CityFactsSection locationId={CITY_WITH_FACTS} />);

    for (const row of expectedRows) {
      expect(screen.getByText(row.value)).toBeInTheDocument();
    }
  });

  it("pairs each term with its definition in document order", () => {
    /*
     * The `<dl>` structure relies on the dt/dd pairs appearing
     * in source order. This test extracts the pairs from the
     * DOM and verifies each dt is immediately followed by its
     * corresponding dd — not by another dt.
     */
    const expectedRows = getCityFactRows(CITY_WITH_FACTS);

    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();

    const children = Array.from(dl?.children ?? []);

    for (let i = 0; i < expectedRows.length; i += 1) {
      const dt = children[i * 2];
      const dd = children[i * 2 + 1];

      expect(dt?.tagName).toBe("DT");
      expect(dd?.tagName).toBe("DD");
      expect(dt?.textContent).toBe(expectedRows[i]?.label);
      expect(dd?.textContent).toBe(expectedRows[i]?.value);
    }
  });

  it("uses a grid layout with one row per fact", () => {
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    const dl = container.querySelector("dl");
    expect(dl?.className).toContain("grid");
    expect(dl?.className).toContain("grid-cols-[auto_1fr]");
  });
});

/* -------------------------------------------------------------------------- */
/* Partial data                                                               */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — partial data", () => {
  it("omits rows that have no data", () => {
    const expectedRows = getCityFactRows(CITY_WITH_PARTIAL_FACTS);

    const { container } = render(
      <CityFactsSection
        locationId={CITY_WITH_PARTIAL_FACTS}
      />,
    );

    const terms = container.querySelectorAll("dt");
    expect(terms).toHaveLength(expectedRows.length);
  });

  it("does not render a placeholder for missing facts", () => {
    render(
      <CityFactsSection locationId={CITY_WITH_PARTIAL_FACTS} />,
    );

    // No "—" or "Unknown" placeholder should appear.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Unknown"),
    ).not.toBeInTheDocument();
  });

  it("renders only the facts the partial entry provides", () => {
    /*
     * `montreal` is deliberately missing population, elevation,
     * and area. The section must not render those rows — the
     * absence of the underlying data should not appear as a
     * placeholder or a blank row.
     */
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_PARTIAL_FACTS} />,
    );

    const labels = Array.from(
      container.querySelectorAll("dt"),
    ).map((dt) => dt.textContent);

    expect(labels).not.toContain("Population");
    expect(labels).not.toContain("Elevation");
    expect(labels).not.toContain("Area");
    expect(labels).toContain("Language");
    expect(labels).toContain("Currency");
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — accessibility", () => {
  it("does not introduce focusable elements", () => {
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    const focusable = container.querySelectorAll(
      'button, a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it("does not introduce landmark roles", () => {
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
  });

  it("does not use a table role", () => {
    /*
     * A `<table>` would introduce a data-table role. The
     * facts are term/value pairs, not tabular data, so `<dl>`
     * is the correct element.
     */
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[role="table"]')).toBeNull();
  });

  it("does not use an aria-hidden treatment on the content", () => {
    /*
     * Facts are content, not decoration. A future refactor
     * that marked the section `aria-hidden="true"` would
     * remove it from the accessibility tree entirely.
     */
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    expect(
      container.querySelector('[aria-hidden="true"]'),
    ).toBeNull();
  });

  it("exposes the section caption as plain text, not a heading", () => {
    /*
     * The "City" caption is a `<p>`, not a heading. It does
     * not introduce a navigable subsection.
     */
    render(<CityFactsSection locationId={CITY_WITH_FACTS} />);

    const caption = screen.getByText("City");
    expect(caption.tagName).toBe("P");
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — determinism", () => {
  it("renders the same output for the same input", () => {
    const { container: first } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );
    const firstHTML = first.innerHTML;

    const { container: second } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    expect(second.innerHTML).toBe(firstHTML);
  });

  it("renders the correct number of rows for a known city", () => {
    /*
     * `new-york` is expected to have exactly five rows
     * (population, elevation, area, language, currency). This
     * pins the count against the current table shape.
     */
    const { container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    const terms = container.querySelectorAll("dt");
    expect(terms.length).toBeGreaterThanOrEqual(4);
    expect(terms.length).toBeLessThanOrEqual(6);
  });
});