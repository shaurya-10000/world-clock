"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { ArrowRight, Heart, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { subscribe } from "@/lib/events";
import {
  getWorldLocationById,
  type WorldLocation,
} from "@/lib/locations";
import {
  searchLocations,
  type SearchResult,
} from "@/lib/search";
import {
  formatShortDate,
  formatTime12,
} from "@/lib/time";
import { useFavorites } from "@/lib/useFavorites";
import { useNow } from "@/lib/useNow";

import SearchRowAtmosphere, {
  useAtmosphereVisual,
} from "@/components/search/SearchRowAtmosphere";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A selector that matches every element that can receive
 * keyboard focus inside a container.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The list of attribute names whose presence or value affects
 * whether an element is focusable.
 */
const FOCUSABILITY_ATTRIBUTES = [
  "disabled",
  "tabindex",
  "href",
] as const;

/**
 * Minimum height of the results container in the empty state.
 */
const EMPTY_STATE_MIN_HEIGHT_CLASS = "min-h-64";

/**
 * Test id for the results count element.
 */
const RESULTS_COUNT_TESTID = "cities-results-count";

/**
 * The default reduced-motion preference used when
 * `useReducedMotion` returns `null` (which it does during
 * SSR and on the first client render).
 */
const DEFAULT_REDUCED_MOTION = false;

/**
 * The scrollbar styling for the results list.
 */
const SCROLLBAR_STYLES = `
  .world-clock-cities-scroll {
    scrollbar-width: thin;
    scrollbar-color: #171717 transparent;
    scrollbar-gutter: stable;
    -webkit-overflow-scrolling: touch;
  }

  .world-clock-cities-scroll::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  .world-clock-cities-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .world-clock-cities-scroll::-webkit-scrollbar-thumb {
    background: #171717;
    border-radius: 9999px;
    border: 0;
  }

  .world-clock-cities-scroll::-webkit-scrollbar-thumb:hover {
    background: #242424;
  }

  .world-clock-cities-scroll::-webkit-scrollbar-corner {
    background: transparent;
  }
`;

/* -------------------------------------------------------------------------- */
/* FavoriteButton                                                             */
/* -------------------------------------------------------------------------- */

interface FavoriteButtonProps {
  readonly active: boolean;
  readonly city: string;
  readonly onToggle: () => void;
}

/**
 * The heart-shaped favorite toggle button.
 *
 * Defined here because the drawer is where it was first used
 * and where the styling conventions live — but **exported**
 * because `CityArrivalCard.tsx` needs the same button, and
 * duplicating 40 lines of interactive markup with an ARIA
 * contract is worse than importing from a sibling.
 *
 * If a third consumer ever appears, this is the moment to move
 * the component into its own file. Two consumers is not.
 *
 * ## Click contract
 *
 * `onClick` calls `event.stopPropagation()` **before** invoking
 * `onToggle`. In the drawer this prevents the click from also
 * triggering the full-cover "Select {city}" button underneath.
 * In the arrival card it prevents the click from reaching the
 * globe's pointer handlers, which would start a drag.
 *
 * The order matters: stop first, then act. Reversing it would
 * let the toggle run while the outer button's click handler
 * also fires, producing two toggles and a desynced `aria-pressed`.
 */
export function FavoriteButton({
  active,
  city,
  onToggle,
}: FavoriteButtonProps) {
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        active
          ? `Remove ${city} from favorites`
          : `Add ${city} to favorites`
      }
      aria-pressed={active}
      className={[
        "pointer-events-auto relative z-20 flex size-7 shrink-0",
        "items-center justify-center rounded-full",
        "transition-all duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-[var(--favorite)]",
        active
          ? "text-[var(--favorite)]"
          : "text-white/30 hover:text-white/70",
      ].join(" ")}
    >
      <Heart
        aria-hidden="true"
        className="pointer-events-none size-3.5"
        strokeWidth={1.6}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* CityRow                                                                    */
/* -------------------------------------------------------------------------- */

interface CityRowProps {
  readonly location: WorldLocation;
  readonly selected: boolean;
  readonly favorited: boolean;
  readonly reducedMotion: boolean;
  readonly onSelect: (location: WorldLocation) => void;
  readonly onToggleFavorite: (locationId: string) => void;
}

