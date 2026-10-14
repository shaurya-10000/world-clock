import type { Metadata, Viewport } from "next";
import {
  Fraunces,
  Inter,
  JetBrains_Mono,
} from "next/font/google";

import "./globals.css";

/* -------------------------------------------------------------------------- */
/* Brand tokens                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Shared brand values.
 *
 * Duplicated in `app/manifest.ts` by necessity — Next.js reads
 * that file as a separate entry point, and importing from here
 * would drag `next/font` into the manifest's build graph. The
 * strings are kept byte-identical so both surfaces agree. If
 * either changes, the other must change with it. The
 * cross-file invariants in `layout.integration.test.tsx` guard
 * this contract.
 */
const APP_NAME = "World Clock";
const APP_DESCRIPTION =
  "Explore the world through an interactive globe and discover the local time of cities around the planet.";

/** Brand background color, matching `globals.css` `--background`. */
const BACKGROUND = "#05070a";

/* -------------------------------------------------------------------------- */
/* Site URL                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the canonical origin for `metadataBase`.
 *
 * `NEXT_PUBLIC_SITE_URL` is expected to be a full origin
 * (e.g. `https://world-clock.example`). Three cases are
 * handled:
 *
 *   1. The variable is unset (`undefined` / `null`) — fall
 *      back to localhost.
 *   2. The variable is set to an empty or whitespace-only
 *      string — a deployment system that exports empty
 *      values would produce `""`, and `new URL("")` throws.
 *      Treat empty as unset.
 *   3. The variable is set to a real value — parse it.
 *
 * The `||` operator is used deliberately rather than `??`:
 * `??` only catches nullish values, and the failure mode we
 * are guarding against is an empty string.
 *
 * The explicit base argument is not decorative. The WHATWG
 * spec allows `new URL(absolute)` with no base, but some DOM
 * emulations used by test runners only implement the
 * two-argument form. Passing a base is valid for every
 * implementation and costs nothing at runtime.
 */
function resolveSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const fallback = "http://localhost:3000";
  const value = raw && raw.length > 0 ? raw : fallback;
  return new URL(value, "http://placeholder/");
}

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: APP_NAME,
    template: `%s — ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  authors: [{ name: APP_NAME }],
  keywords: [
    "world clock",
    "time zones",
    "cities",
    "local time",
    "globe",
  ],
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: BACKGROUND,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={[
        inter.variable,
        jetbrainsMono.variable,
        fraunces.variable,
      ].join(" ")}
    >
      <body>{children}</body>
    </html>
  );
}