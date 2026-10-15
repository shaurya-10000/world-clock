/**
 * Astronomical event calculations.
 *
 * Produces the instants of the moments the app can navigate
 * to: solstices, equinoxes, and — for a given location —
 * sunrise, sunset, and local solar noon.
 *
 * ## Algorithm
 *
 * All solar-position math follows Meeus, "Astronomical
 * Algorithms" (2nd ed.):
 *
 *   - Chapters 25 (solar coordinates) and 27 (equinoxes and
 *     solstices) for the seasonal events.
 *   - Chapter 15 (rising, transit, and setting) for the
 *     diurnal events. The scan-and-bisect implementation in
 *     `findDiurnalEvent` is a discretized form of the same
 *     hour-angle calculation.
 *
 * Meeus's low-precision formulas are accurate to roughly:
 *
 *   - ±1 minute for solstices and equinoxes.
 *   - ±1 minute for sunrise/sunset below ~66° latitude,
 *     degrading to unreliable above the polar circles.
 *
 * That is far more precise than a UI needs.
 *
 * ## Time zones
 *
 * Every function returns a `Date`, which is a UTC instant
 * with no time-zone awareness. Consumers that need the local
 * wall-clock time format it with `lib/time.ts`.
 *
 * ## Polar day and night
 *
 * Above roughly 66.5° latitude, sunrise and sunset do not
 * occur on some days. `findSunrise` and `findSunset` return
 * `null` in that case rather than producing a garbage
 * timestamp.
 *
 * ## Purity
 *
 * Every function in this module is pure: same inputs, same
 * outputs, no side effects, no global state, no `Date.now()`
 * unless the caller explicitly asks for "the current time"
 * by omitting the `from` argument.
 */

import { logWarn } from "@/lib/logger";
import {
  getSolarElevation,
} from "@/lib/solar";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;
const DEG = Math.PI / 180;

/**
 * The Julian Date at the Unix epoch. Used to convert a
 * JavaScript `Date` into the Julian Date the Meeus formulas
 * expect.
 */
const UNIX_EPOCH_JD = 2440587.5;

/**
 * The Julian Date of J2000.0, the reference epoch for the
 * Meeus formulas.
 */
const J2000_JD = 2451545.0;

/**
 * The maximum drift of the Meeus polynomial estimate from
 * the true crossing, in days.
 *
 * The polynomial in table 27.C is a low-order fit to the
 * time of the seasonal event as a function of the year. Over
 * the range where its coefficients are valid (roughly
 * 1000–3000 CE), the residual is at most a few hours. Two
 * days is generous headroom that keeps the bisection bracket
 * wide enough to contain the true crossing without being
 * wide enough to contain an adjacent seasonal event.
 *
 * The next seasonal event of the *same kind* — next June
 * solstice after this June solstice — is 365 days away. The
 * next seasonal event of a *different kind* — March equinox
 * after December solstice — is ~90 days away. A two-day
 * bracket on either side of the estimate cannot reach
 * either.
 */
const MAX_ESTIMATE_DRIFT_DAYS = 2;

/* -------------------------------------------------------------------------- */
/* Julian Date helpers                                                        */
/* -------------------------------------------------------------------------- */

/** Convert a JavaScript `Date` to a Julian Date. */
function toJulianDate(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/** Convert a Julian Date back to a JavaScript `Date`. */
function fromJulianDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY);
}

/**
 * The Julian Date at 00:00 UTC on January 1 of a given year.
 *
 * Used by the day-of-year approximation helpers to convert an
 * absolute Julian Date into a fractional day-of-year.
 */
function julianDateOfYearStart(year: number): number {
  return toJulianDate(new Date(Date.UTC(year, 0, 1)));
}

/* -------------------------------------------------------------------------- */
/* Seasonal events — solstices and equinoxes                                  */
/* -------------------------------------------------------------------------- */

/**
 * The fractional day-of-year of the June or December solstice
 * in a given year, using Meeus's polynomial approximation.
 *
 * This formula is used for `getNextSolstice` — see Meeus
 * chapter 27 for the derivation.
 */
