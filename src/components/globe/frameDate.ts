/**
 * Shared frame-date resolution.
 *
 * Both `SolarSampler` and `GlobeAtmosphereSampler` need to
 * answer the same question once per frame: **"what instant is
 * this frame evaluating?"**
 *
 * The answer is:
 *
 *   - The app-wide time override value, when one is active
 *     (see `lib/time-override.ts`).
 *   - `new Date()` otherwise.
 *
 * Before this module existed, each sampler called
 * `getTimeOverride()` and constructed its own `Date` inline.
 * Two consequences:
 *
 *   1. **Inconsistency.** If a frame straddled a minute
 *      boundary between the two samplers' `Date.now()`
 *      fallbacks, the terminator computed by `SolarSampler`
 *      and the atmosphere computed by
 *      `GlobeAtmosphereSampler` could reflect instants up to
 *      a millisecond apart. Visually irrelevant, but
 *      conceptually wrong: both describe "this frame."
 *
 *   2. **Duplicated construction.** Two `new Date(ms)` calls
 *      per frame at 60 Hz. Negligible on its own, but the
 *      pattern is exactly the kind of thing that spreads.
 *
 * Routing both samplers through one function guarantees they
 * agree and gives a single point to hook if the resolution
 * rules ever change (e.g. adding a "fixed frame instant" for
 * deterministic playback).
 *
 * ## Not a shared value
 *
 * This function returns a fresh `Date` on every call. The two
 * samplers run in the same frame but in separate callbacks,
 * so there is no safe place to cache a single "frame date"
 * without threading it through the R3F frame callback chain.
 * Constructing a `Date` is a few hundred nanoseconds and this
 * runs twice per frame — cheaper than the machinery that would
 * be needed to share one.
 *
 * Callers that want the exact same instant across multiple
 * calls in one frame should hold the returned `Date` and pass
 * it forward. `sampleGlobeAtmosphere` takes a `Date` for
 * precisely this reason.
 *
 * ## What "agree" means
 *
 * The two samplers agree on the **override decision** — both
 * see the same override value (or both see none), so they
 * cannot disagree about *which moment the app is showing*.
 *
 * They may disagree by a handful of milliseconds on the
 * *exact* wall-clock instant, because each call reads the
 * system clock independently. That is not a bug: a
 * millisecond of drift between the terminator and the
 * atmosphere is imperceptible, and eliminating it would
 * require the samplers to share a value through the R3F frame
 * callback chain — a coupling that is not worth carrying for
 * a difference the user cannot see.
 *
 * The distinction matters because a future reader might
 * otherwise "fix" the millisecond drift by introducing a
 * shared module-level `Date` — which would freeze the frame
 * time on first call and break the samplers on the next tick.
 *
 * ## Why not `getEffectiveNow` from `lib/time-override`
 *
 * `getEffectiveNow` returns the same override-vs-live
 * decision this module makes, and it would be a reasonable
 * dependency. But `resolveFrameDate` returns a `Date` — not a
 * number — and the two samplers consume `Date` directly.
 * Calling `getTimeOverride()` here (rather than
 * `getEffectiveNow`) keeps the module explicit about *why*
 * a `Date` is being constructed and avoids the extra
 * indirection of a `number → Date` round-trip for the
 * override case. The behavior is identical.
 */

import { getTimeOverride } from "@/lib/time-override";

/**
 * Resolve the instant this frame should evaluate.
 *
 * Reads through the app-wide time-override seam so the
 * terminator, sun glow, atmosphere, and every other
 * time-sensitive consumer agree on whichever moment the app
 * is displaying — a solstice, a sunrise, or live time.
 *
 * Returns a fresh `Date` every call. See the module header
 * for why the two samplers are allowed to disagree by a few
 * milliseconds on the wall-clock instant.
 */
export function resolveFrameDate(): Date {
  const override = getTimeOverride();

  return override !== null ? new Date(override) : new Date();
}