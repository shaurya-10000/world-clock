import { describe, expect, it } from "vitest";

import Icon, {
  contentType,
  size,
} from "@/app/icon";

/* -------------------------------------------------------------------------- */
/* Invocation                                                                 */
/* -------------------------------------------------------------------------- */

describe("icon — invocation", () => {
  it("does not throw when invoked", () => {
    expect(() => Icon()).not.toThrow();
  });

  it("returns a Response instance", () => {
    /*
     * `ImageResponse` extends the standard `Response` in the
     * Node runtime. `instanceof` is used here rather than a
     * shape check because `Response` is not swapped by
     * happy-dom the way `URL` is — it comes from Node's
     * undici, which both the source and the test share.
     */
    expect(Icon()).toBeInstanceOf(Response);
  });

  it("returns a Response with an ok status", () => {
    const response = Icon();
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Response headers                                                           */
/* -------------------------------------------------------------------------- */

describe("icon — response headers", () => {
  it("sets the Content-Type to the exported value", () => {
    const response = Icon();
    expect(response.headers.get("content-type")).toBe(
      contentType,
    );
  });

  it("sets a Content-Type of image/png", () => {
    expect(Icon().headers.get("content-type")).toBe("image/png");
  });
});

/* -------------------------------------------------------------------------- */
/* Response body                                                              */
/* -------------------------------------------------------------------------- */

describe("icon — response body", () => {
  it("returns a non-empty body", async () => {
    const buffer = await Icon().arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("starts with the PNG magic bytes", async () => {
    /*
     * Every PNG begins with:
     *   89 50 4E 47 0D 0A 1A 0A
     * If the response body does not start with these bytes,
     * satori or resvg failed and the route is serving an
     * error page or empty buffer under the image content
     * type.
     */
    const buffer = new Uint8Array(await Icon().arrayBuffer());

    expect(buffer.length).toBeGreaterThanOrEqual(8);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
    expect(buffer[4]).toBe(0x0d);
    expect(buffer[5]).toBe(0x0a);
    expect(buffer[6]).toBe(0x1a);
    expect(buffer[7]).toBe(0x0a);
  });

  it("encodes the declared size in the PNG header", async () => {
    /*
     * The IHDR chunk starts at byte 16 with a big-endian
     * uint32 width and uint32 height. Reading them back
     * proves the exported `size` reached the encoder rather
     * than the encoder falling back to a default.
     */
    const buffer = new Uint8Array(await Icon().arrayBuffer());
    const view = new DataView(buffer.buffer);

    expect(String.fromCharCode(...buffer.slice(12, 16))).toBe(
      "IHDR",
    );

    expect(view.getUint32(16)).toBe(size.width);
    expect(view.getUint32(20)).toBe(size.height);
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("icon — determinism", () => {
  it("produces the same byte length on two invocations", async () => {
    const first = new Uint8Array(await Icon().arrayBuffer());
    const second = new Uint8Array(await Icon().arrayBuffer());

    expect(first.byteLength).toBe(second.byteLength);
  });
});