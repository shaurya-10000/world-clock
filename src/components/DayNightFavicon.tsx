"use client";

import { useEffect } from "react";

import { getAtmosphere } from "@/lib/atmosphere";
import type { WorldLocation } from "@/lib/locations";
import { getDecimalHour } from "@/lib/time";
import { useNow } from "@/lib/useNow";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface DayNightFaviconProps {
  /**
   * The currently selected city, or `null` to restore the
   * build-time icon from `app/icon.tsx`.
   */
  readonly location: WorldLocation | null;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Swaps the favicon between a yellow sun and a silver crescent
 * moon based on the selected city's local atmosphere.
 *
 * ## Classification
 *
 * The four atmospheres collapse into two favicon states:
 *
 *   - `dawn`, `day`   → yellow sun
 *   - `dusk`, `night` → silver crescent moon
 *
 * The split is deliberately asymmetric with `lib/atmosphere`'s
 * categorical system, which groups `dawn` and `dusk` together
 * as "twilight". A favicon has only two visual states, so the
 * twilight band had to be resolved somehow. The chosen rule
 * uses the *rising* half of twilight (dawn) as "the sun is
 * coming up" and the *falling* half (dusk) as "the sun has
 * gone down", which matches the visual intuition a user has
 * when they see the tab icon change.
 *
 * ## Icons
 *
 * The two icons are drawn to a transparent canvas and applied
 * as PNG data URLs. That keeps the `<link>` type consistent
 * with the PNG Next.js emits from `app/icon.tsx`, and works
 * in browsers that ignore SVG favicons (older Safari, some
 * embedded webviews).
 *
 * ## Rendering
 *
 * The component returns `null` — it has no DOM presence. All
 * of its work happens in effects that mutate the document
 * `<head>` directly.
 *
 * ## Reduced motion
 *
 * Not consulted. The favicon swap is instantaneous and
 * browser-mediated; there is no animation to suppress.
 */
export default function DayNightFavicon({
  location,
}: DayNightFaviconProps) {
  /*
   * The atmosphere changes at hour boundaries; a minute of
   * latency is imperceptible. `useNow(60_000)` gives us a
   * ticker that respects the app-wide time override — if the
   * user has time-traveled to a solstice, the favicon
   * follows.
   */
  const now = useNow(60_000);

  useEffect(() => {
    if (location === null) {
      applyIcon(null);
      return;
    }

    const instant = now ? new Date(now) : new Date();
    const hour = getDecimalHour(instant, location.timezone);
    const atmosphere = getAtmosphere(hour);

    const isLight = atmosphere === "dawn" || atmosphere === "day";

    applyIcon(getIconDataUrl(isLight ? "sun" : "moon"));
  }, [location, now]);

  /*
   * On unmount, restore the build-time icon.
   *
   * The empty dependency array is deliberate: the cleanup
   * must fire only when the component unmounts, not on every
   * `location` or `now` change. Adding either to the array
   * would restore the build-time icon on every tick, and the
   * re-apply effect above would immediately overwrite it —
   * a two-effect race that would flicker the favicon.
   */
  useEffect(() => {
    return () => applyIcon(null);
  }, []);

  return null;
}

/* -------------------------------------------------------------------------- */
/* DOM helpers                                                                */
/* -------------------------------------------------------------------------- */

interface OriginalIconAttrs {
  readonly href: string | null;
  readonly type: string | null;
  readonly sizes: string | null;
}

/**
 * The attributes Next.js wrote on each `<link rel="icon">`,
 * remembered so they can be restored.
 *
 * A `WeakMap` keyed on the link element itself. The entries
 * are garbage-collected with the link — no cleanup is needed
 * on unmount.
 *
 * ## Why the write is guarded
 *
 * `applyIcon` only records the original attributes for a
 * given link the *first* time it sees it. Subsequent calls
 * skip the write.
 *
 * This is load-bearing. If the write were not guarded, the
 * second `applyIcon("sun")` call would record the sun data
 * URL as the "original" href, and the restore in
 * `applyIcon(null)` would set the favicon back to the sun —
 * losing the build-time icon permanently for the page
 * lifetime. Do not remove the guard.
 */
const originalAttrs = new WeakMap<
  HTMLLinkElement,
  OriginalIconAttrs
>();

/**
 * Every `<link rel="icon">` in the head, creating one if none
 * exists.
 *
 * `rel~="icon"` matches the space-separated token `icon` in
 * the `rel` attribute without matching `apple-touch-icon`,
 * `mask-icon`, or `shortcut icon` (the last of which would
 * match the token `icon` and is intentionally included — it
 * is a legacy alias for the same resource).
 */
function getIconLinks(): HTMLLinkElement[] {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  );

  if (links.length > 0) return links;

  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return [link];
}

/**
 * Set an attribute to a value, or remove it when the value is
 * `null`.
 */
function setOrRemove(
  link: HTMLLinkElement,
  name: string,
  value: string | null,
): void {
  if (value === null) link.removeAttribute(name);
  else link.setAttribute(name, value);
}