function approximateSolsticeDayOfYear(
  year: number,
  term: "june" | "december",
): number {
  const y = (year - 2000) / 1000;

  const y2 = y * y;
  const y3 = y2 * y;
  const y4 = y3 * y;

  if (term === "june") {
    const jdApprox =
      2451716.56767 +
      365241.62603 * y +
      0.00325 * y2 +
      0.00888 * y3 -
      0.0003 * y4;

    return jdApprox - julianDateOfYearStart(year);
  }

  const jdApprox =
    2451900.05952 +
    365242.74049 * y -
    0.06223 * y2 -
    0.00823 * y3 +
    0.00032 * y4;

  return jdApprox - julianDateOfYearStart(year);
}

/**
 * Rough day-of-year estimate for a March or September
 * equinox, using Meeus chapter 27.
 */
function approximateEquinoxDayOfYear(
  year: number,
  term: "march" | "september",
): number {
  const y = (year - 2000) / 1000;

  const y2 = y * y;
  const y3 = y2 * y;
  const y4 = y3 * y;

  if (term === "march") {
    const jdApprox =
      2451623.80984 +
      365242.37404 * y +
      0.05169 * y2 -
      0.00411 * y3 -
      0.00057 * y4;

    return jdApprox - julianDateOfYearStart(year);
  }

  const jdApprox =
    2451810.21715 +
    365242.01767 * y -
    0.11575 * y2 +
    0.00337 * y3 +
    0.00078 * y4;

  return jdApprox - julianDateOfYearStart(year);
}

/**
 * The sun's apparent ecliptic longitude at an instant, in
 * degrees, wrapped to `[0, 360)`.
 *
 * This is a lightweight re-derivation of the same quantity
 * computed inside `getSubsolarPoint` in `lib/solar.ts`. It is
 * duplicated here rather than exported from that module
 * because the version in `lib/solar.ts` is inlined into a
 * larger calculation and exporting it would require
 * refactoring that file.
 *
 * The formula is Meeus 25.2–25.5, low-precision solar
 * coordinates. Accurate to ~0.01°.
 */
function apparentSolarLongitude(date: Date): number {
  const jd = toJulianDate(date);
  const n = jd - J2000_JD;

  const meanLongitude = 280.46 + 0.9856474 * n;
  const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;

  const eclipticLongitude =
    meanLongitude +
    1.915 * Math.sin(meanAnomaly) +
    0.02 * Math.sin(2 * meanAnomaly);

  return ((eclipticLongitude % 360) + 360) % 360;
}

/**
 * The signed difference between the sun's apparent longitude
 * and a target, wrapped to `[-180, 180]`.
 *
 * The wrapping is what makes a crossing of 0° not be mistaken
 * for a crossing of 360°: without it, a difference of
 * `359.9` would appear larger than a difference of `-0.1`
 * even though the second is much closer to a crossing.
 */
function wrappedLongitudeDiff(
  date: Date,
  targetLon: number,
): number {
  const lon = apparentSolarLongitude(date);
  const raw = lon - targetLon;
  return ((((raw + 180) % 360) + 360) % 360) - 180;
}

/**
 * Refine a rough solstice or equinox estimate to the exact
 * instant the sun reaches the target apparent ecliptic
 * longitude.
 *
 * ## Directional bracket
 *
 * The Meeus polynomial is a mean-value estimate. Its error is
 * small but not zero, and — critically — the sign of the
 * error is not known a priori. An earlier version of this
 * function searched a symmetric window around the estimate
 * (initially ±12 hours, widening to ±36 hours), which was
 * correct only when the estimate landed on the same side of
 * the true crossing as the polynomial's mean. At extreme
 * years, and for certain values of the `y` century parameter,
 * the estimate can land on the *wrong* side of the crossing,
 * and a symmetric search then brackets the *adjacent*
 * seasonal event.
 *
 * The fix is to anchor the search by the sign of the
 * longitude difference at the estimate:
 *
 *   - `diff > 0` — the sun has already passed the target.
 *     The true crossing is in the past; search
 *     `[estimate - 2 days, estimate]`.
 *   - `diff < 0` — the sun has not yet reached the target.
 *     The true crossing is in the future; search
 *     `[estimate, estimate + 2 days]`.
 *   - `diff === 0` — the estimate is exact; return it.
 *
 * A two-day window is guaranteed to contain the crossing
 * because the sun's mean motion is about 1° per day, and the
 * residual longitude difference at the estimate is at most a
 * few degrees for any year within the polynomial's valid
 * range. A two-day window is far too small to contain the
 * next seasonal event of the same kind (365 days away) or of
 * a different kind (~90 days away).
 *
 * ## Post-bisection sanity check
 *
 * After bisection, the found instant is compared against
 * `MAX_ESTIMATE_DRIFT_DAYS`. A result outside that range
 * indicates the polynomial coefficients are being used
 * outside their valid range — the value is unusable, and
 * the function falls back to the estimate while emitting a
 * warning. This is a diagnostic, not a recovery path: the
 * fallback is not more accurate than the estimate, but it
 * is at least *documented* as approximate rather than
 * silently wrong.
 *
 * @param year        The approximate calendar year.
 * @param dayOfYear   The rough day-of-year from the
 *                    polynomial approximation.
 * @param targetLon   The target apparent ecliptic longitude,
 *                    in degrees: 0, 90, 180, or 270.
 */
