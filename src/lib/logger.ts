/**
 * Application logger.
 *
 * A thin wrapper over `console` with two levels of filtering:
 *
 *   1. `NODE_ENV`. Production builds suppress all output by
 *      default. The check is inlined by Next.js's build, so
 *      guarded call sites are effectively dead-code-eliminated
 *      from production bundles.
 *
 *   2. `NEXT_PUBLIC_LOG_LEVEL`. Optional runtime override.
 *      `"debug"` enables everything, `"error"` only surfaces
 *      errors, `"silent"` mutes even those. Defaults to
 *      `"debug"` in development and `"error"` in production.
 *
 * ## Why not call `console.log` directly
 *
 *   - Consistent prefix and shape at every call site.
 *   - One place to change policy (e.g. pipe dev logs into an
 *     on-screen overlay).
 *   - Removes `if (process.env.NODE_ENV !== "production")`
 *     guards from every call site — easy to forget, easy to
 *     leave stale.
 *
 * This is not a full logging framework. No transports, no
 * structured JSON, no sampling. If those are ever needed,
 * swap the implementation but keep the four exported function
 * names and signatures stable.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type LogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "silent";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Numeric severity ordering. Higher values are more severe,
 * so "log at this level or above" reduces to `>=`.
 */
const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const VALID_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
  "silent",
];

function isLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === "string" &&
    (VALID_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Resolve the active log level.
 *
 * Reads `NEXT_PUBLIC_LOG_LEVEL` first — Next.js only exposes
 * `NEXT_PUBLIC_*` variables to client code, so a plain
 * `LOG_LEVEL` would be invisible in the browser. Unrecognized
 * values fall back to the environment default rather than
 * throwing: a typo in `.env` should not crash the app.
 */
function readConfiguredLevel(): LogLevel {
  const raw = process.env.NEXT_PUBLIC_LOG_LEVEL;

  if (isLogLevel(raw)) {
    return raw;
  }

  return process.env.NODE_ENV === "production"
    ? "error"
    : "debug";
}

/**
 * Resolved once at module load. Changing the env var at
 * runtime has no effect — restart the dev server or rebuild.
 */
const configuredLevel: LogLevel = readConfiguredLevel();

/* -------------------------------------------------------------------------- */
/* Implementation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Short brand tag prepended to every line, so this app's logs
 * are distinguishable from browser-extension and library
 * noise in a shared console.
 */
const PREFIX = "[world-clock]";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel];
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Verbose diagnostic output. Suppressed in production unless `NEXT_PUBLIC_LOG_LEVEL=debug`. */
export function logDebug(message: string, ...rest: unknown[]): void {
  if (!shouldLog("debug")) return;
  console.log(PREFIX, message, ...rest);
}

/** Informational output. Suppressed in production unless `NEXT_PUBLIC_LOG_LEVEL=info` or lower. */
export function logInfo(message: string, ...rest: unknown[]): void {
  if (!shouldLog("info")) return;
  console.info(PREFIX, message, ...rest);
}

/** Warnings. Suppressed in production unless `NEXT_PUBLIC_LOG_LEVEL=warn` or lower. */
export function logWarn(message: string, ...rest: unknown[]): void {
  if (!shouldLog("warn")) return;
  console.warn(PREFIX, message, ...rest);
}

/**
 * Errors. Emitted in every environment except
 * `NEXT_PUBLIC_LOG_LEVEL=silent`.
 *
 * This is the entry point for the route error boundary. A
 * future version would also forward to an error-reporting
 * service (Sentry, Axiom, Rollbar, etc.).
 */
export function logError(message: string, ...rest: unknown[]): void {
  if (!shouldLog("error")) return;
  console.error(PREFIX, message, ...rest);
}