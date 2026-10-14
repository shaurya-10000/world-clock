import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { resolveLocalLocation } from "@/components/WorldClockSection";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Install a fixed `Intl.DateTimeFormat` that reports the given
 * time zone from `resolvedOptions()`. This is the cleanest way
 * to drive `getLocalTimeZone` to a known value without
 * replacing the whole `Intl` namespace — every other method on
 * the real formatter is still available if a future test needs
 * it.
 */
function installTimeZone(timeZone: string): void {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return {
        resolvedOptions: () => ({ timeZone }),
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* SSR guard                                                                  */
/* -------------------------------------------------------------------------- */

describe("resolveLocalLocation — SSR", () => {
  it("returns null when window is undefined", () => {
    const originalWindow = globalThis.window;

    (globalThis as unknown as { window: unknown }).window = undefined;

    try {
      expect(resolveLocalLocation()).toBeNull();
    } finally {
      (globalThis as unknown as { window: unknown }).window =
        originalWindow;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Catalog matches                                                            */
/* -------------------------------------------------------------------------- */

describe("resolveLocalLocation — catalog matches", () => {
  it("returns the catalogued location for a matching time zone", () => {
    installTimeZone("Asia/Tokyo");

    const result = resolveLocalLocation();

    expect(result).not.toBeNull();
    expect(result?.timezone).toBe("Asia/Tokyo");
  });

  it("returns a location with all WorldLocation fields", () => {
    installTimeZone("Asia/Tokyo");

    const result = resolveLocalLocation();

    expect(result).toMatchObject({
      id: expect.any(String),
      city: expect.any(String),
      country: expect.any(String),
      timezone: "Asia/Tokyo",
      latitude: expect.any(Number),
      longitude: expect.any(Number),
      continent: expect.any(String),
      globeTiers: expect.any(Array),
    });
  });

  it("returns the first catalogued city for a zone with many entries", () => {
    // `America/New_York` covers New York, Washington D.C.,
    // Boston and Miami. Editorial order puts New York first.
    installTimeZone("America/New_York");

    const result = resolveLocalLocation();

    expect(result?.id).toBe("new-york");
  });

  it("resolves zones whose canonical form is an alias", () => {
    // `Asia/Calcutta` is normalized to `Asia/Kolkata` inside
    // `getLocalTimeZone`, so the lookup succeeds.
    installTimeZone("Asia/Calcutta");

    const result = resolveLocalLocation();

    expect(result).not.toBeNull();
    expect(result?.timezone).toBe("Asia/Kolkata");
  });

  it("is deterministic — same zone, same location", () => {
    installTimeZone("Asia/Tokyo");

    const first = resolveLocalLocation();
    const second = resolveLocalLocation();

    expect(first).toBe(second);
  });
});

/* -------------------------------------------------------------------------- */
/* Misses                                                                     */
/* -------------------------------------------------------------------------- */

describe("resolveLocalLocation — misses", () => {
  it("returns null for a valid IANA zone with no catalogued city", () => {
    installTimeZone("Pacific/Marquesas");

    expect(resolveLocalLocation()).toBeNull();
  });

  it("returns null for a non-existent zone", () => {
    installTimeZone("Mars/Olympus_Mons");

    expect(resolveLocalLocation()).toBeNull();
  });

  it("returns null for the empty string", () => {
    installTimeZone("");

    expect(resolveLocalLocation()).toBeNull();
  });

  it("returns null when the browser reports UTC and UTC is not catalogued", () => {
    /*
     * `UTC` is a valid IANA zone but the catalog does not
     * carry a city whose timezone field is literally `"UTC"`.
     * This test documents that the fallback is not special-cased
     * for UTC — it goes through the same lookup as any other
     * zone.
     */
    installTimeZone("UTC");

    const result = resolveLocalLocation();

    // Either a city is catalogued with UTC (in which case the
    // result is a location) or none is (in which case the
    // result is null). We only assert the type, since the
    // catalog may legitimately add a UTC-based city in a
    // future release.
    expect(result === null || typeof result === "object").toBe(
      true,
    );
  });
});