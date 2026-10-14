"use client";

import { CalendarClock, Check } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AstronomicalEventId,
  AstronomicalEventOption,
} from "./useAstronomicalEventPicker";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The ARIA role of the popup. Used both as the value of the
 * popup's `role` attribute and as the value of the trigger's
 * `aria-haspopup` attribute. Keeping them in sync via one
 * constant is what prevents the "trigger promises a menu,
 * popup is a listbox" class of accessibility bug.
 */
const POPUP_ROLE = "listbox";

/**
 * The keyframes for the picker's open animation.
 *
 * Inlined in a `<style>` tag rather than added to
 * `globals.css` because the animation is used by exactly one
 * component. The name is prefixed with `world-clock-` to
 * avoid colliding with any other `picker-in` keyframe that
 * might be introduced by a dependency or a sibling
 * component. React deduplicates identical `<style>` tags
 * across multiple instances of this component, so mounting
 * the picker twice does not produce duplicate rules.
 */
const PICKER_ANIMATION_STYLES = `
  @keyframes world-clock-picker-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

/* -------------------------------------------------------------------------- */
/* Trigger label                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Compute the label shown on the trigger button.
 *
 * When no override is active, the label is the default
 * "Astronomy". When an override is active, it is the *label
 * of the active preset* — so the trigger itself tells the
 * user what they are viewing without requiring them to open
 * the dropdown. This is why the active-preset label is
 * looked up from the `events` array rather than duplicated.
 *
 * Exported for unit testing.
 */
export function getTriggerLabel(
  events: readonly AstronomicalEventOption[],
  activeEventId: AstronomicalEventId | null,
): string {
  if (activeEventId === null) return "Astronomy";

  const active = events.find((event) => event.id === activeEventId);
  return active?.label ?? "Astronomy";
}

/* -------------------------------------------------------------------------- */
/* Trigger                                                                    */
/* -------------------------------------------------------------------------- */

interface TriggerProps {
  readonly label: string;
  readonly isOpen: boolean;
  readonly onClick: () => void;
  readonly onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => void;
  readonly buttonRef: React.RefObject<HTMLButtonElement | null>;
  readonly id: string;
  readonly popupId: string;
}

/**
 * The trigger button.
 *
 * The accessible name combines the static concept
 * ("Astronomical events") with the active preset, so a
 * screen-reader user hears "Astronomical events, Next
 * solstice" when a preset is active. Keeping the static
 * prefix is what makes the button discoverable by its
 * purpose; appending the active label is what makes it
 * reflect current state.
 *
 * ## `aria-controls`
 *
 * Points at the popup's ID when the popup is open, and is
 * omitted when it is closed. Pointing at an element that
 * does not exist is worse than omitting the attribute —
 * assistive tech will either ignore it or, worse, announce
 * a relationship to nothing.
 */
function Trigger({
  label,
  isOpen,
  onClick,
  onKeyDown,
  buttonRef,
  id,
  popupId,
}: TriggerProps) {
  const accessibleLabel =
    label === "Astronomy"
      ? "Astronomical events"
      : `Astronomical events: ${label}`;

  return (
    <button
      ref={buttonRef}
      id={id}
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={accessibleLabel}
      aria-haspopup={POPUP_ROLE}
      aria-expanded={isOpen}
      aria-controls={isOpen ? popupId : undefined}
      className="
        flex size-9 shrink-0 items-center justify-center gap-2
        rounded-full border border-white/[0.14] bg-black/50
        text-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.32)]
        backdrop-blur-xl
        transition-colors duration-200
        hover:bg-white/[0.10] hover:text-white
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-white/50
        sm:size-10 sm:w-auto sm:px-3.5
      "
    >
      <CalendarClock
        aria-hidden="true"
        className="size-4 shrink-0 sm:size-[18px]"
        strokeWidth={1.7}
      />

      {/*
       * The label is hidden on mobile to keep the chrome
       * compact. The text node is marked `aria-hidden`
       * because the accessible name comes from `aria-label`
       * above; without this, some screen readers would read
       * "Astronomical events" followed by the visible label.
       */}
      <span
        aria-hidden="true"
        className="hidden truncate text-[10px] font-medium tracking-[-0.01em] sm:inline sm:text-[11px]"
      >
        {label}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Option row                                                                 */
/* -------------------------------------------------------------------------- */

interface OptionRowProps {
  readonly event: AstronomicalEventOption;
  readonly active: boolean;
  readonly highlighted: boolean;
  readonly id: string;
  readonly onSelect: (id: AstronomicalEventId) => void;
  readonly onHover: (id: AstronomicalEventId) => void;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
}

/**
 * A single row in the listbox.
 *
 * ## Disabled options
 *
 * Three distinct no-ops apply to disabled options:
 *
 *   1. **Click** — the row's `onClick` calls `onSelect` only
 *      when `available` is `true`.
 *   2. **Hover** — `onMouseEnter` calls `onHover` only when
 *      `available` is `true`. The keyboard highlight does
 *      not move when the pointer crosses a disabled option.
 *   3. **Keyboard activation** — the parent's `Enter` handler
 *      no-ops on a disabled highlighted option.
 *
 * The `disabled` attribute on the `<button>` is what makes
 * clicks and pointer events no-ops in the browser. The
 * explicit `available` guards on `onClick` and `onMouseEnter`
 * are what make the same no-op apply to programmatic
 * dispatches and to RTL's `fireEvent`.
 *
 * ## `focus-visible` ring
 *
 * In the listbox pattern, DOM focus stays on the trigger and
 * the option rows are never actually focused. The
 * `focus-visible` ring here is defensive: if a future change
 * moves DOM focus into the popup, the ring is what keeps the
 * focused option visible to sighted keyboard users.
 *
 * ## Memoization
 *
 * The row is static per `(event, active, highlighted)`
 * combination. Memoizing prevents a re-render of every row
 * on every parent render that changes something unrelated.
 */
const OptionRow = memo(function OptionRow({
  event,
  active,
  highlighted,
  id,
  onSelect,
  onHover,
  buttonRef,
}: OptionRowProps) {
  const { label, description, available, unavailableReason } = event;

  const handleClick = useCallback(() => {
    if (!available) return;
    onSelect(event.id);
  }, [available, onSelect, event.id]);

  const handleMouseEnter = useCallback(() => {
    if (!available) return;
    onHover(event.id);
  }, [available, onHover, event.id]);

  return (
    <button
      ref={buttonRef}
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      disabled={!available}
      className={[
        "group flex w-full items-start gap-3 px-3 py-2.5 text-left",
        "transition-colors duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/40",
        "focus-visible:ring-inset",
        available
          ? "cursor-pointer text-white hover:bg-white/[0.06]"
          : "cursor-not-allowed text-white/35",
        highlighted && available ? "bg-white/[0.06]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/*
       * The check mark occupies a fixed slot whether it is
       * visible or not, so option labels do not shift
       * horizontally when the active option changes.
       */}
      <span
        aria-hidden="true"
        className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center"
      >
        {active && (
          <Check
            className="size-3.5 text-[var(--accent)]"
            strokeWidth={2}
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium tracking-[-0.01em]">
          {label}
        </span>

        <span
          className={[
            "mt-0.5 block truncate text-[10px]",
            available ? "text-white/45" : "text-white/30",
          ].join(" ")}
        >
          {available ? description : unavailableReason}
        </span>
      </span>
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export interface AstronomicalEventPickerProps {
  /** The full list of presets, with availability. */
  readonly events: readonly AstronomicalEventOption[];

  /** Which preset produced the current override, or `null`. */
  readonly activeEventId: AstronomicalEventId | null;

  /** Called when the user activates a preset. */
  readonly onSelect: (id: AstronomicalEventId) => void;

  /**
   * When `true`, animations are skipped. Required — see the
   * `## Reduced motion` section of the module header for why
   * this is not optional.
   */
  readonly reducedMotion: boolean;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The astronomical event picker.
 *
 * A button that opens a dropdown listing the events the app
 * can time-travel to. The visual language — a rounded pill
 * with a lucide icon and a label — matches
 * `VisualModeToggle` and the tier selector.
 *
 * ## Behavior
 *
 *   - Click the trigger to open the dropdown.
 *   - Click an option to activate it. The dropdown closes.
 *   - Press Escape to close the dropdown without activating.
 *   - Press ArrowDown / ArrowUp / Home / End to move the
 *     highlighted option; press Enter or Space to activate.
 *   - Click outside to close.
 *   - Press Tab from inside the popup to close it and let
 *     the browser move focus naturally.
 *
 * ## Keyboard focus model
 *
 * The popup is a `role="listbox"` with no focusable
 * children. DOM focus stays on the trigger button throughout
 * the interaction; the popup signals its state via
 * `aria-activedescendant`. This is the standard listbox
 * pattern and it means every keyboard event the user
 * produces is delivered to the trigger, not to the popup.
 *
 * `handleTriggerKeyDown` is the single entry point for every
 * key the user presses, whether the popup is open or closed.
 * When closed, the relevant keys open the popup. When open,
 * the same keys are forwarded to `handlePopupKeyDown`, which
 * implements the listbox navigation.
 *
 * The popup's own `onKeyDown` handler is retained as a
 * defensive fallback: if a future change ever moves DOM
 * focus into the popup (or a browser dispatches a keydown on
 * the element for some other reason), the listbox keeps
 * working.
 *
 * ## Modifier keys
 *
 * `handleTriggerKeyDown` bails on any modifier key before
 * dispatching. `Ctrl+ArrowDown`, `Meta+ArrowDown`, and
 * `Alt+ArrowDown` are browser- and OS-level shortcuts that
 * must not be swallowed.
 *
 * ## ARIA model
 *
 * The popup is `role="listbox"` with `role="option"` on each
 * row, not `role="menu"` with plain buttons. A menu is a
 * list of *actions*; a listbox is a list of *options*, which
 * is what this picker is — the user is choosing which moment
 * to view, not firing a command.
 *
 * The trigger carries `aria-haspopup="listbox"` and
 * `aria-expanded`, and `aria-controls` when the popup is
 * open. The popup carries `aria-activedescendant` pointing
 * at the highlighted option's id.
 *
 * The active option additionally carries `aria-selected`, so
 * assistive tech can distinguish "the option the user is
 * viewing" from "the option the user is currently arrowing
 * over" — two different concepts that a menu pattern would
 * conflate.
 *
 * ## Highlighted state is stored as an ID, not an index
 *
 * `highlightedId` tracks the currently-arrowed option by its
 * stable `AstronomicalEventId`, not by position. The arrow
 * math converts the ID to an index via `findIndex`, runs the
 * integer arithmetic on that, then converts the result back
 * to an ID. That two-step indirection is deliberate: a
 * re-order or insertion in the `events` array moves the
 * highlight with the array instead of silently retargeting
 * to a different preset.
 *
 * The stored `highlightedId` reflects the user's explicit
 * intent — set by arrow keys, hover, and `open()`. If the
 * caller swaps `events` and the stored ID is no longer
 * present, the *derived* highlight below falls back to the
 * first event rather than mutating `highlightedId`. That
 * keeps the repair pass out of an effect, and means that if
 * the previously-highlighted event reappears, the highlight
 * returns to it.
 *
 * ## Reduced motion
 *
 * The `reducedMotion` prop is required, not optional. The
 * popup animates in with a small downward translate and an
 * opacity fade; a consumer that forgets to pass
 * `reducedMotion` would animate for users who have disabled
 * motion in their OS settings. Making the prop required is
 * what forces the consumer to read `prefers-reduced-motion`
 * and pass it through.
 */
