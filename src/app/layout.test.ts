import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
  JetBrains_Mono: () => ({ variable: "--font-jetbrains-mono" }),
  Fraunces: () => ({ variable: "--font-fraunces" }),
}));

import { metadata, viewport } from "@/app/layout";

/* -------------------------------------------------------------------------- */
/* metadataBase                                                               */
/* -------------------------------------------------------------------------- */

describe("metadata — metadataBase", () => {
  it("declares a metadataBase with a URL shape", () => {
    /*
     * Do not use `toBeInstanceOf(URL)`. Test environments
     * (happy-dom, jsdom) install their own `URL` global, and
     * the module under test may resolve `URL` from a
     * different realm. `instanceof` compares constructors
     * across realms and fails even when the value is
     * perfectly valid. Assert on the shape that Next.js
     * actually reads.
     */
    const url = metadata.metadataBase as {
      href?: string;
      origin?: string;
      protocol?: string;
    };

    expect(url).toBeDefined();
    expect(typeof url.href).toBe("string");
    expect(url.href).toMatch(/^https?:\/\//);
    expect(typeof url.origin).toBe("string");
    expect(typeof url.protocol).toBe("string");
  });

  it("falls back to localhost:3000 when NEXT_PUBLIC_SITE_URL is unset", () => {
    const url = metadata.metadataBase as URL;
    expect(url.hostname).toBe("localhost");
    expect(url.port).toBe("3000");
  });

  it("falls back to localhost:3000 when NEXT_PUBLIC_SITE_URL is empty", async () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "";

    try {
      vi.resetModules();
      const { metadata: m } = await import("@/app/layout");
      const url = m.metadataBase as URL;
      expect(url.hostname).toBe("localhost");
      expect(url.port).toBe("3000");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = original;
      vi.resetModules();
    }
  });

  it("falls back to localhost:3000 when NEXT_PUBLIC_SITE_URL is whitespace", async () => {
    /*
     * The source `.trim()`s the value before checking length.
     * A deployment system that exports `"   "` would
     * otherwise produce `new URL("   ")`, which throws.
     */
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "   ";

    try {
      vi.resetModules();
      const { metadata: m } = await import("@/app/layout");
      const url = m.metadataBase as URL;
      expect(url.hostname).toBe("localhost");
      expect(url.port).toBe("3000");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = original;
      vi.resetModules();
    }
  });

  it("uses NEXT_PUBLIC_SITE_URL when it is set", async () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://world-clock.example";

    try {
      vi.resetModules();
      const { metadata: m } = await import("@/app/layout");
      const url = m.metadataBase as URL;
      expect(url.origin).toBe("https://world-clock.example");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = original;
      vi.resetModules();
    }
  });

  it("the parsed URL has pathname '/'", () => {
    const url = metadata.metadataBase as URL;
    expect(url.pathname).toBe("/");
  });
});

/* -------------------------------------------------------------------------- */
/* Title                                                                      */
/* -------------------------------------------------------------------------- */

describe("metadata — title", () => {
  it("uses a title template that appends the app name", () => {
    expect(metadata.title).toMatchObject({
      default: "World Clock",
      template: "%s — World Clock",
    });
  });

  it("the template uses an em dash, not a hyphen", () => {
    /*
     * The page shell writes `Tokyo — World Clock` in its
     * effect. If this template used a hyphen the two strings
     * would drift and the tab title would flip on navigation.
     */
    const title = metadata.title as {
      template: string;
      default: string;
    };
    expect(title.template).toContain("—");
    expect(title.template).not.toContain(" - ");
  });

  it("the default title equals the application name", () => {
    const title = metadata.title as {
      template: string;
      default: string;
    };
    expect(title.default).toBe(metadata.applicationName);
  });
});

/* -------------------------------------------------------------------------- */
/* Description and identity                                                   */
/* -------------------------------------------------------------------------- */

describe("metadata — description and identity", () => {
  it("has a non-empty description", () => {
    expect(typeof metadata.description).toBe("string");
    expect(metadata.description?.length).toBeGreaterThan(0);
  });

  it("declares the application name", () => {
    expect(metadata.applicationName).toBe("World Clock");
  });

  it("declares at least one author", () => {
    const authors = metadata.authors;
    expect(Array.isArray(authors)).toBe(true);

    const list = Array.isArray(authors) ? authors : [authors];
    expect(list.length).toBeGreaterThan(0);
  });

  it("declares keywords", () => {
    const keywords = metadata.keywords;
    expect(Array.isArray(keywords)).toBe(true);

    const list = Array.isArray(keywords) ? keywords : [keywords];
    expect(list.length).toBeGreaterThan(0);
  });

  it("disables telephone/email/address autodetection", () => {
    expect(metadata.formatDetection).toEqual({
      telephone: false,
      email: false,
      address: false,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Social cards                                                               */
/* -------------------------------------------------------------------------- */

describe("metadata — social cards", () => {
  it("declares an Open Graph card", () => {
    expect(metadata.openGraph).toMatchObject({
      title: "World Clock",
      type: "website",
    });
  });

  it("declares a Twitter card with the large-image layout", () => {
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "World Clock",
    });
  });

  it("uses the same description for metadata, Open Graph, and Twitter", () => {
    const description = metadata.description;
    expect(
      (metadata.openGraph as { description?: string })?.description,
    ).toBe(description);
    expect(
      (metadata.twitter as { description?: string })?.description,
    ).toBe(description);
  });

  it("uses the same title for metadata default, Open Graph, and Twitter", () => {
    const title = metadata.title as { default: string };
    expect(
      (metadata.openGraph as { title?: string })?.title,
    ).toBe(title.default);
    expect(
      (metadata.twitter as { title?: string })?.title,
    ).toBe(title.default);
  });
});

/* -------------------------------------------------------------------------- */
/* viewport                                                                   */
/* -------------------------------------------------------------------------- */

describe("viewport", () => {
  it("matches the page background", () => {
    expect(viewport.themeColor).toBe("#05070a");
  });

  it("declares a dark color scheme", () => {
    expect(viewport.colorScheme).toBe("dark");
  });

  it("uses device-width and no initial zoom", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });
});