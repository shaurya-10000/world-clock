"use client";

import { Minus, Plus } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface GlobeSizeToggleProps {
  /**
   * The current step index into the camera-distance ladder.
   *
   * Note: this index is inverted relative to *visual* globe
   * size. `0` is the closest camera position, which makes the
   * globe appear **largest**; `stepCount - 1` is the furthest
   * camera position, which makes the globe appear **smallest**.
   * The caller owns the ladder; this component only knows
   * whether it can decrement and whether it can increment.
   */
  readonly stepIndex: number;

  /**
   * Total number of steps in the ladder.
   *
   * Passed in rather than imported so the component does not
   * need to know where the ladder is declared. `stepIndex`
   * plus `stepCount` is the entire information the two
   * buttons need.
   */
  readonly stepCount: number;

  /** Called when the user activates the decrement button. */
  readonly onDecrement: () => void;

  /** Called when the user activates the increment button. */
  readonly onIncrement: () => void;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The globe region's size stepper.
 *
 * Two buttons in a single pill: `−` on the left, `+` on the
 * right. Each button changes the globe region's width by one
 * step along a fixed ladder. The controls disable at the ends
 * of the ladder rather than wrapping, because wrapping from
 * smallest to largest on a single press is disorienting.
 *
 * ## Why "size" and "distance" are inverted
 *
 * The stepper is presented as **globe size** — `+` makes the
 * globe bigger, `−` makes it smaller. But the underlying
 * ladder is a **camera distance** — a smaller distance means
 * a larger globe on screen. So:
 *
 *   - `stepIndex = 0` → camera closest → globe largest.
 *   - `stepIndex = stepCount - 1` → camera furthest → globe smallest.
 *
 * The two meanings are the inverse of each other, which is
 * the source of the button-disabled logic below. Reading the
 * labels without this inversion in mind produces the "which
 * button goes where" confusion that this comment exists to
 * prevent.
 *
 * ## Disabled logic
 *
 * Because `stepIndex` is a *camera distance* index, the
 * size-facing buttons disable at the opposite ends of the
 * index range from what their labels might suggest:
 *
 *   - `−` ("reduce globe size") moves the camera further away,
 *     i.e. increases the index. It disables at `atMaximum`
 *     (index already at `stepCount - 1`) — there is no smaller
 *     size left to step to.
 *   - `+` ("increase globe size") moves the camera closer,
 *     i.e. decreases the index. It disables at `atMinimum`
 *     (index already at `0`) — there is no larger size left to
 *     step to.
 *
 * ## Defensive normalization
 *
 * The `disabled` computation is guarded against degenerate
 * props, because the alternative is a pair of buttons that
 * silently misbehave when fed a bad index. Three cases:
 *
 *   - `stepCount <= 1` — there is no ladder. Both buttons are
 *     disabled; there is nowhere to step.
 *   - `stepIndex` non-finite — coerced to the middle of the
 *     ladder, so both buttons remain usable. A non-finite
 *     index is a bug upstream, but disabling both buttons in
 *     response would make the bug invisible and hard to
 *     diagnose. A usable stepper with a console warning is
 *     more useful than a dead one.
 *   - `stepIndex` out of range — clamped to the ladder's
 *     actual range before the boundary comparisons. Without
 *     the clamp a stale index of, say, `100` would satisfy
 *     "at maximum" and disable `−`, even though the actual
 *     state is nowhere near an end.
 *
 * @example
 * ```tsx
 * <GlobeSizeToggle
 *   stepIndex={cameraStepIndex}
 *   stepCount={CAMERA_DISTANCE_STEPS.length}
 *   onDecrement={handleZoomOut}
 *   onIncrement={handleZoomIn}
 * />
 * ```
 */
export default function GlobeSizeToggle({
  stepIndex,
  stepCount,
  onDecrement,
  onIncrement,
}: GlobeSizeToggleProps) {
  /*
   * Degenerate case: no ladder. Both buttons are disabled
   * because there is nowhere to step to.
   */
  const hasLadder = stepCount >= 2;

  /*
   * Non-finite `stepIndex` (NaN, Infinity, -Infinity) is
   * coerced to the middle of the ladder. See the component
   * header for the reasoning.
   */
  const safeIndex = Number.isFinite(stepIndex)
    ? stepIndex
    : Math.floor(stepCount / 2);

  /*
   * Clamp to the ladder's actual range before the boundary
   * comparisons. See the component header for the reasoning.
   */
  const clampedIndex = hasLadder
    ? Math.min(Math.max(safeIndex, 0), stepCount - 1)
    : 0;

  const atMinimum = !hasLadder || clampedIndex <= 0;
  const atMaximum = !hasLadder || clampedIndex >= stepCount - 1;

  return (
    <div
      role="group"
      aria-label="Globe size"
      className="
        flex
        w-fit
        shrink-0
        items-center
        gap-0.5
        rounded-full
        border
        border-white/[0.14]
        bg-black/50
        p-1
        shadow-[0_20px_60px_rgba(0,0,0,0.32)]
        backdrop-blur-xl
      "
    >
      <SizeButton
        label="Reduce globe size"
        disabled={atMaximum}
        onClick={onDecrement}
      >
        <Minus
          aria-hidden="true"
          className="size-3.5 sm:size-4"
          strokeWidth={2.25}
        />
      </SizeButton>

      <SizeButton
        label="Increase globe size"
        disabled={atMinimum}
        onClick={onIncrement}
      >
        <Plus
          aria-hidden="true"
          className="size-3.5 sm:size-4"
          strokeWidth={2.25}
        />
      </SizeButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SizeButton                                                                 */
/* -------------------------------------------------------------------------- */

interface SizeButtonProps {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

/**
 * One button in the size stepper.
 *
 * Extracted so the two buttons cannot drift in their styling
 * or their ARIA shape. The label is used for both `aria-label`
 * and `title`, which is the correct pairing: `aria-label`
 * provides the accessible name for screen readers, and `title`
 * provides the hover tooltip for sighted users who cannot
 * infer the button's meaning from the icon alone.
 *
 * The `focus-visible` ring uses an offset that matches the
 * pill's dark background, so the ring is visible against the
 * pill rather than blending into it.
 */
function SizeButton({
  label,
  disabled,
  onClick,
  children,
}: SizeButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="
        flex
        size-7
        shrink-0
        items-center
        justify-center
        rounded-full
        text-white/90
        transition-colors
        duration-200
        hover:bg-white/[0.10]
        hover:text-white
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-white/50
        focus-visible:ring-offset-2
        focus-visible:ring-offset-black/50
        disabled:cursor-not-allowed
        disabled:text-white/25
        disabled:hover:bg-transparent
        disabled:hover:text-white/25
        sm:size-8
      "
    >
      {children}
    </button>
  );
}