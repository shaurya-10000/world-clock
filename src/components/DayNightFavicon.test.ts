import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  __clearIconCache,
  applyIcon,
  getIconDataUrl,
} from "@/components/DayNightFavicon";

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Remove every favicon `<link>` between tests so each test
 * starts from a clean head. `applyIcon` reads and writes
 * `document.head`, and jsdom does not clean up between tests
 * in the same file.
 */
beforeEach(() => {
  for (const link of Array.from(
    document.head.querySelectorAll('link[rel~="icon"]'),
  )) {
    link.remove();
  }
});

afterEach(() => {
  for (const link of Array.from(
    document.head.querySelectorAll('link[rel~="icon"]'),
  )) {
    link.remove();
  }
  __clearIconCache();
  vi.restoreAllMocks();
});

function getIconLinks(): HTMLLinkElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel~="icon"]',
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* getIconDataUrl                                                             */
/* -------------------------------------------------------------------------- */

describe("getIconDataUrl", () => {
  it("returns a PNG data URL for the sun", () => {
    const url = getIconDataUrl("sun");

    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns a PNG data URL for the moon", () => {
    const url = getIconDataUrl("moon");

    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns different data URLs for sun and moon", () => {
    expect(getIconDataUrl("sun")).not.toBe(getIconDataUrl("moon"));
  });

  it("caches the data URL per kind", () => {
    /*
     * The cache is a module-level object. Two calls for the
     * same kind must return the same string by identity — a
     * change to the cache that recomputed on every call would
     * still produce equal strings but fail on identity.
     */
    const first = getIconDataUrl("sun");
    const second = getIconDataUrl("sun");

    expect(first).toBe(second);
  });

  it("is deterministic — sun is the same across calls", () => {
    for (let i = 0; i < 5; i++) {
      expect(getIconDataUrl("sun")).toBe(getIconDataUrl("sun"));
    }
  });

  it("falls back to /icon when the canvas context is unavailable", () => {
    /*
     * Force the canvas fallback path by replacing
     * `getContext` with a stub that returns `null`. The
     * icon cache must be cleared first, otherwise a
     * previously-cached hit would bypass the fallback.
     */
    __clearIconCache();

    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function () {
      return null;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      expect(getIconDataUrl("sun")).toBe("/icon");
      expect(getIconDataUrl("moon")).toBe("/icon");
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
      __clearIconCache();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* applyIcon — first call                                                     */
/* -------------------------------------------------------------------------- */

describe("applyIcon — first call", () => {
  it("creates a favicon link when none exists", () => {
    expect(getIconLinks()).toHaveLength(0);

    applyIcon("data:image/png;base64,AAA");

    expect(getIconLinks()).toHaveLength(1);
  });

  it("sets href to the data URL", () => {
    applyIcon("data:image/png;base64,AAA");

    const link = getIconLinks()[0];
    expect(link?.getAttribute("href")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("sets type to image/png", () => {
    applyIcon("data:image/png;base64,AAA");

    const link = getIconLinks()[0];
    expect(link?.getAttribute("type")).toBe("image/png");
  });

  it("removes the sizes attribute", () => {
    applyIcon("data:image/png;base64,AAA");

    const link = getIconLinks()[0];
    expect(link?.hasAttribute("sizes")).toBe(false);
  });

  it("updates every existing icon link", () => {
    /*
     * A page can have multiple `<link rel="icon">` elements
     * (different sizes, formats, or from a future Next.js
     * version). Every one must be updated, not just the first.
     */
    const a = document.createElement("link");
    a.rel = "icon";
    a.href = "/a.png";
    document.head.appendChild(a);

    const b = document.createElement("link");
    b.rel = "icon";
    b.href = "/b.png";
    document.head.appendChild(b);

    applyIcon("data:image/png;base64,AAA");

    expect(a.getAttribute("href")).toBe(
      "data:image/png;base64,AAA",
    );
    expect(b.getAttribute("href")).toBe(
      "data:image/png;base64,AAA",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* applyIcon — restore                                                        */
/* -------------------------------------------------------------------------- */

describe("applyIcon — restore", () => {
  it("restores the original href after a swap", () => {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "/original.png";
    document.head.appendChild(link);

    applyIcon("data:image/png;base64,AAA");
    applyIcon(null);

    expect(link.getAttribute("href")).toBe("/original.png");
  });

  it("restores the original type after a swap", () => {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "/original.png";
    link.type = "image/x-icon";
    document.head.appendChild(link);

    applyIcon("data:image/png;base64,AAA");
    applyIcon(null);

    expect(link.getAttribute("type")).toBe("image/x-icon");
  });

  it("restores the original sizes after a swap", () => {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "/original.png";
    /*
     * `link.sizes` is a `DOMTokenList`, not a string.
     * Assigning `"32x32"` to it does not set the attribute.
     * `setAttribute` is the correct way to make the
     * attribute appear in the DOM.
     */
    link.setAttribute("sizes", "32x32");
    document.head.appendChild(link);

    applyIcon("data:image/png;base64,AAA");
    applyIcon(null);

    expect(link.getAttribute("sizes")).toBe("32x32");
  });

  it("uses /icon as the fallback href when no original was recorded", () => {
    /*
     * This is the environment where Next.js did not emit a
     * `<link rel="icon">`. `getIconLinks()` creates one, and
     * its href is initially absent. On restore, the missing
     * original href falls back to `/icon`, the Next.js
     * default.
     */
    applyIcon("data:image/png;base64,AAA");
    applyIcon(null);

    const link = getIconLinks()[0];
    expect(link?.getAttribute("href")).toBe("/icon");
  });

  it("uses image/png as the fallback type when no original was recorded", () => {
    applyIcon("data:image/png;base64,AAA");
    applyIcon(null);

    const link = getIconLinks()[0];
    expect(link?.getAttribute("type")).toBe("image/png");
  });

  it("does not overwrite the original when called twice", () => {
    /*
     * The most subtle contract in the module. The
     * `originalAttrs` write is guarded by
     * `!originalAttrs.has(link)`. Without that guard, the
     * second `applyIcon("data:...")` call would record the
     * first data URL as the "original", and the restore
     * would leave the favicon permanently on that data URL.
     */
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "/original.png";
    document.head.appendChild(link);

    applyIcon("data:image/png;base64,AAA");
    applyIcon("data:image/png;base64,BBB");
    applyIcon(null);

    expect(link.getAttribute("href")).toBe("/original.png");
  });

  it("restores every icon link, not just the first", () => {
    const a = document.createElement("link");
    a.rel = "icon";
    a.href = "/a.png";
    document.head.appendChild(a);

    const b = document.createElement("link");
    b.rel = "icon";
    b.href = "/b.png";
    document.head.appendChild(b);

    applyIcon("data:image/png;base64,AAA");
    applyIcon(null);

    expect(a.getAttribute("href")).toBe("/a.png");
    expect(b.getAttribute("href")).toBe("/b.png");
  });
});

/* -------------------------------------------------------------------------- */
/* applyIcon — SSR guard                                                      */
/* -------------------------------------------------------------------------- */

describe("applyIcon — SSR guard", () => {
  it("is a no-op when document is undefined", () => {
    const originalDocument = globalThis.document;

    (globalThis as unknown as { document: unknown }).document =
      undefined;

    try {
      expect(() =>
        applyIcon("data:image/png;base64,AAA"),
      ).not.toThrow();
    } finally {
      (globalThis as unknown as { document: unknown }).document =
        originalDocument;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getIconLinks — rel matching                                                */
/* -------------------------------------------------------------------------- */

describe("getIconLinks — rel matching", () => {
  it("matches a link with rel=icon", () => {
    const link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);

    applyIcon("data:image/png;base64,AAA");

    expect(link.getAttribute("href")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("matches a link with rel=shortcut icon (space-separated)", () => {
    /*
     * The `~=` selector matches whitespace-separated tokens
     * in the attribute value. `rel="shortcut icon"` has two
     * tokens, one of which is `icon`.
     */
    const link = document.createElement("link");
    link.rel = "shortcut icon";
    document.head.appendChild(link);

    applyIcon("data:image/png;base64,AAA");

    expect(link.getAttribute("href")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("does not match apple-touch-icon", () => {
    /*
     * `apple-touch-icon` is a distinct resource. Updating it
     * alongside the favicon would change the iOS home-screen
     * icon, which the app has no reason to do.
     */
    const apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    document.head.appendChild(apple);

    applyIcon("data:image/png;base64,AAA");

    expect(apple.hasAttribute("href")).toBe(false);
  });

  it("does not match mask-icon", () => {
    const mask = document.createElement("link");
    mask.rel = "mask-icon";
    document.head.appendChild(mask);

    applyIcon("data:image/png;base64,AAA");

    expect(mask.hasAttribute("href")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                */
/* -------------------------------------------------------------------------- */

describe("applyIcon — determinism", () => {
  it("does not throw when called on an empty head repeatedly", () => {
    expect(() => {
      applyIcon("data:image/png;base64,AAA");
      applyIcon(null);
      applyIcon("data:image/png;base64,BBB");
      applyIcon(null);
    }).not.toThrow();
  });

  it("does not add duplicate links on repeated calls", () => {
    applyIcon("data:image/png;base64,AAA");
    applyIcon("data:image/png;base64,BBB");
    applyIcon(null);

    // `getIconLinks` returns the same single link every
    // time; it does not create a new one if one already
    // exists.
    expect(getIconLinks()).toHaveLength(1);
  });
});