export default function AstronomicalEventPicker({
  events,
  activeEventId,
  onSelect,
  reducedMotion,
}: AstronomicalEventPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  /**
   * The user's explicit keyboard-highlight intent. `null`
   * means nothing has been highlighted yet. Held as a stable
   * `AstronomicalEventId`, not as an index.
   *
   * This value is not repaired when `events` changes; the
   * repair is done in `effectiveHighlightedId` below, so the
   * user's last explicit choice is preserved even if the
   * event temporarily disappears from the list.
   */
  const [highlightedId, setHighlightedId] = useState<
    AstronomicalEventId | null
  >(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const itemRefs = useRef<
    Map<AstronomicalEventId, HTMLButtonElement | null>
  >(new Map());

  /*
   * Stable IDs for ARIA. `useId` gives a unique prefix per
   * instance, so two pickers on one page cannot collide.
   */
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const popupId = `${baseId}-popup`;
  const optionIdPrefix = `${baseId}-option`;

  const triggerLabel = getTriggerLabel(events, activeEventId);

  /* ------------------------------------------------------------------ */
  /* Derived values                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * The ID that should actually be treated as highlighted.
   *
   * Prefers the user's stored `highlightedId` when it still
   * exists in `events`. Falls back to the first event when
   * the stored ID has disappeared (or was never set). This
   * replaces an effect that repaired `highlightedId` after
   * the fact — computing it during render avoids the
   * cascading re-render that `react-hooks/set-state-in-effect`
   * warns about, and leaves the user's stored intent intact
   * so it can be restored if the event returns.
   */
  const effectiveHighlightedId = useMemo(() => {
    if (
      highlightedId !== null &&
      events.some((event) => event.id === highlightedId)
    ) {
      return highlightedId;
    }
    return events[0]?.id ?? null;
  }, [events, highlightedId]);

  const highlightedOption = useMemo(
    () =>
      effectiveHighlightedId === null
        ? null
        : events.find(
            (event) => event.id === effectiveHighlightedId,
          ) ?? null,
    [events, effectiveHighlightedId],
  );

  const activeDescendantId = useMemo(() => {
    if (effectiveHighlightedId === null) return undefined;
    return `${optionIdPrefix}-${effectiveHighlightedId}`;
  }, [effectiveHighlightedId, optionIdPrefix]);

  /* ------------------------------------------------------------------ */
  /* Open / close                                                       */
  /* ------------------------------------------------------------------ */

  const open = useCallback(() => {
    setIsOpen(true);

    /*
     * Highlight the active option, if any — this gives the
     * user a keyboard starting point that matches what they
     * are viewing. Otherwise start at the top.
     */
    const activeExists =
      activeEventId !== null &&
      events.some((event) => event.id === activeEventId);

    setHighlightedId(
      activeExists ? activeEventId : events[0]?.id ?? null,
    );
  }, [events, activeEventId]);

  const close = useCallback(() => {
    setIsOpen(false);
    setHighlightedId(null);
  }, []);

  /**
   * The mouse activation path. Both activation paths (mouse
   * and keyboard) produce the same outcome: `onSelect` is
   * called, the popup closes, and DOM focus returns to the
   * trigger.
   */
  const handleOptionSelect = useCallback(
    (id: AstronomicalEventId) => {
      onSelect(id);
      close();
      triggerRef.current?.focus();
    },
    [onSelect, close],
  );

  /* ------------------------------------------------------------------ */
  /* Outside-click and escape                                           */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const insideTrigger =
        triggerRef.current?.contains(target) ?? false;
      const insidePopup =
        popupRef.current?.contains(target) ?? false;

      if (!insideTrigger && !insidePopup) {
        close();
      }
    };

    const handleEscape = (
      event: globalThis.KeyboardEvent,
    ): void => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, close]);

  /* ------------------------------------------------------------------ */
  /* Scroll highlighted option into view                                */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!isOpen) return;
    if (effectiveHighlightedId === null) return;

    itemRefs.current.get(effectiveHighlightedId)?.scrollIntoView({
      block: "nearest",
    });
  }, [isOpen, effectiveHighlightedId]);

  /* ------------------------------------------------------------------ */
  /* Keyboard navigation                                                */
  /* ------------------------------------------------------------------ */

  const moveHighlight = useCallback(
    (direction: 1 | -1): void => {
      if (events.length === 0) return;

      setHighlightedId((current) => {
        const currentIndex =
          current === null
            ? -1
            : events.findIndex((event) => event.id === current);

        const start = currentIndex < 0 ? 0 : currentIndex;
        const next = start + direction;

        if (next < 0) {
          return events[events.length - 1]?.id ?? null;
        }
        if (next >= events.length) {
          return events[0]?.id ?? null;
        }
        return events[next]?.id ?? null;
      });
    },
    [events],
  );

  /**
   * The shared key handler for the listbox.
   *
   * Wired to *both* the trigger and the popup. Because DOM
   * focus stays on the trigger throughout the interaction,
   * the trigger is the handler that actually fires for every
   * keyboard event the user produces — the popup's own
   * `onKeyDown` is a defensive fallback.
   *
   * The handler does not itself decide whether the popup is
   * open — the caller (`handleTriggerKeyDown`) gates on
   * `isOpen` before forwarding.
   */
  const handlePopupKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveHighlight(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveHighlight(-1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        if (events.length > 0) {
          setHighlightedId(events[0]?.id ?? null);
        }
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        if (events.length > 0) {
          setHighlightedId(
            events[events.length - 1]?.id ?? null,
          );
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        if (!highlightedOption || !highlightedOption.available) {
          return;
        }

        handleOptionSelect(highlightedOption.id);
        return;
      }

      if (event.key === "Tab") {
        /*
         * Tab from inside the popup closes it and lets the
         * browser move focus naturally. This matches the
         * behavior of every well-behaved dropdown.
         */
        close();
      }
    },
    [events, highlightedOption, moveHighlight, handleOptionSelect, close],
  );

  /**
   * The trigger's key handler.
   *
   * Because DOM focus stays on the trigger for the entire
   * interaction, this is the function that receives every
   * key press the user makes. Its job is to decide whether
   * the popup is open:
   *
   *   - **Closed** — ArrowDown, ArrowUp, Enter, and Space
   *     open the popup.
   *   - **Open** — every key is forwarded to
   *     `handlePopupKeyDown`.
   *
   * ## Modifier keys
   *
   * Any modifier other than Shift causes an early return.
   * `Ctrl+ArrowDown` on Windows / `Cmd+ArrowDown` on macOS
   * are OS-level shortcuts (jump to end of document,
   * switch app, etc.), and `Alt+Arrow` is a menu-access key
   * on Windows. Swallowing them would be a hostile override.
   *
   * `Shift+Arrow` is forwarded because the popup's own
   * handler treats `Shift+Arrow` the same as `Arrow` — the
   * shift is not a modifier the listbox cares about.
   */
  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (!isOpen) {
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          open();
        }
        return;
      }

      handlePopupKeyDown(
        event as unknown as React.KeyboardEvent<HTMLElement>,
      );
    },
    [isOpen, open, handlePopupKeyDown],
  );

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="relative">
      <Trigger
        id={triggerId}
        popupId={popupId}
        label={triggerLabel}
        isOpen={isOpen}
        buttonRef={triggerRef}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
      />

      {isOpen && (
        <div
          ref={popupRef}
          id={popupId}
          role={POPUP_ROLE}
          aria-label="Astronomical events"
          aria-activedescendant={activeDescendantId}
          onKeyDown={handlePopupKeyDown}
          className={[
            "absolute right-0 top-[calc(100%+8px)] z-[100]",
            "w-[min(calc(100vw-24px),280px)]",
            "max-h-[min(420px,calc(100dvh-220px))] overflow-y-auto",
            "rounded-2xl border border-white/[0.08] bg-black",
            "shadow-[0_28px_80px_rgba(0,0,0,0.55)]",
            "py-1",
            "[scrollbar-color:rgba(255,255,255,0.16)_transparent]",
            "[scrollbar-width:thin]",
            "[&::-webkit-scrollbar]:w-1",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-white/15",
            "[&::-webkit-scrollbar-thumb:hover]:bg-white/25",
          ].join(" ")}
          style={{
            animation: reducedMotion
              ? "none"
              : "world-clock-picker-in 160ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {events.map((event) => (
            <OptionRow
              key={event.id}
              id={`${optionIdPrefix}-${event.id}`}
              event={event}
              active={event.id === activeEventId}
              highlighted={event.id === effectiveHighlightedId}
              onSelect={handleOptionSelect}
              onHover={setHighlightedId}
              buttonRef={(element) => {
                itemRefs.current.set(event.id, element);
              }}
            />
          ))}
        </div>
      )}

      <style>{PICKER_ANIMATION_STYLES}</style>
    </div>
  );
}