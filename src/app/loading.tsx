/**
 * Route-level loading fallback.
 *
 * Rendered by Next.js while the page's server components
 * (currently none, but the boundary is still useful for
 * future additions) or route segments are resolving.
 *
 * The globe's own dynamic import has an inline skeleton
 * inside `Globe.tsx`; this outer fallback covers the initial
 * navigation, before any of the client tree has mounted.
 *
 * ## Accessibility
 *
 * The wrapper carries `role="status"` and `aria-busy="true"`.
 * `role="status"` is what makes the `aria-label` actually
 * announce — a bare `<div>` has implicit role `generic`,
 * which does not support naming, and screen readers on most
 * platforms ignore `aria-label` on it. With the status role,
 * assistive tech announces "Loading World Clock" when the
 * boundary mounts.
 *
 * The pulse dot is marked `aria-hidden="true"`. It is purely
 * decorative and would otherwise be read as an empty span.
 *
 * ## Motion
 *
 * The `animate-pulse` class is defeated by the reduced-motion
 * override in `globals.css` (`animation-duration: 0.01ms
 * !important`). For users who prefer reduced motion the dot
 * is a static gold circle — still visible, just not pulsing.
 * That is intentional: the stillness is the accessibility
 * feature, not a regression.
 *
 * ## No interaction
 *
 * There is no button or link here. A loading fallback that
 * offered a "Try again" affordance would duplicate the error
 * boundary's job and confuse users about what state the page
 * is in.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading World Clock"
      className="
        flex min-h-screen items-center justify-center
        bg-(--background)
      "
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-3 animate-pulse">
          <span
            aria-hidden="true"
            className="
              absolute inset-0 rounded-full
              bg-(--accent)
              shadow-[0_0_14px_var(--accent-glow)]
            "
          />
        </div>

        <p
          className="
            text-[9px] font-black uppercase
            tracking-[0.22em] text-(--subtle)
          "
        >
          World Clock
        </p>
      </div>
    </div>
  );
}