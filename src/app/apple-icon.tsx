import { ImageResponse } from "next/og";

/**
 * The Apple touch icon.
 *
 * iOS uses this as the home-screen icon when a user adds the
 * site to their home screen. It also serves as a fallback for
 * some PWA installers.
 *
 * ## Design
 *
 * A warm yellow sun on the brand's dark disc.
 *
 * Unlike `app/icon.tsx`, this keeps an explicit opaque
 * background. iOS fills transparent areas with black on
 * home-screen icons, so a transparent canvas would render as
 * the sun floating on a black tile. An explicit `#05070a`
 * disc gives a deliberate, consistent look and matches the
 * splash screen the manifest produces.
 *
 * The icon cannot be swapped at runtime on iOS — the OS
 * caches the image when the user adds it to the home screen.
 * It stays a fixed sun regardless of the selected city's
 * atmosphere. `DayNightFavicon` does not touch this file's
 * output.
 *
 * ## Glow geometry
 *
 * The disc is 104px; the glow extends 36px in each direction.
 * The total visual extent is 104 + 36 + 36 = 176px, which
 * fits inside the 180px canvas with 2px of breathing room on
 * each side. A larger glow (48px) was tried first and clipped
 * against the canvas edge, which produced a flat, cut-off
 * halo. The glow value here is the largest that fits without
 * clipping.
 *
 * ## Why this is a server route
 *
 * `next/og`'s `ImageResponse` uses `satori` and `resvg` in
 * Node. There is no `"use client"` here, and adding one would
 * break the build.
 *
 * ## Colour duplication
 *
 * `BACKGROUND` and `SUN_COLOR` are repeated in `app/icon.tsx`,
 * `app/manifest.ts`, `app/layout.tsx`, and
 * `components/DayNightFavicon.tsx`. The values are brand
 * tokens that change rarely; sharing a constant would require
 * a module that is neither a route nor a client component.
 * The cross-file tests in `layout.integration.test.tsx` and
 * `manifest.test.ts` guard the contract on the two constants
 * that are visible to them.
 */

/** Brand background color, matching `globals.css` `--background`. */
const BACKGROUND = "#05070a";

/** Warm yellow for the sun. */
const SUN_COLOR = "#f5c14a";

export const size = {
  width: 180,
  height: 180,
} as const;

export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BACKGROUND,
        }}
      >
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: "50%",
            background: SUN_COLOR,
            boxShadow: `0 0 36px ${SUN_COLOR}aa`,
          }}
        />
      </div>
    ),
    size,
  );
}