"use client";

import { Html } from "@react-three/drei";
import { ExternalLink, X } from "lucide-react";
import { useMemo } from "react";

import {
  getAtmosphere,
  getAtmosphereVisual,
  showsStars,
  skyGradientToCss,
  type Atmosphere,
} from "@/lib/atmosphere";
import type { WorldLocation } from "@/lib/locations";
import {
  formatLongDate,
  formatTime12WithSeconds,
  getDecimalHour,
} from "@/lib/time";
import { useNow } from "@/lib/useNow";

import CityFactsSection, {
  CARD_SECTION_CAPTION_CLASS,
  CARD_SECTION_WRAPPER_CLASS,
} from "./CityFactsSection";
import { pickCardOffsetClasses, type CardSide } from "./GlobeMarker";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CityArrivalCardProps {
  /** The selected location. Never null — the parent gates on selection. */
  readonly location: WorldLocation;

  /** Called when the user closes the card. */
  readonly onClose: () => void;

  /**
   * Which side of the anchor the card is drawn on. Defaults to
   * `"right"`. The caller (`GlobeMarker`) decides this based on
   * where the marker sits on screen, so the card never runs off
   * the edge of the viewport.
   */
  readonly cardSide?: CardSide;
}

/* -------------------------------------------------------------------------- */
/* Maps link                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Google Maps deep-link for a location.
 *
 * Uses the `?q=lat,lng` form, which opens Google Maps with a
 * *pin* dropped at the coordinates.
 *
 * ## Why not `/maps/@lat,lng,15z`
 *
 * The `/maps/@` form centers the map on the coordinates with
 * no marker, so a user clicking "Open in Google Maps" from a
 * city card sees a map of the surrounding area with nothing
 * highlighted — the exact opposite of what the link promises.
 * The `q` form always drops a marker on the requested point.
 *
 * ## Why not `?q=City+Name`
 *
 * A city name is ambiguous. "Springfield" resolves to one of
 * ~20 cities in the United States alone, and Google picks one
 * based on its own heuristics. The coordinate form is
 * unambiguous — lat/lng corresponds to exactly one point on
 * Earth.
 *
 * Zoom is left to Google's default for the `q` form.
 *
 * Exported for unit testing.
 */