/**
 * Point every icon link at `dataUrl`, or restore the original
 * Next.js attributes when `dataUrl` is `null`.
 *
 * ## SSR guard
 *
 * The `typeof document === "undefined"` check is the reason
 * this function is safe to call from a component that might
 * be rendered on the server. In practice the component's
 * effects only run in the browser, but the guard makes the
 * helper self-contained — a future caller that does not go
 * through the effect gets the same safety.
 *
 * ## Restore semantics
 *
 * When restoring (`dataUrl === null`), each attribute falls
 * back to a hardcoded default if the original was missing:
 *
 *   - `href` → `"/icon"` (the Next.js default)
 *   - `type` → `"image/png"`
 *   - `sizes` → removed
 *
 * The `href` fallback matters: if the page was loaded without
 * Next.js emitting a `<link rel="icon">` (which happens in
 * some test and preview environments), the first `applyIcon`
 * call creates one, and the "original" href is `null`. The
 * fallback ensures the restore produces a working href rather
 * than a broken one.
 */
export function applyIcon(dataUrl: string | null): void {
  if (typeof document === "undefined") return;

  for (const link of getIconLinks()) {
    if (!originalAttrs.has(link)) {
      originalAttrs.set(link, {
        href: link.getAttribute("href"),
        type: link.getAttribute("type"),
        sizes: link.getAttribute("sizes"),
      });
    }

    if (dataUrl === null) {
      const original = originalAttrs.get(link);
      setOrRemove(link, "href", original?.href ?? "/icon");
      setOrRemove(link, "type", original?.type ?? "image/png");
      setOrRemove(link, "sizes", original?.sizes ?? null);
      continue;
    }

    link.setAttribute("type", "image/png");
    link.removeAttribute("sizes");
    link.setAttribute("href", dataUrl);
  }
}

/* -------------------------------------------------------------------------- */
/* Icon drawing                                                               */
/* -------------------------------------------------------------------------- */

type IconKind = "sun" | "moon";

const SUN_COLOR = "#f5c14a";
const MOON_COLOR = "#b4bfce";
const ICON_SIZE = 64;

/**
 * The data-URL cache, keyed by icon kind.
 *
 * Populated on the first call to `getIconDataUrl` for each
 * kind and reused for the page lifetime. `canvas.toDataURL()`
 * is not cheap — it serializes the pixel buffer to a base64
 * PNG string, on the order of several kilobytes per call —
 * and the component's effect fires on every minute tick.
 * Caching reduces the per-tick cost to a single object
 * lookup after the first minute.
 *
 * There are exactly two keys, so the cache is not a leak.
 */
const iconCache: Partial<Record<IconKind, string>> = {};

/**
 * Draw the icon once per kind and cache the PNG data URL.
 *
 * The canvas is transparent: the sun and moon sit directly on
 * the browser tab with no background disc, so the favicon
 * blends with whatever color the browser's tab strip uses.
 *
 * ## Fallback
 *
 * If `canvas.getContext("2d")` returns `null` — which can
 * happen in a browser with canvas disabled, or in a test
 * environment without a canvas polyfill — the function
 * returns `"/icon"`, the Next.js default. The favicon will
 * not switch under those conditions, but it will not be
 * broken either.
 *
 * ## Moon construction
 *
 * The crescent is a filled disc with an offset disc erased
 * from it, using `globalCompositeOperation = "destination-out"`.
 * The erasure removes pixels rather than painting them, which
 * is what leaves a true crescent on a transparent background
 * — a painted-over approach would leave a visible ring where
 * the erase disc's edge crossed the fill disc.
 */
export function getIconDataUrl(kind: IconKind): string {
  const cached = iconCache[kind];
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "/icon";

  const c = ICON_SIZE / 2;

  if (kind === "sun") {
    /* Warm yellow disc with a soft glow. */
    ctx.save();
    ctx.shadowColor = SUN_COLOR;
    ctx.shadowBlur = 6;
    ctx.fillStyle = SUN_COLOR;
    ctx.beginPath();
    ctx.arc(c, c, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    /*
     * Silver crescent: draw a full disc, then erase an offset
     * disc from it. `destination-out` removes pixels, leaving
     * a true crescent on a transparent background.
     */
    ctx.fillStyle = MOON_COLOR;
    ctx.beginPath();
    ctx.arc(c - 2, c + 1, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(c + 11, c - 8, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  const url = canvas.toDataURL("image/png");
  iconCache[kind] = url;
  return url;
}

/**
 * Clear the icon data URL cache.
 *
 * Test-only. Production code has no reason to call this — the
 * cache exists so the icon is drawn at most twice per page
 * lifetime. Exported so tests that need to exercise the
 * canvas-fallback path can start from an empty cache rather
 * than a stale one.
 *
 * Follows the same naming and rationale as `resetTimeCache`
 * and `resetTimeFailureLog` in `lib/time.ts`.
 */
export function __clearIconCache(): void {
  for (const key of Object.keys(iconCache) as IconKind[]) {
    delete iconCache[key];
  }
}