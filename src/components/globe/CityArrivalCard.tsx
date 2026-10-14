"use client";

import { Html } from "@react-three/drei";
import { ExternalLink, X } from "lucide-react";
import { useCallback, useMemo } from "react";

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
import { useFavorites } from "@/lib/useFavorites";
import { useNow } from "@/lib/useNow";

import { FavoriteButton } from "@/components/CitiesSection";

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

export default function CityArrivalCard({
  location,
  onClose,
  cardSide = "right",
}: CityArrivalCardProps) {
  const nowMs = useNow(1000);

  /*
   * The card subscribes to the shared favorites store so
   * toggling the heart updates the button in place, and so a
   * toggle made anywhere else in the app (the drawer's heart,
   * another tab) is reflected on the next render.
   */
  const { isFavorite, toggle } = useFavorites();

  const favorited = isFavorite(location.id);

  const handleToggleFavorite = useCallback(() => {
    toggle(location.id);
  }, [toggle, location.id]);

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

              <div className="-mt-0.5 flex shrink-0 items-center gap-0.5">
                <FavoriteButton
                  active={favorited}
                  city={location.city}
                  onToggle={handleToggleFavorite}
                />

                <button
                  type="button"
                  aria-label={`Close ${location.city} detail card`}
                  title="Close"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                  }}
                  className="
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