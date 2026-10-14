import { ImageResponse } from "next/og";

/**
 * The default favicon.
 *
 * Rendered once at build time by `next/og` and served as a
 * static PNG at `/icon`. This is the icon that appears before
 * the client takes over. `DayNightFavicon` replaces it at
 * runtime with a sun or a silver crescent moon depending on
 * the selected city's local time.
 *
 * ## Design
 *
 * A warm yellow sun on a transparent background.
 *
 * The background is deliberately transparent rather than the
 * brand's dark `#05070a` disc. A favicon sits on both light
 * and dark browser chrome; an opaque disc would look like a
 * sticker on light chrome and disappear into dark chrome. The
 * runtime `DayNightFavicon` swaps in a disc-backed SVG for the
 * same reason — once the client is running, it knows the
 * selected atmosphere and can choose the appropriate backing.
 *
 * ## Why this is a server route
 *
 * `next/og`'s `ImageResponse` uses `satori` and `resvg` in
 * Node. It cannot run in the browser. There is no
 * `"use client"` here, and adding one would break the build.
 *
 * ## Colour duplication
 *
 * `SUN_COLOR` is repeated in `app/apple-icon.tsx` and in
 * `components/DayNightFavicon.tsx`. The three cannot share a
 * constant without introducing a module that is neither a
 * route nor a client component; the value is a brand token
 * that changes rarely, so the duplication is accepted. If the
 * brand's sun colour ever changes, all three must change
 * together.
 */

/** Warm yellow for the sun. */
const SUN_COLOR = "#f5c14a";

export const size = {
  width: 32,
  height: 32,
} as const;

export const contentType = "image/png";

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: SUN_COLOR,
            boxShadow: `0 0 4px ${SUN_COLOR}aa`,
          }}
        />
      </div>
    ),
    size,
  );
}