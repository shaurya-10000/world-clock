import { describe, expect, it } from "vitest";

import { buildMapsUrl } from "@/components/globe/CityArrivalCard";
import type { WorldLocation } from "@/lib/locations";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function location(
  overrides: Partial<WorldLocation> = {},
): WorldLocation {
  return {
    id: "test",
    city: "Test City",
    country: "Test Country",
    timezone: "UTC",
    latitude: 0,
    longitude: 0,
    continent: "north-america",
    globeTiers: ["main"],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* buildMapsUrl                                                               */
/* -------------------------------------------------------------------------- */

describe("buildMapsUrl", () => {
  it("returns a Google Maps URL", () => {
    const url = buildMapsUrl(location());

    expect(url.startsWith("https://www.google.com/maps")).toBe(
      true,
    );
  });

  it("uses the ?q=lat,lng form, not the /maps/@ form", () => {
    /*
     * The `/maps/@lat,lng,zoom` form centers the map with no
     * marker. The `?q=` form drops a pin. The user clicking
     * "Open in Google Maps" expects to see the location
     * highlighted, so the `q` form is correct.
     */
    const url = buildMapsUrl(location());

    expect(url).toContain("?q=");
    expect(url).not.toContain("/maps/@");
  });

  it("uses raw coordinates, not a city-name query", () => {
    /*
     * A city name is ambiguous ("Springfield" resolves to 20+
     * US cities). Coordinates correspond to exactly one point
     * on Earth.
     */
    const url = buildMapsUrl(
      location({
        city: "Springfield",
        latitude: 37.2089,
        longitude: -93.2923,
      }),
    );

    expect(url).toContain("37.2089");
    expect(url).toContain("-93.2923");
    expect(url).not.toContain("Springfield");
  });

  it("formats the coordinates as `lat,lng` with no space", () => {
    const url = buildMapsUrl(
      location({ latitude: 40.7128, longitude: -74.006 }),
    );

    expect(url).toContain("?q=40.7128,-74.006");
  });

  it("preserves positive latitudes", () => {
    const url = buildMapsUrl(
      location({ latitude: 51.5074, longitude: -0.1278 }),
    );

    expect(url).toContain("51.5074");
  });

  it("preserves negative latitudes", () => {
    const url = buildMapsUrl(
      location({ latitude: -33.8688, longitude: 151.2093 }),
    );

    expect(url).toContain("-33.8688");
  });

  it("preserves positive longitudes", () => {
    const url = buildMapsUrl(
      location({ latitude: 35.6762, longitude: 139.6503 }),
    );

    expect(url).toContain("139.6503");
  });

  it("preserves negative longitudes", () => {
    const url = buildMapsUrl(
      location({ latitude: 40.7128, longitude: -74.006 }),
    );

    expect(url).toContain("-74.006");
  });

  it("handles the equator and prime meridian", () => {
    const url = buildMapsUrl(
      location({ latitude: 0, longitude: 0 }),
    );

    expect(url).toBe(
      "https://www.google.com/maps?q=0,0",
    );
  });

  it("handles extreme coordinates", () => {
    const north = buildMapsUrl(
      location({ latitude: 90, longitude: 0 }),
    );
    const south = buildMapsUrl(
      location({ latitude: -90, longitude: 0 }),
    );
    const east = buildMapsUrl(
      location({ latitude: 0, longitude: 180 }),
    );
    const west = buildMapsUrl(
      location({ latitude: 0, longitude: -180 }),
    );

    expect(north).toContain("90");
    expect(south).toContain("-90");
    expect(east).toContain("180");
    expect(west).toContain("-180");
  });

  it("does not encode the comma", () => {
    /*
     * The comma is the separator between latitude and
     * longitude. If it were URL-encoded to `%2C`, Google Maps
     * would not parse the query as two coordinates.
     */
    const url = buildMapsUrl(
      location({ latitude: 1, longitude: 2 }),
    );

    expect(url).toContain(",");
    expect(url).not.toContain("%2C");
  });

  it("is deterministic — same input, same output", () => {
    const loc = location({ latitude: 1.234, longitude: 5.678 });

    expect(buildMapsUrl(loc)).toBe(buildMapsUrl(loc));
  });

  it("is a pure function — does not mutate the location", () => {
    const loc = location({ latitude: 1.234, longitude: 5.678 });
    const snapshot = { ...loc };

    buildMapsUrl(loc);

    expect(loc).toEqual(snapshot);
  });
});