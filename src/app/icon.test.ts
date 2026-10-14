import { describe, expect, it } from "vitest";

import Icon, {
  contentType,
  size,
} from "@/app/icon";

/* -------------------------------------------------------------------------- */
/* Route metadata                                                             */
/* -------------------------------------------------------------------------- */

describe("icon — route metadata", () => {
  it("declares a 32×32 canvas", () => {
    /*
     * The manifest references `/icon` as `32x32`. If this
     * size ever changes, the manifest lies and the browser
     * requests an icon of the wrong dimensions.
     */
    expect(size).toEqual({ width: 32, height: 32 });
  });

  it("declares width and height as numbers, not strings", () => {
    expect(typeof size.width).toBe("number");
    expect(typeof size.height).toBe("number");
  });

  it("declares a PNG content type", () => {
    expect(contentType).toBe("image/png");
  });

  it("exports a function as the default", () => {
    expect(typeof Icon).toBe("function");
  });

  it("accepts no arguments", () => {
    expect(Icon.length).toBe(0);
  });
});