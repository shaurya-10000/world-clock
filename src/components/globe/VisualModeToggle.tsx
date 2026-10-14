"use client";

/**
 * The visual-mode radiogroup.
 *
 * A WAI-ARIA radiogroup — not a tablist. The two options select
 * a *rendering mode* (a piece of state that changes how the
 * globe is drawn), not a *panel* (a mutually exclusive view that
 * hides siblings). The distinction matters for assistive tech:
 * a tablist implies "selecting this tab hides the others'
 * content", which is false here — the globe is the same globe
 * either way, just rendered differently.
 *
 * The component is deliberately behavior-free. Every piece of
 * behavior a radiogroup needs — roving tabindex, arrow-key
 * navigation, Home/End, focus management — is supplied by the
 * parent via `onKeyDown` and `optionRef`. This component owns
 * exactly two things:
 *
 *   1. The static list of modes (`VISUAL_MODES`).
 *   2. The visual chrome (pill, active state, focus ring).
 *
 * That split exists because the parent (`Globe.tsx`) already
 * owns the identical responsibility for the tier radiogroup
 * directly to the left. Two radiogroups, two handlers, one
 * pattern — and a component that cannot get out of sync with
 * its parent's idea of "which option is focused".
 *
 * ## Why `VISUAL_MODES` is exported
 *
 * The parent's arrow-key handler needs the display *order* to
 * compute "next option". Keeping the order in this file and
 * exporting it means there is exactly one place that defines
 * what "next" means — the same array that renders the buttons
 * is the array the handler walks.
 *
 * The array is frozen so a consumer cannot reorder it at
 * runtime and silently break the parent's index math.
 *
 * ## Why `optionRef` is a factory, not an array
 *
 * The parent stores its option refs in a `useRef<Array<...>>`
 * and needs to write `refs.current[index] = el` on each mount.
 * Passing an *array of ref callbacks* would require the parent
 * to build the array eagerly on every render. Passing a
 * *factory* — `optionRef(index) => (el) => ...` — lets the
 * component call the factory exactly once per rendered option,
 * which is the number of times it needs to.
 *
 * The factory itself is memoized by the parent (via
 * `useCallback`), so the returned callback is stable across
 * renders and React does not churn refs on every commit.
 */

import type { GlobeVisualMode } from "./constants";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One entry in the visual-mode radiogroup.
 *
 * The shape mirrors `GlobeMode` in `Globe.tsx` — value, long
 * label, short label — so the two radiogroups render the same
 * pattern without a shared abstraction that would only fit this
 * one call site. If a third radiogroup ever appears, that is
 * the moment to extract the pattern; extracting it now would
 * be speculative.
 */
export interface VisualModeOption {
  /** The value dispatched to `onChange` when this option is picked. */
  readonly value: GlobeVisualMode;

  /** The full label. Shown at `sm:` and above. */
  readonly label: string;

  /**
   * The abbreviated label. Shown below `sm:`, where there is not
   * enough horizontal room for the full word without crowding
   * the tier selector to the left.
   */
  readonly shortLabel: string;
}

/**
 * The canonical list of visual modes, in display order.
 *
 * Order is the display order **and** the arrow-key traversal
 * order. The parent's `handleVisualModeKeyDown` reads this array
 * to compute "the option after the currently-focused one", so
 * reordering this array reorders the keyboard navigation too.
 * That coupling is intentional: the two orders should never
 * disagree, and keeping them in one place is the only way to
 * guarantee that.
 *
 * `Object.freeze` prevents a runtime reorder via
 * `VISUAL_MODES.reverse()` or similar. TypeScript's `readonly`
 * modifier prevents it at compile time; the freeze prevents it
 * at runtime for any consumer that bypasses the type.
 */
