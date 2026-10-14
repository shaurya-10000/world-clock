"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  Check,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  getAtmosphere,
  showsStars,
} from "@/lib/atmosphere";
import type { WorldLocation } from "@/lib/locations";
import {
  searchLocations,
  type SearchResult,
} from "@/lib/search";
import { getDecimalHour } from "@/lib/time";
import { useNow } from "@/lib/useNow";

import SearchRowAtmosphere from "./SearchRowAtmosphere";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const EASE = [0.16, 1, 0.3, 1] as const;

/** Number of twinkling stars rendered per row when the sky is dark. */
const STARS_PER_ROW = 5;

/**
 * Layout constants for the mobile popover.
 *
 * Exported because they encode a contract — the popover's
 * allowed size range and the viewport margin it respects.
 * The tests in `SearchableLocationInput.test.ts` pin the
 * relationships between them; exporting the values means the
 * tests reference the same names the implementation uses,
 * rather than magic numbers that could silently drift.
 */

/*
 * The minimum width below which the popover goes into a
 * scrollable-within-viewport mode. Chosen so the popover can
 * comfortably hold a two-line result row and the time zone
 * column at a typical narrow-phone width.
 */
export const MIN_PANEL_WIDTH_PX = 320;

/*
 * The maximum width of the popover. Chosen so it does not
 * crowd the right edge of the viewport on a wide desktop,
 * where the search field's own container is narrow but the
 * popover is free-floating.
 *
 * Paired with `MIN_PANEL_WIDTH_PX` and `PANEL_VIEWPORT_MARGIN_PX`
 * in `computePanelPosition`. See that function's docstring for
 * how the three interact.
 */
export const MAX_PANEL_WIDTH_PX = 420;

/*
 * Padding from the viewport edge when the popover is
 * constrained to fit. Used both as the left-clamp floor and
 * as half of the total margin subtracted from the viewport
 * width when computing the popover's maximum width.
 *
 * Do not inline the literal `12` or `24` anywhere — the two
 * values must stay coupled to this constant. A change here
 * that skipped the width calculation would leave the popover
 * overflowing the viewport by exactly the delta.
 */
export const PANEL_VIEWPORT_MARGIN_PX = 12;

/* -------------------------------------------------------------------------- */
/* Result row                                                                 */
/* -------------------------------------------------------------------------- */

interface ResultRowProps {
  result: SearchResult;
  index: number;
  selected: boolean;
  active: boolean;
  reducedMotion: boolean;
  id: string;
  onHover: (index: number) => void;
  onSelect: (location: WorldLocation) => void;
  registerRef: (
    index: number,
    element: HTMLButtonElement | null,
  ) => void;
}