export function buildMapsUrl(location: WorldLocation): string {
  const { latitude, longitude } = location;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/* -------------------------------------------------------------------------- */
/* Card chrome                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Per-atmosphere chrome for the card.
 *
 * The card renders a miniature version of the atmosphere's
 * visual: the same sky gradient, the same ambient radial
 * washes, the same accent color, and a small star field when
 * the atmosphere shows stars. The whole thing is heavily
 * dimmed so it reads as a soft tinted backdrop rather than
 * competing with the time and coordinates for attention.
 *
 * ## Why not render the full `SkyAtmosphere` component
 *
 * `SkyAtmosphere` assumes a wide, tall container — its sun is
 * 88–116px wide, its clouds are 230–380px wide, and its arc
 * positions are percentages of a large section. In a 210–280px
 * card, the sun would be half the card's width and the clouds
 * would clip to slivers. This component reproduces only the
 * parts that scale: the gradient, the ambient washes, and a
 * small hand-tuned star field.
 *
 * The sun/moon arcs are omitted on purpose. They would dominate
 * the card's layout and fight the time digits. The card is a
 * window into the atmosphere's *mood*, not a full scene.
 */
interface CardChrome {
  readonly gradientOpacity: number;
  readonly ambientOpacity: number;
  readonly glowOpacity: number;
  readonly starCount: number;
  readonly starPeakOpacity: number;
  readonly borderTint: string;
  readonly outerGlow: string;
  readonly accentDot: string;
}

const CARD_CHROME: Record<Atmosphere, CardChrome> = {
  dawn: {
    gradientOpacity: 0.32,
    ambientOpacity: 0.32,
    glowOpacity: 0.26,
    starCount: 6,
    starPeakOpacity: 0.5,
    borderTint: "rgba(255,187,104,0.34)",
    outerGlow: "rgba(255,180,90,0.16)",
    accentDot: "#ffbb68",
  },
  day: {
    gradientOpacity: 0.36,
    ambientOpacity: 0.28,
    glowOpacity: 0.22,
    starCount: 0,
    starPeakOpacity: 0,
    borderTint: "rgba(255,214,120,0.30)",
    outerGlow: "rgba(120,180,255,0.12)",
    accentDot: "#ffd678",
  },
  dusk: {
    gradientOpacity: 0.30,
    ambientOpacity: 0.30,
    glowOpacity: 0.26,
    starCount: 6,
    starPeakOpacity: 0.5,
    borderTint: "rgba(255,125,82,0.32)",
    outerGlow: "rgba(180,110,220,0.14)",
    accentDot: "#ff7d52",
  },
  night: {
    gradientOpacity: 0.22,
    ambientOpacity: 0.34,
    glowOpacity: 0.30,
    starCount: 10,
    starPeakOpacity: 0.75,
    borderTint: "rgba(128,165,239,0.26)",
    outerGlow: "rgba(90,130,210,0.14)",
    accentDot: "#80a5ef",
  },
};

/**
 * The card's star positions, as percentages.
 *
 * Ten entries — one per possible star slot. The card only
 * renders the first `starCount` slots, so `day` (starCount 0)
 * shows none and `night` (starCount 10) shows all ten.
 */
const CARD_STARS: readonly {
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly delay: number;
}[] = [
  { left: 8, top: 12, size: 1.5, delay: 0.0 },
  { left: 22, top: 6, size: 1.0, delay: 0.4 },
  { left: 36, top: 14, size: 2.0, delay: 0.8 },
  { left: 14, top: 26, size: 1.0, delay: 1.2 },
  { left: 48, top: 8, size: 1.5, delay: 1.6 },
  { left: 62, top: 20, size: 1.0, delay: 2.0 },
  { left: 30, top: 32, size: 1.5, delay: 2.4 },
  { left: 6, top: 40, size: 1.0, delay: 2.8 },
  { left: 72, top: 34, size: 1.5, delay: 0.6 },
  { left: 44, top: 40, size: 1.0, delay: 1.4 },
];

/**
 * The card's star field keyframes.
 *
 * Inlined in a `<style>` tag rather than added to
 * `globals.css` because the animation is used by exactly one
 * component. The name is prefixed with `card-` to avoid
 * colliding with any other `*-twinkle` keyframe that might be
 * introduced by a dependency or a sibling component.
 */
const STAR_KEYFRAMES = `
  @keyframes card-star-twinkle {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }
`;

/* -------------------------------------------------------------------------- */
/* Star layer                                                                 */
/* -------------------------------------------------------------------------- */

interface StarLayerProps {
  readonly count: number;
  readonly peakOpacity: number;
}

/**
 * The card's twinkling star field.
 *
 * Renders the first `count` entries of `CARD_STARS` as small
 * animated dots. The animation is a simple opacity pulse; the
 * per-star `delay` phases the twinkle so the field does not
 * pulse in unison.
 *
 * Renders `null` when `count` is `0` — the `day` atmosphere
 * has no stars.
 */
function StarLayer({ count, peakOpacity }: StarLayerProps) {
  if (count === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      {CARD_STARS.slice(0, count).map((star, index) => (
        <span
          key={index}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            boxShadow:
              star.size > 1
                ? "0 0 4px rgba(255,255,255,0.6)"
                : "none",
            opacity: peakOpacity,
            animation: `card-star-twinkle 3s ease-in-out ${star.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The "you have arrived" card.
 *
 * Appears when the camera has zoomed close enough to the
 * selected location that the user is clearly focused on that
 * city rather than browsing the globe. The card gives the
 * user three things the globe itself cannot:
 *
 *   1. The city's current local time, updated every second.
 *   2. The city's full name in text, unambiguous.
 *   3. A direct link to the location in Google Maps.
 *
 * ## Visibility is owned by the parent
 *
 * This component renders exactly when it is mounted. The
 * parent (`GlobeScene`) is the single owner of the "should
 * the card be visible?" decision. The card has no internal
 * visibility state.
 *
 * ## The `nowMs === null` case
 *
 * On the very first client render — before the ticker's
 * effect has run — `useNow(1000)` returns `null`. The card
 * renders its placeholder state:
 *
 *   - The time string is `"—:—:—"`.
 *   - The date string is empty.
 *   - The atmosphere falls back to `"day"`.
 *
 * `"day"` is the deliberate choice for the fallback
 * atmosphere because it has the *least visual weight* in
 * `CARD_CHROME`: zero stars, a mild gradient, and a
 * low-opacity ambient.
 *
 * Do not replace the placeholder with a live-time fallback
 * (`new Date()`). The card is server-rendered on the initial
 * render, and a wall-clock read on the server would not match
 * the client's first paint — a hydration mismatch. The
 * placeholder is what keeps the SSR and CSR output identical.
 */
export default function CityArrivalCard({
  location,
  onClose,
  cardSide = "right",
}: CityArrivalCardProps) {
  const nowMs = useNow(1000);

  const atmosphere = useMemo<Atmosphere>(() => {
    if (nowMs === null) return "day";

    const instant = new Date(nowMs);
    const hour = getDecimalHour(instant, location.timezone);

    return getAtmosphere(hour);
  }, [nowMs, location.timezone]);

  const visual = useMemo(
    () => getAtmosphereVisual(atmosphere),
    [atmosphere],
  );

  const chrome = CARD_CHROME[atmosphere];

  const skyCss = useMemo(
    () => skyGradientToCss(visual.sky),
    [visual.sky],
  );

  const showStars = showsStars(atmosphere);

  const instant = nowMs !== null ? new Date(nowMs) : null;

  const time = instant
    ? formatTime12WithSeconds(instant, location.timezone)
    : "—:—:—";

  const date = instant
    ? formatLongDate(instant, location.timezone)
    : "";

  const offsetClasses = pickCardOffsetClasses(cardSide);

  return (
    <Html
      position={[0, 0, 0]}
      transform={false}
      occlude={false}
      zIndexRange={[200, 100]}
      style={{ pointerEvents: "none" }}
    >
      <div
        className={`pointer-events-auto -translate-y-1/2 ${offsetClasses}`}
      >
        <div
          className="
            relative
            w-[min(210px,calc(100vw-80px))]
            overflow-hidden
            rounded-xl
            border
            bg-[var(--surface-strong)]
            backdrop-blur-2xl
            transition-[box-shadow,border-color]
            duration-700
            ease-out
            sm:w-[280px]
          "
          style={{
            borderColor: chrome.borderTint,
            boxShadow: `0 24px 70px rgba(0,0,0,0.42), 0 0 0 1px ${chrome.borderTint}, 0 0 48px ${chrome.outerGlow}`,
          }}
        >
          {/* ─── Atmosphere backdrop ──────────────────────────── */}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-700"
            style={{
              background: skyCss,
              opacity: chrome.gradientOpacity,
            }}
          />

          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${visual.ambient.background}`}
            style={{ opacity: chrome.ambientOpacity }}
          />

          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${visual.ambient.glow}`}
            style={{ opacity: chrome.glowOpacity }}
          />

          {showStars && (
            <StarLayer
              count={chrome.starCount}
              peakOpacity={chrome.starPeakOpacity}
            />
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 85% 15%, ${chrome.accentDot}26, transparent 60%)`,
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.30) 100%)",
            }}
          />

          {/* ─── Content ─────────────────────────────────────── */}

          <div className="relative p-3 sm:p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full transition-colors duration-700"
                    style={{
                      backgroundColor: chrome.accentDot,
                      boxShadow: `0 0 8px ${chrome.accentDot}99`,
                    }}
                  />

                  <p
                    className="
                      truncate
                      text-[13px]
                      font-medium
                      tracking-tight
                      sm:text-[15px]
                    "
                  >
                    {location.city}
                  </p>
                </div>

                <p
                  className="
                    mt-0.5
                    truncate
                    pl-[14px]
                    text-[10px]
                    text-[var(--muted)]
                    sm:text-[11px]
                  "
                >
                  {location.country}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Close ${location.city} detail card`}
                title="Close"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                className="
                  -mt-0.5
                  flex
                  size-5
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  text-[var(--muted)]
                  transition-colors
                  duration-200
                  hover:bg-[var(--foreground)]/[0.06]
                  hover:text-[var(--foreground)]
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[var(--foreground)]/25
                  sm:size-6
                "
              >
                <X
                  aria-hidden="true"
                  className="size-3 sm:size-3.5"
                  strokeWidth={1.7}
                />
              </button>
            </div>

            {/* Local time */}
            <div className="mt-2.5 sm:mt-3.5">
              <p
                className="
                  text-[19px]
                  font-light
                  leading-tight
                  tracking-[-0.03em]
                  tabular-nums
                  sm:text-[28px]
                "
              >
                {time}
              </p>

              <p
                className="
                  mt-0.5
                  text-[9px]
                  text-[var(--muted)]
                  sm:text-[10px]
                "
              >
                {date}
              </p>
            </div>

            {/* Coordinates */}
            <div className={CARD_SECTION_WRAPPER_CLASS}>
              <p className={CARD_SECTION_CAPTION_CLASS}>
                Coordinates
              </p>

              <p
                className="
                  mt-0.5
                  font-mono
                  text-[9px]
                  tabular-nums
                  text-[var(--muted)]
                  sm:text-[10px]
                "
              >
                {location.latitude.toFixed(4)},{" "}
                {location.longitude.toFixed(4)}
              </p>
            </div>

            {/* City facts */}
            <CityFactsSection locationId={location.id} />

            {/* Open in Maps */}
            <a
              href={buildMapsUrl(location)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${location.city} in Google Maps (opens in a new tab)`}
              className="
                mt-2.5
                flex
                w-full
                items-center
                justify-center
                gap-1.5
                rounded-lg
                border
                border-[var(--border)]
                bg-white/[0.03]
                px-3
                py-2
                text-[10px]
                font-medium
                tracking-tight
                text-[var(--foreground)]
                transition-colors
                duration-200
                hover:bg-white/[0.07]
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-[var(--foreground)]/25
                sm:mt-3.5
                sm:gap-2
                sm:py-2.5
                sm:text-[11px]
              "
            >
              <span aria-hidden="true">Open in Google Maps</span>
              <ExternalLink
                aria-hidden="true"
                className="size-3 sm:size-3.5"
                strokeWidth={1.8}
              />
            </a>
          </div>
        </div>
      </div>

      <style>{STAR_KEYFRAMES}</style>
    </Html>
  );
}