function refineSeasonalEvent(
  year: number,
  dayOfYear: number,
  targetLon: number,
): Date {
  const yearStartJd = julianDateOfYearStart(year);
  const estimateJd = yearStartJd + dayOfYear;
  const estimateDate = fromJulianDate(estimateJd);

  const estimateDiff = wrappedLongitudeDiff(
    estimateDate,
    targetLon,
  );

  /*
   * The estimate is exact. This happens when the polynomial
   * lands on a day whose apparent longitude at 00:00 UTC is
   * already the target. Extremely rare but cheap to handle.
   */
  if (estimateDiff === 0) {
    return estimateDate;
  }

  /*
   * Directional bracket. See the function header for the
   * reasoning.
   */
  let loJd: number;
  let hiJd: number;

  if (estimateDiff > 0) {
    loJd = estimateJd - MAX_ESTIMATE_DRIFT_DAYS;
    hiJd = estimateJd;
  } else {
    loJd = estimateJd;
    hiJd = estimateJd + MAX_ESTIMATE_DRIFT_DAYS;
  }

  /*
   * The bracket is guaranteed to contain a sign change by
   * construction: `diff(lo)` and `diff(hi)` have opposite
   * signs because one endpoint is the estimate (whose sign
   * we know) and the other is 2 days away (enough for the
   * sun to have moved past the target).
   *
   * Bisection. 40 iterations of halving a 2-day window
   * converges to about 0.15 milliseconds, which is finer
   * than the millisecond resolution of a JavaScript `Date`.
   */
  for (let i = 0; i < 40; i += 1) {
    const midJd = (loJd + hiJd) / 2;
    const diffLo = wrappedLongitudeDiff(
      fromJulianDate(loJd),
      targetLon,
    );
    const diffMid = wrappedLongitudeDiff(
      fromJulianDate(midJd),
      targetLon,
    );

    if (diffLo * diffMid <= 0) {
      hiJd = midJd;
    } else {
      loJd = midJd;
    }
  }

  const refinedJd = (loJd + hiJd) / 2;
  const refinedDate = fromJulianDate(refinedJd);

  /*
   * Post-bisection sanity check. See the function header,
   * "Post-bisection sanity check", for the reasoning.
   */
  const driftDays =
    Math.abs(refinedJd - estimateJd);
  if (driftDays > MAX_ESTIMATE_DRIFT_DAYS + 1) {
    logWarn(
      `[solar-events] refineSeasonalEvent drift of ` +
        `${driftDays.toFixed(1)} days exceeds the valid ` +
        `range; returning the polynomial estimate. The ` +
        `coefficients may be outside their valid year range.`,
    );
    return estimateDate;
  }

  return refinedDate;
}

/**
 * The next June or December solstice at or after `from`.
 *
 * A solstice is the instant the sun reaches its maximum or
 * minimum declination — its apparent ecliptic longitude is
 * exactly 90° (June) or 270° (December).
 *
 * @param from - The reference instant. Defaults to now.
 */