export const VISUAL_MODES: readonly VisualModeOption[] =
  Object.freeze([
    {
      value: "minimal",
      label: "Minimal",
      shortLabel: "Min",
    },
    {
      value: "realistic",
      label: "Realistic",
      shortLabel: "Real",
    },
  ]);

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface VisualModeToggleProps {
  /** The currently selected visual mode. */
  readonly value: GlobeVisualMode;

  /** Called when the user picks a different mode. */
  readonly onChange: (next: GlobeVisualMode) => void;

  /**
   * Keyboard handler for the radiogroup, owned by the parent.
   *
   * The handler is responsible for:
   *
   *   - `ArrowRight` / `ArrowDown` — focus and select the next
   *     option (wrapping).
   *   - `ArrowLeft` / `ArrowUp` — focus and select the previous
   *     option (wrapping).
   *   - `Home` — focus and select the first option.
   *   - `End` — focus and select the last option.
   *   - `Enter` / `Space` — activate the focused option (already
   *     the default `button` behavior; the handler exists to
   *     make the *roving* behavior work, not this).
   *
   * Attached at the group level, not on each button, so the
   * handler runs during the *bubbling* phase after the focused
   * button has had a chance to process the key. That ordering
   * is what lets `Space` still activate the focused button via
   * the browser's default `button` behavior while arrow keys
   * move focus — the handler only calls `preventDefault` on the
   * keys it actually claims.
   */
  readonly onKeyDown: (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => void;

  /**
   * Ref factory for the option buttons. Called once per option
   * with that option's index; returns the ref callback for the
   * button at that index.
   *
   * The parent (`Globe.tsx`) memoizes this via `useCallback`, so
   * the returned callback identity is stable and React does not
   * churn the button's ref on every render.
   */
  readonly optionRef: (
    index: number,
  ) => (el: HTMLButtonElement | null) => void;
}

/**
 * The visual-mode radiogroup.
 *
 * A pill of two buttons. The active option carries
 * `aria-checked="true"` and `tabIndex={0}`; the inactive option
 * carries `aria-checked="false"` and `tabIndex={-1}`. That is
 * the WAI-ARIA "roving tabindex" pattern — the group is a single
 * tab stop, and arrow keys move focus within it. It matches the
 * tier selector to the left exactly, so a user who has learned
 * one has learned the other.
 *
 * Renders nothing interactive beyond the buttons themselves:
 * no wrapper handlers, no internal state, no effects. Every bit
 * of behavior is supplied by the parent.
 *
 * @example
 * ```tsx
 * <VisualModeToggle
 *   value={visualMode}
 *   onChange={setVisualMode}
 *   onKeyDown={handleVisualModeKeyDown}
 *   optionRef={visualModeOptionRef}
 * />
 * ```
 */
export default function VisualModeToggle({
  value,
  onChange,
  onKeyDown,
  optionRef,
}: VisualModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Globe visual style"
      onKeyDown={onKeyDown}
      className="
        flex w-fit shrink-0 items-center rounded-full
        border border-white/[0.09] bg-black/35 p-1
        shadow-[0_20px_60px_rgba(0,0,0,0.18)]
        backdrop-blur-xl
      "
    >
      {VISUAL_MODES.map((mode, index) => {
        const active = value === mode.value;

        return (
          <button
            key={mode.value}
            ref={optionRef(index)}
            type="button"
            role="radio"
            aria-checked={active}
            /*
             * Roving tabindex: only the active option is
             * reachable by Tab. Arrow keys move focus between
             * the options via the parent's handler.
             */
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(mode.value)}
            className={[
              "shrink-0 rounded-full px-3 py-2 text-[10px] font-medium",
              "tracking-[-0.01em] transition-all duration-300",
              "sm:px-4 sm:text-[11px]",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-white/40 focus-visible:ring-offset-2",
              "focus-visible:ring-offset-black/50",
              active
                ? "bg-white/[0.11] text-white shadow-[0_0_24px_rgba(255,255,255,0.05)]"
                : "text-white/42 hover:bg-white/[0.045] hover:text-white/72",
            ].join(" ")}
          >
            <span className="sm:hidden">{mode.shortLabel}</span>
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}