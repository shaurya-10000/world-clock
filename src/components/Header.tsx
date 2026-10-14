"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  Clock3,
  Globe2,
  Menu as MenuIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { emit } from "@/lib/events";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type MobileView = "globe" | "zones";

/**
 * Literal union of every navigation label, derived from the
 * `NAVIGATION` array.
 *
 * Deriving the type from the array makes the array the single
 * source of truth: adding a new entry to `NAVIGATION` extends
 * this union automatically, and every consumer that switches
 * on the label is checked by the compiler against the new
 * value. A hand-maintained union would drift.
 */
type NavigationLabel = (typeof NAVIGATION)[number]["label"];

interface HeaderProps {
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The three desktop navigation items, in render order.
 *
 * `as const` is load-bearing: it freezes the array to a tuple
 * of literal objects, which is what lets `NavigationLabel` be
 * a literal union of the three strings rather than `string`.
 */
const NAVIGATION = [
  { label: "Explore", href: "#explore" },
  { label: "Time Zones", href: "#time-zones" },
  { label: "Cities", href: "#cities" },
] as const;

/** Shared easing for every header animation. */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The section IDs the header observes for scroll-driven
 * active-state tracking.
 *
 * ## Why this is a separate list
 *
 * `NAVIGATION` includes an entry for `"Cities"` because that
 * item is rendered in the desktop nav, but `"Cities"` is not
 * a scroll target — it opens a drawer. Observing it would
 * make the indicator jump to `"Cities"` when the user
 * happened to be scrolled past `#cities`, which is not a
 * section a user scrolls *to* in normal use.
 *
 * The two lists are deliberately different shapes: this one
 * is a list of *observable scroll targets*; `NAVIGATION` is a
 * list of *renderable nav items*. Do not merge them.
 */
const OBSERVED_SECTION_IDS = ["explore", "time-zones"] as const;

/**
 * Offset applied to the viewport top when measuring section
 * visibility, in pixels.
 *
 * Matches the sticky header's height (`h-[76px]`) so a section
 * whose top is under the header is not treated as the visible
 * start. A section that has scrolled behind the header is
 * effectively "past" from the user's perspective, and this
 * offset makes the intersection observer agree.
 */
const SCROLL_ROOT_MARGIN = "-76px 0px 0px 0px";

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

function Brand() {
  return (
    <motion.a
      href="/"
      aria-label="World Clock home"
      className="
        group inline-flex select-none items-center gap-3
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--foreground)]/30
        focus-visible:ring-offset-4
        focus-visible:ring-offset-[var(--background)]
      "
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.05, ease: EASE }}
    >
      <span
        aria-hidden="true"
        className="relative flex size-2 items-center justify-center"
      >
        <span
          className="
            absolute size-2 rounded-full bg-[var(--foreground)]
            transition-transform duration-300 ease-out
            group-hover:scale-125
          "
        />

        <span
          className="
            absolute size-4 rounded-full border
            border-[var(--foreground)]/15 opacity-0
            transition-all duration-500 ease-out
            group-hover:scale-125 group-hover:opacity-100
          "
        />
      </span>

      <span className="text-[15px] font-medium tracking-[-0.025em] text-[var(--foreground)] sm:text-base">
        World Clock
      </span>
    </motion.a>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop navigation item                                                    */
/* -------------------------------------------------------------------------- */

interface NavigationItemProps {
  /** Text shown in the item. */
  label: NavigationLabel;
  /** Hash target for anchor items; ignored for the Cities button. */
  href: string;
  active: boolean;
  delay: number;
  onClick: () => void;
}