export function getNextSolstice(from: Date = new Date()): Date {
  const year = from.getUTCFullYear();

  const candidates: Date[] = [
    refineSeasonalEvent(
      year,
      approximateSolsticeDayOfYear(year, "june"),
      90,
    ),
    refineSeasonalEvent(
      year,
      approximateSolsticeDayOfYear(year, "december"),
      270,
    ),
    refineSeasonalEvent(
      year + 1,
      approximateSolsticeDayOfYear(year + 1, "june"),
      90,
    ),
  ];

  for (const candidate of candidates) {
    if (candidate.getTime() >= from.getTime()) {
      return candidate;
    }
  }

  /*
   * Unreachable in practice — the June solstice of `year + 1`
   * is always more than a year after `from`, so the third
   * candidate always satisfies the predicate. Kept for type
   * totality.
   */
  return candidates[0] as Date;
}

/**
 * The next March or September equinox at or after `from`.
 *
 * An equinox is the instant the sun crosses the celestial
 * equator — its apparent ecliptic longitude is exactly 0°
 * (March) or 180° (September).
 *
 * @param from - The reference instant. Defaults to now.
 */
export function getNextEquinox(from: Date = new Date()): Date {
  const year = from.getUTCFullYear();

  const candidates: Date[] = [
    refineSeasonalEvent(
      year,
      approximateEquinoxDayOfYear(year, "march"),
      0,
    ),
    refineSeasonalEvent(
      year,
      approximateEquinoxDayOfYear(year, "september"),
      180,
    ),
    refineSeasonalEvent(
      year + 1,
      approximateEquinoxDayOfYear(year + 1, "march"),
      0,
    ),
  ];

  for (const candidate of candidates) {
    if (candidate.getTime() >= from.getTime()) {
      return candidate;
    }
  }

  return candidates[0] as Date;
}

/* -------------------------------------------------------------------------- */
/* Diurnal events — sunrise, sunset, solar noon                               */
/* -------------------------------------------------------------------------- */

/**
 * The standard solar altitude for sunrise and sunset, in
 * degrees.
 *
 * Sunrise and sunset are defined as the moment the *upper
 * limb* of the sun crosses the horizon. Because the sun has
 * an angular radius of about 16 arcminutes and atmospheric
 * refraction lifts it a further 34 arcminutes, the apparent
 * center of the sun is still about 50 arcminutes *below* the
 * horizon at the moment the upper limb appears. That 50
 * arcminutes equals roughly -0.833°.
 */
const SUNRISE_ALTITUDE = -0.833;

/**
 * Solve for the instant the sun's elevation equals a target
 * altitude, within a bracketing window.
 *
 * @param lat       Latitude in degrees.
 * @param lng       Longitude in degrees.
 * @param target    Target solar elevation in degrees.
 * @param loMs      Window start, in epoch milliseconds.
 * @param hiMs      Window end, in epoch milliseconds.
 */
function solveElevationCrossing(
  lat: number,
  lng: number,
  target: number,
  loMs: number,
  hiMs: number,
): Date {
  let lo = loMs;
  let hi = hiMs;

  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const elevationAtLo = getSolarElevation(
      lat,
      lng,
      new Date(lo),
    );
    const elevationAtMid = getSolarElevation(
      lat,
      lng,
      new Date(mid),
    );

    if (
      (elevationAtLo - target) *
        (elevationAtMid - target) <=
      0
    ) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return new Date((lo + hi) / 2);
}

/**
 * Shared implementation of `findSunrise` and `findSunset`.
 *
 * See the file's existing implementation notes for the
 * reasoning behind the three-day scan and the 30-minute
 * step size. Unchanged from the previous version — this fix
 * was scoped to `refineSeasonalEvent`.
 */
function findDiurnalEvent(
  lat: number,
  lng: number,
  from: Date,
  rising: boolean,
): Date | null {
  const target = SUNRISE_ALTITUDE;
  const fromMs = from.getTime();

  const STEP_MS = 30 * 60_000;

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const dayStartMs = fromMs + dayOffset * MS_PER_DAY;

    const anchor = new Date(dayStartMs);
    const scanStartMs = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate(),
    );

    let previousMs: number | null = null;
    let previousSign = 0;

    for (
      let t = scanStartMs;
      t < scanStartMs + MS_PER_DAY;
      t += STEP_MS
    ) {
      const elevation = getSolarElevation(
        lat,
        lng,
        new Date(t),
      );

      const sign = Math.sign(elevation - target);

      if (sign === 0) {
        previousMs = t;
        previousSign = sign;
        continue;
      }

      if (
        previousMs !== null &&
        previousSign !== 0 &&
        sign !== previousSign
      ) {
        const isRising = sign > previousSign;
        const isWanted = rising ? isRising : !isRising;

        if (isWanted) {
          const eventMs = solveElevationCrossing(
            lat,
            lng,
            target,
            previousMs,
            t,
          );

          if (eventMs.getTime() >= fromMs) {
            return eventMs;
          }
        }
      }

      previousMs = t;
      previousSign = sign;
    }
  }

  return null;
}

