import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

/* -------------------------------------------------------------------------- */
/* Top-level shape                                                            */
/* -------------------------------------------------------------------------- */

describe("manifest — top-level shape", () => {
  it("returns an object", () => {
    const result = manifest();
    expect(result).toBeTypeOf("object");
    expect(result).not.toBeNull();
  });

  it("is a pure function — two calls return equivalent objects", () => {
    expect(manifest()).toEqual(manifest());
  });

  it("returns a fresh object on each call", () => {
    /*
     * Next.js may call this more than once during a build. A
     * shared mutable object would let one call's mutations
     * leak into the next.
     */
    expect(manifest()).not.toBe(manifest());
  });

  it("returns a fresh icons array on each call", () => {
    /*
     * Stronger than the object-identity check: even if the
     * outer object is new, a shared inner array would still
     * let callers mutate the module's state. This is the
     * invariant that actually matters.
     */
    const first = manifest();
    const second = manifest();
    expect(first.icons).not.toBe(second.icons);
  });
});

/* -------------------------------------------------------------------------- */
/* Identity fields                                                            */
/* -------------------------------------------------------------------------- */

describe("manifest — identity", () => {
  it("has a name", () => {
    const m = manifest();
    expect(typeof m.name).toBe("string");
    expect(m.name?.length).toBeGreaterThan(0);
  });

  it("has a short_name that is no longer than name", () => {
    const m = manifest();
    expect(typeof m.short_name).toBe("string");
    expect(m.short_name?.length).toBeGreaterThan(0);
    expect((m.short_name ?? "").length).toBeLessThanOrEqual(
      (m.name ?? "").length,
    );
  });

  it("has a non-empty description", () => {
    const m = manifest();
    expect(typeof m.description).toBe("string");
    expect(m.description?.length).toBeGreaterThan(0);
  });

  it("declares the app language as a valid BCP-47 tag", () => {
    const m = manifest();
    expect(typeof m.lang).toBe("string");
    expect(m.lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
  });

  it("declares the app language as 'en'", () => {
    /*
     * The UI is English-only today. If the app is ever
     * localised, this test is the one that should fail and
     * prompt a decision — not a silent change.
     */
    expect(manifest().lang).toBe("en");
  });
});

/* -------------------------------------------------------------------------- */
/* Launch behavior                                                            */
/* -------------------------------------------------------------------------- */

describe("manifest — launch behavior", () => {
  it("starts at the root URL", () => {
    expect(manifest().start_url).toBe("/");
  });

  it("start_url is a path, not a full URL", () => {
    /*
     * A full URL here would break when the app is deployed
     * under a different origin. The manifest spec allows
     * either, but a path is the correct choice for an app
     * that may be self-hosted.
     */
    const startUrl = manifest().start_url;
    expect(startUrl).not.toMatch(/^https?:\/\//);
  });

  it("uses standalone display mode", () => {
    expect(manifest().display).toBe("standalone");
  });

  it("display is one of the valid manifest values", () => {
    const display = manifest().display;
    const valid = [
      "fullscreen",
      "standalone",
      "minimal-ui",
      "browser",
    ];
    expect(valid).toContain(display);
  });

  it("does not lock orientation", () => {
    expect(manifest().orientation).toBe("any");
  });
});

/* -------------------------------------------------------------------------- */
/* Theme colors                                                               */
/* -------------------------------------------------------------------------- */

describe("manifest — theme colors", () => {
  it("background_color and theme_color match", () => {
    const m = manifest();
    expect(m.background_color).toBe(m.theme_color);
  });

  it("uses a valid hex color for both", () => {
    const m = manifest();
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("uses the same background as the favicon and Apple icon", () => {
    expect(manifest().background_color).toBe("#05070a");
  });
});

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

describe("manifest — icons", () => {
  it("declares at least one icon", () => {
    const m = manifest();
    expect(Array.isArray(m.icons)).toBe(true);
    expect((m.icons ?? []).length).toBeGreaterThan(0);
  });

  it("every icon has src, sizes, and type", () => {
    for (const icon of manifest().icons ?? []) {
      expect(typeof icon.src).toBe("string");
      expect(icon.src.length).toBeGreaterThan(0);

      if (typeof icon.sizes !== "string") {
        throw new Error(`icon ${icon.src} is missing sizes`);
      }
      expect(icon.sizes.length).toBeGreaterThan(0);

      if (typeof icon.type !== "string") {
        throw new Error(`icon ${icon.src} is missing type`);
      }
      expect(icon.type.length).toBeGreaterThan(0);
    }
  });

  it("every icon src is absolute (starts with /)", () => {
    for (const icon of manifest().icons ?? []) {
      expect(icon.src.startsWith("/")).toBe(true);
    }
  });

  it("every icon sizes is in WxH format", () => {
    for (const icon of manifest().icons ?? []) {
      if (typeof icon.sizes !== "string") {
        throw new Error(`icon ${icon.src} is missing sizes`);
      }
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
    }
  });

  it("declares a 32x32 icon at /icon", () => {
    const icon = (manifest().icons ?? []).find(
      (i) => i.sizes === "32x32",
    );
    expect(icon).toBeDefined();
    expect(icon?.src).toBe("/icon");
  });

  it("declares a 180x180 icon at /apple-icon", () => {
    const icon = (manifest().icons ?? []).find(
      (i) => i.sizes === "180x180",
    );
    expect(icon).toBeDefined();
    expect(icon?.src).toBe("/apple-icon");
  });

  it("does not declare duplicate src values", () => {
    const srcs = (manifest().icons ?? []).map((i) => i.src);
    expect(new Set(srcs).size).toBe(srcs.length);
  });

  it("does not declare duplicate sizes values", () => {
    /*
     * Two entries with the same `sizes` and different `src`
     * would make the browser's choice nondeterministic.
     */
    const sizes = (manifest().icons ?? []).map((i) => i.sizes);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("every icon src resolves to a file-based route in app/", () => {
    /*
     * The manifest's `src` values are not arbitrary paths —
     * they are Next.js file-convention routes. `/icon` is
     * served by `app/icon.tsx`, `/apple-icon` by
     * `app/apple-icon.tsx`. A typo here would produce a
     * manifest that validates but 404s on the icons.
     */
    const knownRoutes = new Set(["/icon", "/apple-icon"]);
    for (const icon of manifest().icons ?? []) {
      expect(knownRoutes.has(icon.src)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

describe("manifest — categories", () => {
  it("declares at least one category", () => {
    const m = manifest();
    expect(Array.isArray(m.categories)).toBe(true);
    expect((m.categories ?? []).length).toBeGreaterThan(0);
  });

  it("categories are lowercase ASCII identifiers", () => {
    for (const category of manifest().categories ?? []) {
      expect(category).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("categories do not contain duplicates", () => {
    const categories = manifest().categories ?? [];
    expect(new Set(categories).size).toBe(categories.length);
  });
});