import { describe, expect, it } from "vitest";

import {
  alt,
  contentType,
  default as OpenGraphImage,
  size,
} from "@/app/opengraph-image";

/* -------------------------------------------------------------------------- */
/* Route metadata                                                             */
/* -------------------------------------------------------------------------- */

describe("opengraph-image — route metadata", () => {
  it("declares the standard Open Graph dimensions", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("declares width and height as numbers, not strings", () => {
    /*
     * `next/og` accepts both, but the numeric form avoids a
     * silent string coercion inside satori and keeps the
     * exported shape predictable for consumers.
     */
    expect(typeof size.width).toBe("number");
    expect(typeof size.height).toBe("number");
  });

  it("declares a PNG content type", () => {
    expect(contentType).toBe("image/png");
  });

  it("declares non-empty alt text", () => {
    expect(typeof alt).toBe("string");
    expect(alt.length).toBeGreaterThan(0);
  });

  it("mentions the brand in the alt text", () => {
    expect(alt).toMatch(/world clock/i);
  });

  it("declares all three exports as const values", () => {
    /*
     * A missing export would make Next.js fall back to the
     * default 1200×630 / no-alt behavior silently. This test
     * fails loudly if any of them is ever renamed.
     */
    expect(size).toBeDefined();
    expect(contentType).toBeDefined();
    expect(alt).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Component shape                                                            */
/* -------------------------------------------------------------------------- */

describe("opengraph-image — component shape", () => {
  it("exports a function as the default", () => {
    expect(typeof OpenGraphImage).toBe("function");
  });

  it("accepts no arguments", () => {
    expect(OpenGraphImage.length).toBe(0);
  });
});