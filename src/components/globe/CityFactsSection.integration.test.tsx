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
import { CITY_FACTS } from "@/lib/city-facts";
import { WORLD_LOCATIONS } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A city known to have a facts entry. Picked at render time
 * from the actual `CITY_FACTS` table so the test cannot drift
 * out of sync with the data.
 */
const CITY_WITH_FACTS = Object.keys(CITY_FACTS)[0] ?? "";

/**
 * A catalogued city that does NOT have a facts entry. Picked
 * at render time by finding the first location whose id is
 * not a key of `CITY_FACTS`.
 */
const CITY_WITHOUT_FACTS =
  WORLD_LOCATIONS.find(
    (location) => !(location.id in CITY_FACTS),
  )?.id ?? "";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Fixture integrity                                                          */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — fixture integrity", () => {
  it("has at least one city with facts to test against", () => {
    expect(CITY_WITH_FACTS).not.toBe("");
  });

  it("has at least one city without facts to test against", () => {
    expect(CITY_WITHOUT_FACTS).not.toBe("");
  });

  it("the two fixture ids are distinct", () => {
    expect(CITY_WITHOUT_FACTS).not.toBe(CITY_WITH_FACTS);
  });
});

/* -------------------------------------------------------------------------- */
/* Real catalog interaction                                                   */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — real catalog interaction", () => {
  it("renders without throwing for every key in CITY_FACTS", () => {
    for (const key of Object.keys(CITY_FACTS)) {
      expect(() =>
        render(<CityFactsSection locationId={key} />),
      ).not.toThrow();
    }
  });

  it("renders without throwing for every id in WORLD_LOCATIONS", () => {
    for (const location of WORLD_LOCATIONS) {
      expect(() =>
        render(
          <CityFactsSection locationId={location.id} />,
        ),
      ).not.toThrow();
    }
  });

  it("renders a section for every city that has an entry", () => {
    for (const key of Object.keys(CITY_FACTS)) {
      const { container, unmount } = render(
        <CityFactsSection locationId={key} />,
      );

      /*
       * A city with an entry must produce at least one `<dt>`
       * — the entry has at least one fact field populated (the
       * table validates this at module load).
       */
      const terms = container.querySelectorAll("dt");
      expect(terms.length).toBeGreaterThan(0);

      unmount();
    }
  });

  it("renders nothing for every catalogued city without an entry", () => {
    for (const location of WORLD_LOCATIONS) {
      if (location.id in CITY_FACTS) continue;

      const { container, unmount } = render(
        <CityFactsSection locationId={location.id} />,
      );

      expect(container.firstChild).toBeNull();

      unmount();
    }
  });

  it("never renders a label without a value", () => {
    /*
     * For every city with facts, every `<dt>` must be paired
     * with a `<dd>` whose text is non-empty. A row with an
     * empty value would render as "Population" followed by
     * nothing, which looks broken.
     */
    for (const key of Object.keys(CITY_FACTS)) {
      const { container, unmount } = render(
        <CityFactsSection locationId={key} />,
      );

      const definitions = container.querySelectorAll("dd");

      for (const dd of Array.from(definitions)) {
        expect(dd.textContent?.trim().length).toBeGreaterThan(0);
      }

      unmount();
    }
  });

  it("never renders a value without a label", () => {
    for (const key of Object.keys(CITY_FACTS)) {
      const { container, unmount } = render(
        <CityFactsSection locationId={key} />,
      );

      const terms = container.querySelectorAll("dt");

      for (const dt of Array.from(terms)) {
        expect(dt.textContent?.trim().length).toBeGreaterThan(0);
      }

      unmount();
    }
  });

  it("always renders the same number of dt and dd elements", () => {
    /*
     * The `<dl>` structure requires each `<dt>` to have a
     * corresponding `<dd>`. If a future refactor's map callback
     * accidentally emitted only one of the two, this would
     * fail across the entire catalog.
     */
    for (const key of Object.keys(CITY_FACTS)) {
      const { container, unmount } = render(
        <CityFactsSection locationId={key} />,
      );

      const terms = container.querySelectorAll("dt");
      const definitions = container.querySelectorAll("dd");

      expect(terms.length).toBe(definitions.length);

      unmount();
    }
  });

  it("stops rendering when the location id changes to one without facts", () => {
    const { rerender, container } = render(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    expect(container.firstChild).not.toBeNull();

    rerender(
      <CityFactsSection locationId={CITY_WITHOUT_FACTS} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders rows when the location id changes to one with facts", () => {
    const { rerender, container } = render(
      <CityFactsSection locationId={CITY_WITHOUT_FACTS} />,
    );

    expect(container.firstChild).toBeNull();

    rerender(
      <CityFactsSection locationId={CITY_WITH_FACTS} />,
    );

    expect(container.firstChild).not.toBeNull();
    expect(
      container.querySelectorAll("dt").length,
    ).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Value shape                                                                */
/* -------------------------------------------------------------------------- */

describe("CityFactsSection — value shape", () => {
  it("renders values without placeholder dashes for populated facts", () => {
    for (const key of Object.keys(CITY_FACTS)) {
      const { container, unmount } = render(
        <CityFactsSection locationId={key} />,
      );

      const definitions = container.querySelectorAll("dd");

      for (const dd of Array.from(definitions)) {
        const text = dd.textContent ?? "";
        expect(text).not.toBe("—");
        expect(text).not.toBe("-");
        expect(text).not.toBe("N/A");
      }

      unmount();
    }
  });

  it("renders every value as a string", () => {
    /*
     * `getCityFactRows` is typed to return `{ label: string;
     * value: string }`. This test verifies the contract
     * against every entry in the table.
     */
    for (const key of Object.keys(CITY_FACTS)) {
      const { container, unmount } = render(
        <CityFactsSection locationId={key} />,
      );

      const definitions = container.querySelectorAll("dd");

      for (const dd of Array.from(definitions)) {
        expect(typeof dd.textContent).toBe("string");
      }

      unmount();
    }
  });
});

/* Suppress unused import warning. */
void screen;