function ResultRow({
  result,
  index,
  selected,
  active,
  reducedMotion,
  id,
  onHover,
  onSelect,
  registerRef,
}: ResultRowProps) {
  /*
   * One-minute cadence is fine for the row's stars — the
   * atmosphere itself only changes at hour boundaries, and
   * the star presence is derived from that. The rows are
   * lightweight enough that a minute-cadence subscription
   * does not matter; the hour-cadence in `useAtmosphereVisual`
   * above is the one that reduced the ticker load across the
   * whole app.
   */
  const now = useNow(60_000);

  const atmosphere = useMemo(() => {
    const instant = now ? new Date(now) : new Date();

    return getAtmosphere(
      getDecimalHour(instant, result.location.timezone),
    );
  }, [now, result.location.timezone]);

  const showStars = showsStars(atmosphere);

  /*
   * The accessible name includes the time zone in addition to
   * the city and country. Without it, a screen-reader user
   * tabbing through results hears "Select Tokyo, Japan" and
   * nothing else — the time zone is the app's primary
   * information for that row, and it is right there in the
   * visible layout. Including it in the label makes the
   * accessible name match the visible information.
   */
  const accessibleName = `Select ${result.location.city}, ${result.location.country}, ${result.location.timezone}`;

  return (
    <button
      ref={(element) => registerRef(index, element)}
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      onMouseEnter={() => onHover(index)}
      onClick={() => onSelect(result.location)}
      aria-label={accessibleName}
      className={[
        "group relative isolate flex min-h-[102px] w-full items-center gap-4 overflow-hidden border-b border-white/[0.055] px-4 py-4 text-left last:border-b-0",
        active ? "ring-1 ring-inset ring-white/[0.08]" : "",
      ].join(" ")}
    >
      <SearchRowAtmosphere
        timezone={result.location.timezone}
        iconSize="size-12"
      />

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0 -z-10 bg-black/10
          transition-colors duration-200
          group-hover:bg-black/[0.04]
        "
      />

      {showStars && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-55"
        >
          {Array.from({ length: STARS_PER_ROW }, (_, star) => {
            const left =
              12 + ((index * 17 + star * 23) % 78);
            const top =
              12 + ((index * 11 + star * 19) % 55);

            return (
              <motion.span
                key={`${index}-${star}`}
                className="absolute size-[2px] rounded-full bg-white"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                }}
                animate={{
                  opacity: reducedMotion
                    ? 0.22
                    : [0.12, 0.58, 0.16],
                }}
                transition={{
                  duration: reducedMotion
                    ? 0
                    : 2.8 + star * 0.35,
                  delay: star * 0.3,
                  repeat: reducedMotion ? 0 : Infinity,
                  ease: "easeInOut",
                }}
              />
            );
          })}
        </div>
      )}

      <span
        aria-hidden="true"
        className={[
          "relative z-10 size-1.5 shrink-0 rounded-full transition-all duration-200",
          selected
            ? "bg-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]"
            : "bg-white/25 group-hover:bg-white/50",
        ].join(" ")}
      />

      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold tracking-[-0.015em] text-white">
          {result.location.city}
        </span>

        <span className="mt-1.5 block truncate text-[9px] font-medium uppercase tracking-[0.08em] text-white/45">
          {result.location.country}
        </span>
      </span>

      <span className="relative z-10 hidden max-w-[155px] shrink-0 truncate text-right font-mono text-[8px] tracking-[0.02em] text-white/25 sm:block">
        {result.location.timezone}
      </span>

      {selected ? (
        <Check
          aria-hidden="true"
          className="relative z-10 size-4 shrink-0 text-[var(--accent)]"
          strokeWidth={1.7}
        />
      ) : (
        <ChevronRight
          aria-hidden="true"
          className="
            relative z-10 size-4 shrink-0 -translate-x-1
            text-white/40 opacity-0 transition-all duration-200
            group-hover:translate-x-0 group-hover:opacity-100
          "
          strokeWidth={1.5}
        />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export interface SearchableLocationInputProps {
  selectedLocation: WorldLocation | null;
  onSelect: (location: WorldLocation) => void;
  reducedMotion: boolean;
  placeholder?: string;
  ariaLabel?: string;
  fullWidth?: boolean;
  maxWidthClassName?: string;
}

/* -------------------------------------------------------------------------- */
/* Panel position                                                             */
/* -------------------------------------------------------------------------- */

export interface PanelPosition {
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

/**
 * Compute the mobile panel's fixed position from the trigger
 * button's screen rect.
 *
 * The panel is `position: fixed` so it escapes the chrome
 * row's `pointer-events-none` parent and the short-box
 * clipping trap. Its position is derived from the trigger's
 * `getBoundingClientRect()` each time the panel opens — and
 * again on scroll and resize, because the trigger can move
 * under the panel while it is open (the page can scroll, a
 * keyboard can slide up, the viewport can rotate).
 *
 * ## Width computation
 *
 * The popover's width is:
 *
 *   `min(max(MIN_PANEL_WIDTH_PX, viewportWidth - 2·margin), MAX_PANEL_WIDTH_PX)`
 *
 * Three regimes, depending on the viewport:
 *
 *   1. **Very narrow** (below `MIN_PANEL_WIDTH_PX + 2·margin`) —
 *      the panel is `MIN_PANEL_WIDTH_PX` wide and is allowed
 *      to overflow the viewport horizontally, on the theory
 *      that a legible overflow beats an unusably small panel.
 *
 *   2. **Medium** (between that floor and
 *      `MAX_PANEL_WIDTH_PX + 2·margin`) — the panel fills the
 *      viewport minus a margin on each side.
 *
 *   3. **Wide** — the panel is capped at
 *      `MAX_PANEL_WIDTH_PX`.
 *
 * ## The margin constant is used twice
 *
 * `PANEL_VIEWPORT_MARGIN_PX` appears in the width formula (as
 * `2·margin` on the total inset) and in the left-clamp (as the
 * minimum distance from the left edge). These must stay in
 * sync. A change to the constant that missed one of the two
 * uses would produce a panel that overflows by exactly the
 * delta, on the side whose formula had not been updated.
 *
 * The literal `24` must not appear anywhere in this function
 * — its correct value is `2 * PANEL_VIEWPORT_MARGIN_PX`, and
 * spelling it out as a number decouples it from the constant.
 *
 * ## Vertical position
 *
 * The top is the trigger's bottom edge plus 8px. Vertical
 * scroll of the page moves the trigger, so this is recomputed
 * on every `scroll` event while the panel is open.
 *
 * ## Purity
 *
 * The function is pure with respect to its one input — an
 * `HTMLElement` — and the two globals it reads (`innerWidth`
 * and the trigger's rect). It touches no other state, performs
 * no side effects, and returns a plain object. That is what
 * makes it safe to unit-test without rendering a component.
 *
 * @param trigger - The element the panel is anchored to. In
 *   production, this is the icon button. Its
 *   `getBoundingClientRect()` is read once per call.
 */
export function computePanelPosition(
  trigger: HTMLElement,
): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;

  const width = Math.min(
    Math.max(
      MIN_PANEL_WIDTH_PX,
      viewportWidth - 2 * PANEL_VIEWPORT_MARGIN_PX,
    ),
    MAX_PANEL_WIDTH_PX,
  );

  const maxLeft =
    viewportWidth - width - PANEL_VIEWPORT_MARGIN_PX;
  const left = Math.max(
    PANEL_VIEWPORT_MARGIN_PX,
    Math.min(rect.left, maxLeft),
  );

  return {
    top: rect.bottom + 8,
    left,
    width,
  };
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A searchable combobox for picking a city.
 *
 * ## Mobile (< sm)
 *
 * Collapsed: a single magnifying-glass button. Tapping opens
 * a panel anchored beneath the icon containing the search
 * input and a scrollable list of results.
 *
 * The panel uses `position: fixed` on mobile so it escapes
 * the chrome row's `pointer-events-none` parent and its
 * `absolute`-inside-a-short-box positioning trap. Its top and
 * left are set at mount time from the icon button's screen
 * rect via a ref, so it appears directly under the icon. Its
 * width is `min(100vw - 24px, 420px)` so it always fits the
 * viewport.
 *
 * The panel re-measures on scroll and resize so it stays
 * anchored to the trigger as the page moves underneath it.
 *
 * Scrolling: the panel's scroll container has explicit
 * `touch-action: pan-y` and `overscroll-contain` so mobile
 * browsers route vertical drags to it rather than to the
 * globe canvas beneath.
 *
 * ## Desktop (>= sm)
 *
 * Input always visible, dropdown anchored beneath it. Same
 * data flow; only the positioning differs.
 *
 * ## ARIA: combobox + listbox
 *
 * Both the mobile and desktop inputs carry `role="combobox"`.
 * The popup (mobile panel or desktop dropdown) carries
 * `role="listbox"` and its rows carry `role="option"`. The
 * input's `aria-expanded` reports whether the popup is open,
 * `aria-controls` points at the popup's id, and
 * `aria-activedescendant` points at the highlighted option's
 * id while the user arrows through results.
 *
 * This is the standard combobox pattern. Putting
 * `aria-expanded` on a bare `<input type="search">` (the
 * previous shape) is invalid ARIA — the implicit `textbox`
 * role does not support `aria-expanded` — and it is what
 * `jsx-a11y/role-supports-aria-props` was flagging. Marking
 * the input as a combobox makes every one of those attributes
 * valid.
 */
export default function SearchableLocationInput({
  selectedLocation,
  onSelect,
  reducedMotion,
  placeholder = "Search city or country",
  ariaLabel = "Search a city, country or timezone",
  fullWidth = true,
  maxWidthClassName = "max-w-2xl",
}: SearchableLocationInputProps) {
  const [value, setValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [panelPosition, setPanelPosition] =
    useState<PanelPosition | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /*
   * Stable ids for the combobox / listbox relationship. The
   * `useId` prefix is unique per instance, so two searchable
   * inputs on one page cannot collide.
   */
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionIdPrefix = `${baseId}-option`;

  const results = useMemo(() => searchLocations(value), [value]);

  /*
   * Reset the highlighted index whenever the query changes.
   *
   * Implemented as a render-time adjustment (React's
   * "storing information from previous renders" pattern)
   * rather than a `useEffect` that would trigger a cascading
   * re-render — which is what `react-hooks/set-state-in-effect`
   * flags.
   *
   * The `itemRefs` array is deliberately not cleared here:
   * refs cannot be mutated during render (`react-hooks/refs`
   * flags that). Stale entries beyond the current result
   * count are unreachable — nothing indexes past
   * `results.length - 1` — and entries within range are
   * overwritten by `registerRef` as each row renders, or
   * cleared by React via a `null` ref callback when a row
   * unmounts.
   */
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setActiveIndex(-1);
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      const insideWrapper =
        wrapperRef.current?.contains(target) ?? false;
      const insidePanel =
        target instanceof Element &&
        target.closest('[data-search-panel="true"]') !== null;

      if (!insideWrapper && !insidePanel) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (
      event: globalThis.KeyboardEvent,
    ): void => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  /*
   * Anchor the mobile panel to the trigger button, and re-anchor
   * it whenever the trigger moves on screen.
   *
   * Three reasons the trigger can move while the panel is open:
   *
   *   1. **Page scroll.** The panel is `position: fixed`, so it
   *      does not scroll with the page, but the trigger does.
   *      Without re-measuring, the panel visually detaches from
   *      its anchor as the user scrolls.
   *
   *   2. **Viewport resize.** Rotating a phone, resizing a
   *      desktop window, or showing/hiding the mobile keyboard
   *      changes the trigger's position and the available
   *      width. The panel width was computed against the old
   *      viewport and is now wrong.
   *
   *   3. **Layout shifts.** Fonts loading, dynamic content
   *      above the trigger — anything that changes the trigger's
   *      position without a resize.
   *
   * `scroll` is captured in the capture phase so the listener
   * fires for scrolls of any ancestor scroll container, not
   * just the window.
   *
   * The initial measurement is deferred by one frame so the
   * trigger button has painted. Re-measurements are synchronous
   * with the scroll/resize event — no additional deferral
   * needed.
   */
  useEffect(() => {
    if (!isOpen) return;

    const measure = (): void => {
      const button = iconButtonRef.current;
      if (!button) return;
      setPanelPosition(computePanelPosition(button));
    };

    const frame = requestAnimationFrame(() => {
      measure();
      inputRef.current?.focus();
    });

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex < 0) return;

    itemRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex]);

  const selectLocation = useCallback(
    (location: WorldLocation): void => {
      onSelect(location);
      setValue("");
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    },
    [onSelect],
  );

  const registerRef = useCallback(
    (
      index: number,
      element: HTMLButtonElement | null,
    ): void => {
      itemRefs.current[index] = element;
    },
    [],
  );

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ): void => {
    if (!isOpen) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter"
      ) {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex((current) => {
        if (!results.length) return -1;
        return current >= results.length - 1
          ? 0
          : current + 1;
      });

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((current) => {
        if (!results.length) return -1;
        return current <= 0
          ? results.length - 1
          : current - 1;
      });

      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (results.length) setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (results.length) {
        setActiveIndex(results.length - 1);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      const result = results[activeIndex] ?? results[0];

      if (result) {
        selectLocation(result.location);
      }

      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const showFullLine = isOpen || value.length > 0;

  const hasResults = results.length > 0;
  const hasNoMatches =
    value.trim().length > 0 && results.length === 0;

  /*
   * The id of the currently-highlighted option, or `undefined`
   * when no option is highlighted or the popup is closed. This
   * is what the input's `aria-activedescendant` points at.
   */
  const activeDescendantId =
    isOpen && activeIndex >= 0 && results[activeIndex]
      ? `${optionIdPrefix}-${results[activeIndex].location.id}`
      : undefined;

  return (
    <div
      ref={wrapperRef}
      className={[
        "relative",
        fullWidth ? "w-full" : "",
        maxWidthClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        ref={iconButtonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        className="
          flex size-9 items-center justify-center
          rounded-full border border-white/[0.14] bg-black/50
          text-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.32)]
          backdrop-blur-xl
          transition-colors duration-200
          hover:bg-white/[0.10] hover:text-white
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-white/50
          sm:hidden
        "
      >
        <Search
          aria-hidden="true"
          className="size-4"
          strokeWidth={1.7}
        />
      </button>

      <AnimatePresence>
        {isOpen && panelPosition && (
          <motion.div
            data-search-panel="true"
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
            transition={{
              duration: reducedMotion ? 0 : 0.18,
              ease: EASE,
            }}
            style={{
              position: "fixed",
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
            }}
            className="
              z-[200]
              flex max-h-[min(70dvh,560px)] flex-col
              overflow-hidden rounded-2xl
              border border-white/[0.08] bg-black
              shadow-[0_28px_80px_rgba(0,0,0,0.55)]
              sm:hidden
            "
          >
            <div className="group relative shrink-0 border-b border-white/[0.1] px-4">
              <div className="flex items-center gap-3">
                <Search
                  aria-hidden="true"
                  className="
                    size-[17px] shrink-0 text-white/30
                    transition-colors duration-300
                    group-focus-within:text-white/60
                  "
                  strokeWidth={1.5}
                />

                <input
                  ref={inputRef}
                  type="search"
                  role="combobox"
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  aria-label={ariaLabel}
                  aria-expanded={isOpen}
                  aria-controls={listboxId}
                  aria-activedescendant={activeDescendantId}
                  aria-autocomplete="list"
                  autoComplete="off"
                  spellCheck={false}
                  className="
                    h-12 min-w-0 flex-1 bg-transparent text-[11px]
                    font-bold uppercase tracking-[0.12em] text-white
                    outline-none placeholder:text-white/25
                  "
                />

                <button
                  type="button"
                  onClick={() => {
                    if (value) {
                      setValue("");
                      inputRef.current?.focus();
                    } else {
                      setIsOpen(false);
                      setActiveIndex(-1);
                    }
                  }}
                  aria-label={value ? "Clear search" : "Close search"}
                  className="
                    flex size-7 shrink-0 items-center justify-center
                    rounded-full text-white/30 transition-all duration-200
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
              </div>

              <motion.span
                aria-hidden="true"
                className="
                  absolute bottom-0 left-0 h-px bg-[var(--accent)]
                  shadow-[0_0_10px_var(--accent-glow)]
                "
                initial={{
                  width: "8%",
                  opacity: 0.4,
                }}
                animate={{
                  width: showFullLine ? "100%" : "8%",
                  opacity: showFullLine ? 1 : 0.4,
                }}
                transition={{
                  duration: reducedMotion ? 0 : 0.35,
                  ease: EASE,
                }}
              />
            </div>

            <div
              className="
                min-h-0 flex-1 overflow-y-auto
                [touch-action:pan-y]
                [overscroll-behavior:contain]
                [scrollbar-color:rgba(255,255,255,0.16)_transparent]
                [scrollbar-width:thin]
                [&::-webkit-scrollbar]:w-1
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb]:bg-white/15
                [&::-webkit-scrollbar-thumb:hover]:bg-white/25
              "
            >
              {hasResults &&
                results.map((result, index) => (
                  <ResultRow
                    key={result.location.id}
                    id={`${optionIdPrefix}-${result.location.id}`}
                    result={result}
                    index={index}
                    selected={
                      selectedLocation?.id ===
                      result.location.id
                    }
                    active={index === activeIndex}
                    reducedMotion={reducedMotion}
                    onHover={setActiveIndex}
                    onSelect={selectLocation}
                    registerRef={registerRef}
                  />
                ))}

              {hasNoMatches && (
                <div className="flex items-center gap-3 px-4 py-5">
                  <Search
                    aria-hidden="true"
                    className="size-4 text-white/20"
                    strokeWidth={1.4}
                  />

                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
                    No matching location
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hidden sm:block">
        <div className="group relative border-b border-white/[0.1] transition-colors duration-300">
          <div className="flex items-center gap-3">
            <Search
              aria-hidden="true"
              className="
                size-[17px] shrink-0 text-white/30
                transition-colors duration-300
                group-focus-within:text-white/60
              "
              strokeWidth={1.5}
            />

            <input
              type="search"
              role="combobox"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={ariaLabel}
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendantId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className="
                h-12 min-w-0 flex-1 bg-transparent text-[11px]
                font-bold uppercase tracking-[0.12em] text-white
                outline-none placeholder:text-white/25
              "
            />

            {value && (
              <button
                type="button"
                onClick={() => {
                  setValue("");
                }}
                aria-label="Clear search"
                className="
                  flex size-7 shrink-0 items-center justify-center
                  rounded-full text-white/30 transition-all duration-200
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
            initial={{
              width: "8%",
              opacity: 0.4,
            }}
            animate={{
              width: showFullLine ? "100%" : "8%",
              opacity: showFullLine ? 1 : 0.4,
            }}
            transition={{
              duration: reducedMotion ? 0 : 0.35,
              ease: EASE,
            }}
          />
        </div>

        <AnimatePresence>
          {isOpen && hasResults && (
            <motion.div
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              initial={{
                opacity: 0,
                y: reducedMotion ? 0 : 8,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: reducedMotion ? 0 : 6,
              }}
              transition={{
                duration: reducedMotion ? 0 : 0.22,
                ease: EASE,
              }}
              className="
                absolute left-0 right-0 top-[calc(100%+8px)] z-[100]
                max-h-[min(430px,calc(100dvh-220px))]
                overflow-x-hidden overflow-y-auto
                rounded-2xl border border-white/[0.08] bg-black
                shadow-[0_28px_80px_rgba(0,0,0,0.42)]
                [scrollbar-color:rgba(255,255,255,0.16)_transparent]
                [scrollbar-width:thin]
                [&::-webkit-scrollbar]:w-1
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb]:bg-white/15
                [&::-webkit-scrollbar-thumb:hover]:bg-white/25
              "
            >
              {results.map((result, index) => (
                <ResultRow
                  key={result.location.id}
                  id={`${optionIdPrefix}-${result.location.id}`}
                  result={result}
                  index={index}
                  selected={
                    selectedLocation?.id === result.location.id
                  }
                  active={index === activeIndex}
                  reducedMotion={reducedMotion}
                  onHover={setActiveIndex}
                  onSelect={selectLocation}
                  registerRef={registerRef}
                />
              ))}
            </motion.div>
          )}

          {isOpen && hasNoMatches && (
            <motion.div
              initial={{
                opacity: 0,
                y: reducedMotion ? 0 : 5,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.2,
                ease: EASE,
              }}
              className="
                absolute left-0 right-0 top-[calc(100%+8px)] z-[100]
                max-h-[min(430px,calc(100dvh-220px))]
                rounded-2xl border border-white/[0.08] bg-black
                px-4 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.38)]
              "
            >
              <div className="flex items-center gap-3">
                <Search
                  aria-hidden="true"
                  className="size-4 text-white/20"
                  strokeWidth={1.4}
                />

                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
                  No matching location
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}