function NavigationItem({
  label,
  href,
  active,
  delay,
  onClick,
}: NavigationItemProps) {
  const isCities = label === "Cities";

  const sharedClassName = `
    group relative inline-flex items-center py-2
    text-[12px] font-medium tracking-[-0.01em]
    text-[var(--muted)] transition-colors duration-300
    hover:text-[var(--foreground)]
    focus-visible:outline-none focus-visible:ring-2
    focus-visible:ring-[var(--foreground)]/25
    focus-visible:ring-offset-4
    focus-visible:ring-offset-[var(--background)]
    sm:text-[13px]
  `;

  const indicator = (
    <>
      <span
        aria-hidden="true"
        className="
          absolute -bottom-0.5 left-0 h-px w-full origin-left
          scale-x-0 bg-[var(--foreground)] opacity-40
          transition-transform duration-300
          ease-[cubic-bezier(0.16,1,0.3,1)]
          group-hover:scale-x-100
        "
      />

      <AnimatePresence>
        {active && (
          <motion.span
            aria-hidden="true"
            layoutId="world-clock-nav-indicator"
            className="
              absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2
              rounded-full bg-[var(--foreground)]
            "
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 0.65, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
          />
        )}
      </AnimatePresence>
    </>
  );

  const motionProps = {
    initial: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.65, delay, ease: EASE },
  } as const;

  if (isCities) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className={sharedClassName}
        {...motionProps}
      >
        <span>{label}</span>
        {indicator}
      </motion.button>
    );
  }

  return (
    <motion.a
      href={href}
      onClick={onClick}
      className={sharedClassName}
      {...motionProps}
    >
      <span>{label}</span>
      {indicator}
    </motion.a>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop navigation                                                         */
/* -------------------------------------------------------------------------- */

interface NavigationProps {
  active: NavigationLabel;
  onNavigate: (label: NavigationLabel) => void;
  onOpenCities: () => void;
}

function Navigation({
  active,
  onNavigate,
  onOpenCities,
}: NavigationProps) {
  return (
    <nav
      aria-label="Primary navigation"
      className="hidden items-center gap-7 md:flex lg:gap-9"
    >
      {NAVIGATION.map((item, index) => {
        const isActive = active === item.label;
        const isCities = item.label === "Cities";

        return (
          <NavigationItem
            key={item.href}
            label={item.label}
            href={item.href}
            active={isActive}
            delay={0.12 + index * 0.06}
            onClick={() => {
              onNavigate(item.label);
              if (isCities) onOpenCities();
            }}
          />
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile actions                                                             */
/* -------------------------------------------------------------------------- */

interface MobileActionsProps {
  view: MobileView;
  onViewChange: (view: MobileView) => void;
  onOpenCities: () => void;
}

function MobileActions({
  view,
  onViewChange,
  onOpenCities,
}: MobileActionsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
      className="
        flex items-center rounded-full border
        border-[var(--border)] bg-[var(--surface)] p-1
        shadow-[0_8px_30px_rgba(0,0,0,0.04)]
        backdrop-blur-xl
      "
    >
      {/*
       * Two mutually exclusive mode buttons, grouped under a
       * radiogroup. This is the correct ARIA pattern for
       * "pick one of N states" — the previous `aria-pressed`
       * on a plain button is for independent toggles, not a
       * mode selector.
       */}
      <div
        role="radiogroup"
        aria-label="Mobile view mode"
        className="flex items-center"
      >
        <MobileModeButton
          icon={Globe2}
          label="Globe"
          active={view === "globe"}
          onClick={() => onViewChange("globe")}
        />

        <MobileModeButton
          icon={Clock3}
          label="Zones"
          active={view === "zones"}
          onClick={() => onViewChange("zones")}
        />
      </div>

      <MobileActionButton
        icon={MenuIcon}
        label="Cities"
        onClick={onOpenCities}
      />
    </motion.div>
  );
}

interface MobileModeButtonProps {
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

function MobileModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: MobileModeButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`
        relative flex h-9 items-center gap-2 rounded-full
        px-3 text-[10px] font-medium tracking-[0.01em]
        transition-colors duration-200
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--foreground)]/25
        ${
          active
            ? "text-[var(--foreground)]"
            : "text-[var(--muted)]"
        }
      `}
    >
      {active && (
        <motion.span
          layoutId="mobile-header-mode"
          aria-hidden="true"
          className="
            absolute inset-0 rounded-full
            bg-[var(--foreground)]/[0.07]
          "
          transition={{ duration: 0.25, ease: EASE }}
        />
      )}

      <Icon
        aria-hidden="true"
        className="relative z-10 size-3.5"
        strokeWidth={1.6}
      />

      <span className="relative z-10">{label}</span>
    </button>
  );
}

interface MobileActionButtonProps {
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
  label: string;
  onClick: () => void;
}

function MobileActionButton({
  icon: Icon,
  label,
  onClick,
}: MobileActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="
        relative flex h-9 items-center gap-2 rounded-full
        px-3 text-[10px] font-medium tracking-[0.01em]
        text-[var(--muted)] transition-colors duration-200
        hover:text-[var(--foreground)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--foreground)]/25
      "
    >
      <Icon
        aria-hidden="true"
        className="size-3.5"
        strokeWidth={1.6}
      />

      <span>{label}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Scroll-driven active section hook                                          */
/* -------------------------------------------------------------------------- */

/**
 * Track which page section is currently active based on
 * scroll position.
 *
 * ## Algorithm
 *
 *   1. An `IntersectionObserver` maintains a set of
 *      *candidates* — sections currently in the viewport.
 *
 *   2. On every scroll event (throttled through
 *      `requestAnimationFrame`), we pick the candidate whose
 *      top edge is closest to — but not below — the viewport
 *      top. That is the section the user is "in" even when
 *      multiple sections are partially visible.
 *
 *   3. If no candidate has its top at or above the viewport
 *      top — the user is above every observed section —
 *      fall back to the candidate with the smallest positive
 *      top.
 *
 *   4. If nothing is intersecting at all, the active section
 *      is left unchanged rather than cleared.
 *
 * ## Why this tie-break rule
 *
 * The alternative — pick the section with the largest
 * intersecting area — reads naturally on paper but behaves
 * badly at section boundaries. When two sections are each
 * ~50% visible, the "largest area" rule flips the active
 * state at the exact midpoint of the boundary, producing
 * visible flicker as the user scrolls past. The
 * "closest-to-viewport-top" rule prefers the section the user
 * has already scrolled *into*, which is what a fixed
 * navigation indicator is supposed to express. It changes
 * state once per section transition, not once per pixel.
 *
 * ## Disabling on mobile
 *
 * The hook takes an `enabled` flag. On mobile the sections
 * are not stacked — the user toggles between `globe` and
 * `zones` — so scroll position is not meaningful. Passing
 * `false` skips all setup and leaves the internal state at
 * its default.
 *
 * @param enabled  When `false`, the hook does nothing.
 */
function useScrollActiveSection(
  enabled: boolean,
): [NavigationLabel, (label: NavigationLabel) => void] {
  const [active, setActive] = useState<NavigationLabel>("Explore");

  /*
   * The set of section IDs currently intersecting the
   * viewport. Held in a ref rather than state because
   * changing it does not itself need to trigger a render —
   * it only feeds into the scroll handler.
   */
  const candidatesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const sections = OBSERVED_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            candidatesRef.current.add(entry.target.id);
          } else {
            candidatesRef.current.delete(entry.target.id);
          }
        }
      },
      {
        rootMargin: SCROLL_ROOT_MARGIN,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const section of sections) {
      observer.observe(section);
    }

    /*
     * Pick the candidate with the closest-to-zero top that
     * is still at or above the viewport top. Recomputed on
     * a `requestAnimationFrame` so a burst of scroll events
     * does one layout read.
     */
    let rafId: number | null = null;

    const pickActive = (): void => {
      rafId = null;

      let bestId: string | null = null;
      let bestDistance = Infinity;

      for (const id of candidatesRef.current) {
        const el = document.getElementById(id);
        if (!el) continue;

        const top = el.getBoundingClientRect().top;

        if (top <= 0 && Math.abs(top) < bestDistance) {
          bestDistance = Math.abs(top);
          bestId = id;
        }
      }

      /*
       * No candidate is at or above the viewport top — the
       * user is above every observed section. Pick the one
       * with the smallest positive top.
       *
       * `bestDistance` is still `Infinity` here because the
       * loop above only assigns inside a `top <= 0` guard.
       * Reset it explicitly so the intent is obvious and a
       * future refactor cannot accidentally leak a value.
       */
      if (bestId === null) {
        bestDistance = Infinity;

        for (const id of candidatesRef.current) {
          const el = document.getElementById(id);
          if (!el) continue;

          const top = el.getBoundingClientRect().top;

          if (top < bestDistance) {
            bestDistance = top;
            bestId = id;
          }
        }
      }

      if (bestId !== null) {
        const match = NAVIGATION.find(
          (item) => item.href === `#${bestId}`,
        );
        if (match) setActive(match.label);
      }
    };

    const handleScroll = (): void => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(pickActive);
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    /* Initial pick so a page loaded at a scroll offset is
       correctly labeled before the first scroll. */
    handleScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  return [active, setActive];
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

export default function Header({
  mobileView,
  onMobileViewChange,
}: HeaderProps) {
  /*
   * Detect the desktop breakpoint so scroll tracking and the
   * mobile view-mode state do not fight each other. On mobile
   * the scroll hook is disabled entirely.
   */
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");

    const update = (): void => {
      setIsDesktop(mql.matches);
    };

    update();
    mql.addEventListener("change", update);

    return () => {
      mql.removeEventListener("change", update);
    };
  }, []);

  const [scrollActive, setScrollActive] =
    useScrollActiveSection(isDesktop);

  /*
   * Hash-change listener.
   *
   * Runs in parallel with the scroll hook. When the user
   * clicks a nav link, the hash changes immediately and the
   * browser begins a smooth scroll to the target section. The
   * scroll animation takes ~500ms. Without this listener the
   * indicator would stay on the old section until the scroll
   * settles and the intersection observer catches up — a
   * visible lag of half a second.
   *
   * This listener snaps the indicator to the clicked section
   * on the next animation frame, before the scroll begins.
   * When the scroll then updates the observer, it agrees with
   * what the user already sees.
   */
  useEffect(() => {
    const syncWithHash = (): void => {
      const hash = window.location.hash;

      const matched = NAVIGATION.find(
        (item) => item.href === hash,
      );

      if (matched) setScrollActive(matched.label);
    };

    syncWithHash();
    window.addEventListener("hashchange", syncWithHash);

    return () => {
      window.removeEventListener("hashchange", syncWithHash);
    };
  }, [setScrollActive]);

  /*
   * The active navigation item.
   *
   * On desktop it comes from scroll position; on mobile, from
   * `mobileView`, since the two primary surfaces are toggled
   * rather than scrolled. `"Cities"` is never active: it is a
   * button that opens a drawer, not a scroll target, and
   * highlighting it would mislead the user into thinking they
   * had navigated to a section.
   */
  const active: NavigationLabel = isDesktop
    ? scrollActive
    : mobileView === "zones"
      ? "Time Zones"
      : "Explore";

  const openCities = useCallback(() => {
    emit("cities:open", undefined);
  }, []);

  return (
    <header
      className="
        sticky top-0 z-50 w-full border-b border-white/[0.06]
        bg-[var(--background)]/70 backdrop-blur-xl
      "
    >
      <div
        className="
          mx-auto flex h-[76px] max-w-[1600px] items-center
          justify-between px-5 sm:px-8 lg:px-10 xl:px-16
        "
      >
        <div>
          <Brand />
        </div>

        <div>
          <Navigation
            active={active}
            onNavigate={setScrollActive}
            onOpenCities={openCities}
          />

          <div className="md:hidden">
            <MobileActions
              view={mobileView}
              onViewChange={onMobileViewChange}
              onOpenCities={openCities}
            />
          </div>
        </div>
      </div>
    </header>
  );
}