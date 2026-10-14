import { describe, expect, it } from "vitest";

import OpenGraphImage, {
  contentType,
  size,
} from "@/app/opengraph-image";

/* -------------------------------------------------------------------------- */
/* Invocation                                                                 */
/* -------------------------------------------------------------------------- */

describe("opengraph-image — invocation", () => {
  it("does not throw when invoked", () => {
    expect(() => OpenGraphImage()).not.toThrow();
  });

  it("returns a Response instance", () => {
    const response = OpenGraphImage();

    /*
     * `ImageResponse` extends the standard `Response` in the
     * Node 18+ runtime, so `instanceof Response` is the
     * strongest shape assertion available without reaching
     * into satori internals.
     */
    expect(response).toBeInstanceOf(Response);
  });

  it("returns a Response with an ok status", () => {
    const response = OpenGraphImage();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Response headers                                                           */
/* -------------------------------------------------------------------------- */

describe("opengraph-image — response headers", () => {
  it("sets the Content-Type to PNG", () => {
    const response = OpenGraphImage();

    expect(response.headers.get("content-type")).toBe(
      contentType,
    );
  });

  it("sets a Content-Type of image/png", () => {
    const response = OpenGraphImage();

    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

/* -------------------------------------------------------------------------- */
/* Response body                                                              */
/* -------------------------------------------------------------------------- */

describe("opengraph-image — response body", () => {
  it("returns a non-empty body", async () => {
    const response = OpenGraphImage();
    const buffer = await response.arrayBuffer();

    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("starts with the PNG magic bytes", async () => {
    /*
     * Every PNG begins with the 8-byte signature:
     *   89 50 4E 47 0D 0A 1A 0A
     * If the response body does not start with these bytes,
     * something is wrong with the pipeline — either satori
     * produced SVG and resvg failed, or the wrong encoder
     * is wired up.
     */
    const response = OpenGraphImage();
    const buffer = new Uint8Array(await response.arrayBuffer());

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

  it("encodes the declared width and height in the PNG header", async () => {
    /*
     * The PNG IHDR chunk starts at byte 16: four ASCII bytes
     * ("IHDR"), then a big-endian uint32 width, then a
     * big-endian uint32 height. Reading them back proves that
     * the `size` export actually reached the encoder, rather
     * than the encoder falling back to a default.
     */
    const response = OpenGraphImage();
    const buffer = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(buffer.buffer);

    /* "IHDR" at bytes 12–15. */
    expect(String.fromCharCode(...buffer.slice(12, 16))).toBe(
      "IHDR",
    );

    const width = view.getUint32(16);
    const height = view.getUint32(20);

    expect(width).toBe(size.width);
    expect(height).toBe(size.height);
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("opengraph-image — determinism", () => {
  it("produces the same byte length on two invocations", async () => {
    /*
     * The card has no timestamps and no randomness, so two
     * renders should be byte-identical in length. If this
     * ever flakes, something non-deterministic crept into
     * the JSX.
     */
    const first = new Uint8Array(
      await OpenGraphImage().arrayBuffer(),
    );
    const second = new Uint8Array(
      await OpenGraphImage().arrayBuffer(),
    );

    expect(first.byteLength).toBe(second.byteLength);
  });
});