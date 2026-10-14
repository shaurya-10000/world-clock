import { describe, expect, it } from "vitest";

import AppleIcon, {
  contentType,
  size,
} from "@/app/apple-icon";

/* -------------------------------------------------------------------------- */
/* Route metadata                                                             */
/* -------------------------------------------------------------------------- */

describe("apple-icon — route metadata", () => {
  it("declares a 180×180 canvas", () => {
    /*
     * 180×180 is the only size iOS reads for the home-screen
     * icon. If this changes, iOS will scale whatever it gets
     * and the sun will be softer than intended.
     */
    expect(size).toEqual({ width: 180, height: 180 });
  });

  it("declares width and height as numbers, not strings", () => {
    expect(typeof size.width).toBe("number");
    expect(typeof size.height).toBe("number");
  });

  it("declares a PNG content type", () => {
    /*
     * iOS does not accept SVG or WebP for the home-screen
     * icon. PNG is required.
     */
    expect(contentType).toBe("image/png");
  });

  it("exports a function as the default", () => {
    expect(typeof AppleIcon).toBe("function");
  });

  it("accepts no arguments", () => {
    expect(AppleIcon.length).toBe(0);
  });

  it("is square", () => {
    expect(size.width).toBe(size.height);
  });
});