function CityRow({
  location,
  selected,
  favorited,
  reducedMotion,
  onSelect,
  onToggleFavorite,
}: CityRowProps) {
  const now = useNow(1000);
  const { visual } = useAtmosphereVisual(location.timezone);

  const { time, date } = useMemo(() => {
    const instant = now ? new Date(now) : new Date();

    return {
      time: formatTime12(instant, location.timezone),
      date: formatShortDate(instant, location.timezone),
    };
  }, [now, location.timezone]);

  const handleSelect = useCallback(() => {
    onSelect(location);
  }, [onSelect, location]);

  const handleToggleFavorite = useCallback(() => {
    onToggleFavorite(location.id);
  }, [onToggleFavorite, location.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
      transition={{ duration: reducedMotion ? 0 : 0.22 }}
      className="
        group relative flex min-h-[102px] w-full items-center
        justify-between gap-4 overflow-hidden border-b
        border-white/[0.075] px-6 py-5 text-left
        last:border-b-0
      "
    >
      {/* Select target — full-cover button behind all content. */}
      <button
        type="button"
        onClick={handleSelect}
        aria-label={`Select ${location.city}`}
        className="
          absolute inset-0 z-0 cursor-pointer
          focus-visible:outline-none
          focus-visible:ring-1
          focus-visible:ring-white/25
          focus-visible:ring-inset
        "
      />

      {/* Ambient chrome — all decorative, all non-interactive. */}
      <SearchRowAtmosphere
        timezone={location.timezone}
        hoverHighlight
        iconSize="size-14"
      />

      {selected && (
        <motion.span
          layoutId="selected-city-indicator"
          aria-hidden="true"
          className="
            pointer-events-none absolute left-0 top-1/2 z-20
            h-9 w-[2px] -translate-y-1/2 rounded-full
            bg-[var(--accent)]
            shadow-[0_0_14px_var(--accent-glow)]
          "
          transition={{
            duration: reducedMotion ? 0 : 0.3,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      )}

      <div className="pointer-events-none relative z-10 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-white">
            {location.city}
          </p>

          <span
            aria-hidden="true"
            className={`size-[3px] shrink-0 rounded-full ${visual.accent} opacity-80`}
          />
        </div>

        <div className="mt-1.5">
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-white/45">
            {location.country}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-2">
        <FavoriteButton
          active={favorited}
          city={location.city}
          onToggle={handleToggleFavorite}
        />

        <div className="pointer-events-none text-right">
          <p className="font-mono text-[18px] font-medium leading-none tracking-[-0.06em] tabular-nums text-white">
            {time}
          </p>

          <p className="mt-1.5 text-[9px] font-medium tracking-[0.04em] text-white/35">
            {date}
          </p>
        </div>

        <ArrowRight
          aria-hidden="true"
          className="
            pointer-events-none size-[14px] -translate-x-1
            text-white/45 opacity-0 transition-all duration-200
            group-hover:translate-x-0 group-hover:opacity-100
          "
          strokeWidth={1.4}
        />
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* SectionLabel                                                               */
/* -------------------------------------------------------------------------- */

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p
      className="
        px-6 pt-5 pb-2 text-[9px] font-black uppercase
        tracking-[0.22em] text-white/30
      "
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* SearchField                                                                */
/* -------------------------------------------------------------------------- */

interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function SearchField({
  value,
  onChange,
}: SearchFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  const showFullLine = isFocused || value.length > 0;

  return (
    <div className="relative mt-6">
      <div className="group relative border-b border-white/[0.1] transition-colors duration-300">
        <div className="flex items-center gap-3">
          <Search
            aria-hidden="true"
            className="
              size-[15px] shrink-0 text-white/30
              transition-colors duration-300
              group-focus-within:text-white/60
            "
            strokeWidth={1.6}
          />

          <input
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="SEARCH CITY OR COUNTRY"
            aria-label="Search cities"
            autoComplete="off"
            spellCheck={false}
            className="
              h-11 min-w-0 flex-1 bg-transparent text-[11px]
              font-bold uppercase tracking-[0.12em] text-white
              outline-none placeholder:text-white/25
            "
          />

          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear search"
              className="
                flex size-7 shrink-0 items-center justify-center
                rounded-full text-white/30 transition-colors
                hover:bg-white/[0.06] hover:text-white
                focus-visible:outline-none
                focus-visible:ring-1 focus-visible:ring-white/40
              "
            >
              <X
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={1.6}
              />
            </button>
          )}
        </div>

        <motion.span
          aria-hidden="true"
          className="
            absolute bottom-0 left-0 h-px bg-[var(--accent)]
            shadow-[0_0_10px_var(--accent-glow)]
          "
          initial={{ width: "8%", opacity: 0.4 }}
          animate={{
            width: showFullLine ? "100%" : "8%",
            opacity: showFullLine ? 1 : 0.4,
          }}
          transition={{
            duration: 0.35,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EmptyState                                                                 */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex ${EMPTY_STATE_MIN_HEIGHT_CLASS} items-center justify-center text-center`}
      role="status"
    >
      <div>
        <Search
          aria-hidden="true"
          className="mx-auto size-6 text-white/20"
          strokeWidth={1.3}
        />

        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
          No locations found
        </p>

        <p className="mt-2 text-xs text-white/25">
          Try another city or country.
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* CitiesSection                                                              */
/* -------------------------------------------------------------------------- */

interface CitiesSectionProps {
  readonly selectedLocationId: string | null;
  readonly onLocationSelect: (location: WorldLocation) => void;
  readonly reducedMotion?: boolean;
}

export default function CitiesSection({
  selectedLocationId,
  onLocationSelect,
  reducedMotion: reducedMotionOverride,
}: CitiesSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion =
    reducedMotionOverride ??
    prefersReducedMotion ??
    DEFAULT_REDUCED_MOTION;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const {
    favorites,
    isFavorite,
    toggle: toggleFavorite,
  } = useFavorites();

  const dialogRef = useRef<HTMLElement | null>(null);

  const returnFocusRef = useRef<HTMLElement | null>(null);

  const headingId = useId();

  /* ------------------------------------------------------------------ */
  /* Derived lists                                                      */
  /* ------------------------------------------------------------------ */

  const favoriteLocations = useMemo(() => {
    const list: WorldLocation[] = [];

    for (const id of favorites) {
      const location = getWorldLocationById(id);
      if (location) list.push(location);
    }

    return list;
  }, [favorites]);

  const results: readonly SearchResult[] = useMemo(
    () => searchLocations(query),
    [query],
  );

  const showFavorites =
    query.trim().length === 0 && favoriteLocations.length > 0;

  /* ------------------------------------------------------------------ */
  /* Open / close                                                       */
  /* ------------------------------------------------------------------ */

  /*
   * The query is reset as part of the close transition rather
   * than in an effect watching `isOpen`. Clearing it here means
   * the reset happens in the same render commit that flips
   * `isOpen` to `false` — no cascading render, and the drawer
   * is guaranteed to be empty the next time it opens.
   */
  const openDrawer = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    return subscribe("cities:open", openDrawer);
  }, [openDrawer]);

  /* ------------------------------------------------------------------ */
  /* Body scroll lock                                                   */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  /* ------------------------------------------------------------------ */
  /* Inert background                                                   */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen) return;

    let mainElement: HTMLElement | null =
      document.querySelector("main");
    let previousInert = false;
    let observer: MutationObserver | null = null;

    const applyInert = (): void => {
      if (!mainElement) return;
      previousInert = mainElement.hasAttribute("inert");
      mainElement.setAttribute("inert", "");
    };

    const removeInert = (): void => {
      if (!mainElement) return;
      if (!previousInert) {
        mainElement.removeAttribute("inert");
      }
    };

    if (mainElement) {
      applyInert();
    } else {
      observer = new MutationObserver(() => {
        const found = document.querySelector("main");
        if (found) {
          mainElement = found;
          applyInert();
          observer?.disconnect();
          observer = null;
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer?.disconnect();
      removeInert();
    };
  }, [isOpen]);

  /* ------------------------------------------------------------------ */
  /* Focus save / restore                                               */
  /* ------------------------------------------------------------------ */

  useLayoutEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [isOpen]);

  /* ------------------------------------------------------------------ */
  /* Focus trap                                                         */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen) return;

    const focusFrame = requestAnimationFrame(() => {
      const root = dialogRef.current;
      if (!root) return;

      const focusable = root.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      focusable[0]?.focus();
    });

    let cachedFocusables: HTMLElement[] = [];

    const refreshFocusables = (): HTMLElement[] => {
      const root = dialogRef.current;
      if (!root) return [];

      return Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        setQuery("");
        return;
      }

      if (event.key !== "Tab") return;

      if (cachedFocusables.length === 0) {
        cachedFocusables = refreshFocusables();
      }

      if (cachedFocusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = cachedFocusables[0];
      const last = cachedFocusables[cachedFocusables.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const root = dialogRef.current;

    const observer = root
      ? new MutationObserver(() => {
          cachedFocusables = [];
        })
      : null;

    observer?.observe(root!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...FOCUSABILITY_ATTRIBUTES],
    });

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      observer?.disconnect();
    };
  }, [isOpen, favorites]);

  /* ------------------------------------------------------------------ */
  /* Handlers                                                           */
  /* ------------------------------------------------------------------ */

  const handleSelect = useCallback(
    (location: WorldLocation) => {
      onLocationSelect(location);
      setIsOpen(false);
      setQuery("");
    },
    [onLocationSelect],
  );

  const handleBackdropClick = useCallback(() => {
    closeDrawer();
  }, [closeDrawer]);

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <>
      <style>{SCROLLBAR_STYLES}</style>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              role="presentation"
              onClick={handleBackdropClick}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.25,
              }}
              className="
                fixed inset-0 z-[9998] cursor-default
                bg-black/85 backdrop-blur-md
              "
            />

            <motion.aside
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : {
                      type: "spring",
                      damping: 30,
                      stiffness: 300,
                    }
              }
              className="
                fixed right-0 top-0 z-[9999] flex h-dvh w-full
                max-w-md flex-col overflow-hidden border-l
                border-white/[0.08] bg-black text-white shadow-2xl
              "
            >
              <div className="shrink-0 border-b border-white/[0.08] bg-black px-6 pb-5 pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="
                        flex size-10 items-center justify-center
                        rounded-xl border border-white/[0.09]
                        bg-white/[0.025]
                      "
                    >
                      <span
                        aria-hidden="true"
                        className="
                          size-1.5 rounded-full bg-[var(--accent)]
                          shadow-[0_0_10px_var(--accent-glow)]
                        "
                      />
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30">
                        World Clock
                      </p>

                      <h2
                        id={headingId}
                        className="mt-1 text-xl font-black uppercase italic tracking-tighter text-white"
                      >
                        Cities
                      </h2>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeDrawer}
                    aria-label="Close cities"
                    className="
                      flex size-9 items-center justify-center
                      rounded-full text-white/40 transition-colors
                      duration-200 hover:bg-white/[0.06]
                      hover:text-white focus-visible:outline-none
                      focus-visible:ring-1
                      focus-visible:ring-[var(--accent)]
                    "
                  >
                    <X
                      aria-hidden="true"
                      className="size-5"
                      strokeWidth={1.7}
                    />
                  </button>
                </div>

                <SearchField value={query} onChange={setQuery} />

                <div className="mt-4 flex items-center justify-between">
                  <p
                    data-testid={RESULTS_COUNT_TESTID}
                    className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30"
                  >
                    {results.length}{" "}
                    {results.length === 1
                      ? "Location"
                      : "Locations"}
                  </p>

                  <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
                    <span
                      aria-hidden="true"
                      className="
                        size-1 rounded-full bg-emerald-400
                        shadow-[0_0_8px_rgba(52,211,153,0.65)]
                      "
                    />
                    Live
                  </p>
                </div>
              </div>

              <div
                className="
                  world-clock-cities-scroll min-h-0 flex-1
                  overflow-y-auto
                "
              >
                <AnimatePresence initial={false}>
                  {showFavorites && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        duration: reducedMotion ? 0 : 0.3,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="overflow-hidden"
                    >
                      <SectionLabel>Favorites</SectionLabel>

                      <div>
                        {favoriteLocations.map((location) => (
                          <CityRow
                            key={`fav-${location.id}`}
                            location={location}
                            selected={
                              location.id === selectedLocationId
                            }
                            favorited={true}
                            reducedMotion={reducedMotion}
                            onSelect={handleSelect}
                            onToggleFavorite={toggleFavorite}
                          />
                        ))}
                      </div>

                      <div className="h-4" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {showFavorites && results.length > 0 && (
                  <SectionLabel>All Cities</SectionLabel>
                )}

                <div>
                  <AnimatePresence initial={false}>
                    {results.map((result) => (
                      <CityRow
                        key={result.location.id}
                        location={result.location}
                        selected={
                          result.location.id === selectedLocationId
                        }
                        favorited={isFavorite(result.location.id)}
                        reducedMotion={reducedMotion}
                        onSelect={handleSelect}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {results.length === 0 && <EmptyState />}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}