/**
 * The next sunrise at a location, at or after `from`.
 *
 * @see findSunrise for the definition of the event instant
 *   and the return-value contract.
 */
export function findSunrise(
  lat: number,
  lng: number,
  from: Date = new Date(),
): Date | null {
  return findDiurnalEvent(lat, lng, from, true);
}

/**
 * The next sunset at a location, at or after `from`.
 */
export function findSunset(
  lat: number,
  lng: number,
  from: Date = new Date(),
): Date | null {
  return findDiurnalEvent(lat, lng, from, false);
}

/**
 * The next local solar noon at a location, at or after
 * `from`.
 *
 * "Local solar noon" is the instant the sun reaches its
 * highest point in the sky for that day.
 *
 * ## Why the check is made on the *refined* instant
 *
 * `approximateNoonMs` ignores the equation of time, so the
 * true noon can differ from the approximation by up to about
 * ±16 minutes. An earlier version compared the *approximate*
 * noon against `from` and then returned the *refined* noon
 * without re-checking. When `from` fell in the gap between
 * the two (for example, a few minutes after the true noon but
 * before the approximate one), the function returned an
 * instant *earlier* than `from`, violating the "at or after"
 * contract. That made the result — and the test that calls it
 * with the current time — depend on the time of day.
 *
 * The fix is to refine first and compare the refined instant
 * against `from`, moving on to the next day when it is
 * earlier. The approximate noon is no longer used to skip a
 * day, because the true noon may land after `from` even when
 * the approximation lands before it.
 */
export function findSolarNoon(
  lat: number,
  lng: number,
  from: Date = new Date(),
): Date {
  const fromMs = from.getTime();

  let lastRefinedNoon: Date = from;

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const anchorMs = fromMs + dayOffset * MS_PER_DAY;

    const approxNoonMs = approximateNoonMs(anchorMs, lng);
    const refinedNoon = refineNoon(lat, lng, approxNoonMs);

    lastRefinedNoon = refinedNoon;

    if (refinedNoon.getTime() >= fromMs) {
      return refinedNoon;
    }
  }

  /*
   * Unreachable in practice — one of the first two days
   * always yields a noon at or after `from`. Kept for type
   * totality.
   */
  return lastRefinedNoon;
}

/**
 * Rough estimate of solar noon, in epoch milliseconds, on
 * the UTC day containing `anchorMs`.
 */
function approximateNoonMs(
  anchorMs: number,
  lng: number,
): number {
  const anchor = new Date(anchorMs);
  const dayStartUtc = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
  );

  const noonHoursUtc = 12 - lng / 15;

  return dayStartUtc + noonHoursUtc * 3600_000;
}

/**
 * Refine an approximate solar noon by golden-section search
 * on the elevation — i.e. find the local maximum.
 */
function refineNoon(
  lat: number,
  lng: number,
  approxNoonMs: number,
): Date {
  const windowMs = 30 * 60_000;

  let lo = approxNoonMs - windowMs;
  let hi = approxNoonMs + windowMs;

  const phi = (Math.sqrt(5) - 1) / 2;

  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);

  for (let i = 0; i < 24; i += 1) {
    const cElevation = getSolarElevation(
      lat,
      lng,
      new Date(c),
    );
    const dElevation = getSolarElevation(
      lat,
      lng,
      new Date(d),
    );

    if (cElevation > dElevation) {
      hi = d;
      d = c;
      c = hi - phi * (hi - lo);
    } else {
      lo = c;
      c = d;
      d = lo + phi * (hi - lo);
    }
  }

  return new Date((lo + hi) / 2);
}