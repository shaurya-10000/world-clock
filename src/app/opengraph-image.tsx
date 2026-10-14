import { ImageResponse } from "next/og";

/**
 * The Open Graph / Twitter social card.
 *
 * Rendered server-side by `next/og` and served as a static
 * PNG at `/opengraph-image`. Next.js injects the corresponding
 * `<meta property="og:image">` and `<meta name="twitter:image">`
 * tags into the document head automatically.
 *
 * Dimensions are the standard 1200×630 that Twitter, Facebook,
 * Slack, iMessage, and Discord all render without cropping.
 *
 * ## Why this is a server component
 *
 * `next/og`'s `ImageResponse` uses `satori` (JSX → SVG) and
 * `resvg` (SVG → PNG). Both run in Node, not the browser. There
 * is no `"use client"` here — that would move the module into
 * the client bundle and the route would never render.
 *
 * ## What is not here
 *
 * No custom fonts. The branded Fraunces / Inter faces would
 * need to be fetched and passed through `ImageResponse`'s
 * `fonts` option; today the card renders in the system sans
 * face. That is a deliberate scope decision, not an oversight.
 */

/* -------------------------------------------------------------------------- */
/* Brand tokens                                                               */
/* -------------------------------------------------------------------------- */

const BACKGROUND = "#05070a";
const FOREGROUND = "#f5f7f8";
const SUBTLE = "rgba(245, 247, 248, 0.38)";
const MUTED = "rgba(245, 247, 248, 0.62)";
const SUN_COLOR = "#f5c14a";
const BORDER = "rgba(255, 255, 255, 0.09)";

/* -------------------------------------------------------------------------- */
/* Route metadata                                                             */
/* -------------------------------------------------------------------------- */

/** Read by Next.js into `<meta property="og:image:alt">`. */
export const alt = "World Clock — explore local time around the planet";

/** Standard social card dimensions. */
export const size = { width: 1200, height: 630 } as const;

/** MIME type of the generated image. */
export const contentType = "image/png";

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: BACKGROUND,
          color: FOREGROUND,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Sun glow, matching the favicon's warm yellow. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `radial-gradient(circle at 50% 42%, ${SUN_COLOR}1a 0%, transparent 55%)`,
          }}
        />

        {/* Brand tag. */}
        <div
          style={{
            display: "flex",
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: SUBTLE,
            marginBottom: 32,
          }}
        >
          World Clock
        </div>

        {/* Sun disc. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: SUN_COLOR,
            boxShadow: `0 0 80px ${SUN_COLOR}88`,
            marginBottom: 48,
          }}
        />

        {/* Headline. */}
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: FOREGROUND,
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Explore the world in real time
        </div>

        {/* Subhead. */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: MUTED,
            marginTop: 28,
            maxWidth: 820,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          An interactive globe. Every city&apos;s local time, at a glance.
        </div>

        {/* Bottom rule. */}
        <div
          style={{
            position: "absolute",
            bottom: 64,
            left: 96,
            right: 96,
            height: 1,
            background: BORDER,
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}