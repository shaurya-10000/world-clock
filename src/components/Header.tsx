"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
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
 * `NAVIGATION` array so the array stays the single source of
 * truth.
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
 * `as const` is load-bearing: it makes `NavigationLabel` a
 * literal union rather than `string`.
 */
const NAVIGATION = [
  { label: "Explore", href: "#explore" },
  { label: "Time Zones", href: "#time-zones" },
  { label: "Cities", href: "#cities" },
] as const;

/** Shared easing for every header animation. */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Section IDs observed for scroll-driven active-state tracking.
 * `"Cities"` is deliberately absent: it opens a drawer and is
 * not a scroll target. Do not merge this with `NAVIGATION`.
 */
const OBSERVED_SECTION_IDS = ["explore", "time-zones"] as const;

/**
 * Viewport-top offset used when measuring section visibility.
 * Matches the sticky header height (`h-[76px]`).
 */
const SCROLL_ROOT_MARGIN = "-76px 0px 0px 0px";

/**
 * Brand colours.
 *
 * The star is a warm gold (a star at dusk). The wordmark
 * sweeps gold -> rose -> sky on hover, which reads as a day
 * moving across time zones: sunrise, sunset, night.
 */
const STAR_COLOR = "#f6b93b";
const STAR_GLOW = "246, 185, 59";
const WORDMARK_SWEEP =
  "linear-gradient(90deg, #ffd27a 0%, #ff8fb1 50%, #8fb8ff 100%)";

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Four-point glowing star.
 *
 * Three layers:
 *   1. a blurred radial halo that brightens and grows on hover
 *   2. the star itself, which turns a quarter-turn on hover
 *   3. a slow idle twinkle (disabled for reduced-motion users)
 *
 * Hover state comes from the parent via the `rest` / `hover`
 * variant labels, so the star and the wordmark react together.
 */
function StarMark({ twinkle }: { twinkle: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex size-7 items-center justify-center"
    >
      <motion.span
        className="absolute inset-0 rounded-full blur-md"
        style={{
          background: `radial-gradient(circle, rgba(${STAR_GLOW},0.6) 0%, rgba(${STAR_GLOW},0) 70%)`,
        }}
        variants={{
          rest: { opacity: 0.55, scale: 1 },
          hover: { opacity: 1, scale: 1.45 },
        }}
        transition={{ duration: 0.5, ease: EASE }}
      />

      <motion.span
        className="relative flex items-center justify-center"
        animate={
          twinkle
            ? { opacity: [1, 0.72, 1], scale: [1, 0.92, 1] }
            : undefined
        }
        transition={
          twinkle
            ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
            : undefined
        }
      >
        <motion.svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[18px]"
          style={{
            color: STAR_COLOR,
            filter: `drop-shadow(0 0 5px rgba(${STAR_GLOW},0.85))`,
          }}
          variants={{
            rest: { rotate: 0, scale: 1 },
            hover: { rotate: 90, scale: 1.18 },
          }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <path
            fill="currentColor"
            d="M12 1.5C12.9 7.5 16.5 11.1 22.5 12C16.5 12.9 12.9 16.5 12 22.5C11.1 16.5 7.5 12.9 1.5 12C7.5 11.1 11.1 7.5 12 1.5Z"
          />
        </motion.svg>
      </motion.span>
    </span>
  );
}

function Brand() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.a
      href="/"
      aria-label="World Clock home"
      className="
        group inline-flex select-none items-center rounded-md
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--foreground)]/30
        focus-visible:ring-offset-4
        focus-visible:ring-offset-[var(--background)]
      "
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.05, ease: EASE }}
    >
      {/* Variant labels flow down to the star and the wordmark. */}
      <motion.span
        className="inline-flex items-center gap-2.5"
        initial="rest"
        animate="rest"
        whileHover="hover"
      >
        <StarMark twinkle={!reduceMotion} />

        {/*
         * Two copies of the text stacked on top of each other.
         * The plain one is what you see normally. On hover the
         * plain one fades out and the colour one fades in; on
         * mouse-leave it fades back. Pure CSS, driven by the
         * `group` class on the link, so it also works on
         * keyboard focus.
         */}
        <span className="relative text-[15px] font-medium tracking-[-0.025em] sm:text-base">
          <span
            className="
              text-[var(--foreground)] transition-opacity duration-500
              group-hover:opacity-0 group-focus-visible:opacity-0
            "
          >
            World Clock
          </span>

          <span
            aria-hidden="true"
            className="
              absolute inset-0 bg-clip-text text-transparent opacity-0
              transition-opacity duration-500
              group-hover:opacity-100 group-focus-visible:opacity-100
            "
            style={{
              backgroundImage: WORDMARK_SWEEP,
              WebkitBackgroundClip: "text",
            }}
          >
            World Clock
          </span>
        </span>
      </motion.span>
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
    transition-colors duration-300
    ${active ? "text-[var(--foreground)]" : "text-[var(--muted)]"}
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
              rounded-full
            "
            style={{
              backgroundColor: STAR_COLOR,
              boxShadow: `0 0 8px 1px rgba(${STAR_GLOW},0.8)`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
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
      aria-current={active ? "location" : undefined}
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
      {/* Mutually exclusive modes: a radiogroup is the right ARIA pattern. */}
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
 * An `IntersectionObserver` keeps a set of candidate sections
 * in the viewport. On each scroll (throttled via
 * `requestAnimationFrame`) we pick the candidate whose top
 * edge is closest to, but not below, the viewport top. If none
 * is at or above the top, we fall back to the smallest positive
 * top. If nothing intersects, the active section is unchanged.
 *
 * "Closest to viewport top" is preferred over "largest visible
 * area" because the latter flickers at section boundaries.
 *
 * @param enabled  When `false`, the hook does nothing (mobile).
 */
function useScrollActiveSection(
  enabled: boolean,
): [NavigationLabel, (label: NavigationLabel) => void] {
  const [active, setActive] = useState<NavigationLabel>("Explore");

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

      /* Above every observed section: take the smallest positive top. */
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

    /* Initial pick so a page loaded at an offset is labeled correctly. */
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

  /*
   * Once the page has scrolled, the header gets a visible
   * border and a more opaque background so content passing
   * underneath stays legible. At the very top it is nearly
   * invisible, letting the hero breathe.
   */
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = (): void => {
      setScrolled(window.scrollY > 8);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });

    return () => {
      window.removeEventListener("scroll", update);
    };
  }, []);

  const [scrollActive, setScrollActive] =
    useScrollActiveSection(isDesktop);

  /*
   * Snap the indicator to the clicked section immediately,
   * instead of waiting ~500ms for the smooth scroll to settle.
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
   * Desktop: active item comes from scroll position.
   * Mobile: from `mobileView`. "Cities" is never active since
   * it opens a drawer rather than navigating to a section.
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
      className={`
        sticky top-0 z-50 w-full border-b backdrop-blur-xl
        transition-[background-color,border-color] duration-500
        ${
          scrolled
            ? "border-[var(--border)] bg-[var(--background)]/85"
            : "border-transparent bg-[var(--background)]/40"
        }
      `}
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