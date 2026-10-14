import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Next.js serves this file at `/manifest.webmanifest` and
 * injects the corresponding `<link rel="manifest">` tag into
 * the document head automatically.
 *
 * The manifest is what enables:
 *   - "Add to Home Screen" on iOS and Android.
 *   - The browser's install prompt.
 *   - The theme color of the mobile browser chrome (some
 *     browsers read the manifest value over the viewport
 *     theme color).
 *   - The name shown under the icon on the home screen.
 *
 * ## Field notes
 *
 *   - `name` and `short_name` are what users see. On Android,
 *     `short_name` is used when the name would be truncated.
 *     They are identical here because "World Clock" is short
 *     enough to survive truncation on every launcher we have
 *     checked. Shortening it to "Clock" would fit the icon
 *     better but loses the brand; the brand wins.
 *   - `display: "standalone"` hides the browser chrome when
 *     launched from the home screen, so the app fills the
 *     screen like a native app.
 *   - `background_color` and `theme_color` both match the
 *     page background so the splash screen does not flash a
 *     different color.
 *   - `icons` reference the file-based icon convention, which
 *     Next.js generates at build time.
 *
 * ## Known gap
 *
 * Android's install prompt wants a 192×192 and a 512×512
 * maskable icon. Neither exists yet — `/icon` is 32×32 and
 * `/apple-icon` is 180×180. Chrome will install the PWA with
 * these two, but the richer install UI (splash screen, app
 * shortcuts) will not trigger. Adding the two larger icons is
 * a separate change that requires new `next/og` routes.
 *
 * ## Duplication
 *
 * `APP_NAME`, `APP_DESCRIPTION`, and `BACKGROUND` are byte-
 * identical to the constants in `app/layout.tsx`. Next.js
 * reads this file as a separate entry point, so the values
 * cannot be imported from `layout.tsx` without pulling the
 * whole layout module (and its `next/font` calls) into the
 * manifest's build graph. The strings are duplicated by
 * necessity; if either side changes, the other must change
 * with it. The cross-file tests in `layout.integration.test.tsx`
 * guard this contract.
 */

/** Brand background color, matching `globals.css` `--background`. */
const BACKGROUND = "#05070a";

/** Long name shown under the icon on the home screen. */
const APP_NAME = "World Clock";

/** Short name used when the long name would be truncated. */
const APP_SHORT_NAME = "World Clock";

/** Shared description, matching the metadata description in `layout.tsx`. */
const APP_DESCRIPTION =
  "Explore the world through an interactive globe and discover the local time of cities around the planet.";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    categories: ["utilities", "productivity"],
    lang: "en",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}