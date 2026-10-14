import { describe, expect, it } from "vitest";

import AppleIcon, {
  contentType,
  size,
} from "@/app/apple-icon";

/* -------------------------------------------------------------------------- */
/* Invocation                                                                 */
/* -------------------------------------------------------------------------- */

describe("apple-icon — invocation", () => {
  it("does not throw when invoked", () => {
    expect(() => AppleIcon()).not.toThrow();
  });

  it("returns a Response instance", () => {
    expect(AppleIcon()).toBeInstanceOf(Response);
  });

  it("returns a Response with an ok status", () => {
    const response = AppleIcon();
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Response headers                                                           */
/* -------------------------------------------------------------------------- */

describe("apple-icon — response headers", () => {
  it("sets the Content-Type to the exported value", () => {
    expect(AppleIcon().headers.get("content-type")).toBe(
      contentType,
    );
  });

  it("sets a Content-Type of image/png", () => {
    expect(AppleIcon().headers.get("content-type")).toBe(
      "image/png",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Response body                                                              */
/* -------------------------------------------------------------------------- */

describe("apple-icon — response body", () => {
  it("returns a non-empty body", async () => {
    const buffer = await AppleIcon().arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("starts with the PNG magic bytes", async () => {
    const buffer = new Uint8Array(
      await AppleIcon().arrayBuffer(),
    );

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
    const buffer = new Uint8Array(
      await AppleIcon().arrayBuffer(),
    );
    const view = new DataView(buffer.buffer);

    expect(String.fromCharCode(...buffer.slice(12, 16))).toBe(
      "IHDR",
    );

    expect(view.getUint32(16)).toBe(size.width);
    expect(view.getUint32(20)).toBe(size.height);
  });

  it("produces a body consistent with an opaque 180×180 PNG", async () => {
    /*
     * A fully transparent PNG compresses to a much smaller
     * payload than one with a filled background. The exact
     * threshold is not stable across resvg versions, so this
     * asserts a lower bound that any filled 180×180 PNG would
     * exceed. If the background is ever removed, the payload
     * shrinks dramatically and this test fails.
     */
    const buffer = await AppleIcon().arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(200);
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("apple-icon — determinism", () => {
  it("produces the same byte length on two invocations", async () => {
    const first = new Uint8Array(
      await AppleIcon().arrayBuffer(),
    );
    const second = new Uint8Array(
      await AppleIcon().arrayBuffer(),
    );

    expect(first.byteLength).toBe(second.byteLength);
  });
});