"use client";

import { useEffect } from "react";

import { logError } from "@/lib/logger";

/**
 * Route-level error boundary.
 *
 * Next.js renders this when an unhandled exception occurs
 * anywhere inside the app segment. It must be a client
 * component — the `useEffect` for the error report is the
 * giveaway, and it is the only reason this file cannot be a
 * server component.
 *
 * The UI is deliberately minimal: it names the problem, shows
 * the digest so users can reference it in a bug report, and
 * offers a single action — retry.
 *
 * Error reporting: `logError` writes to the console at the
 * error level. This is also where a service like Sentry or
 * Axiom would be invoked, but that integration does not exist
 * today and this file does not pretend otherwise.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("route error", error);
  }, [error]);

  return (
    <div
      className="
        flex min-h-screen flex-col items-center justify-center
        gap-4 bg-(--background) px-6 text-center
        text-(--foreground)
      "
    >
      <p
        className="
          text-[10px] font-black uppercase
          tracking-[0.22em] text-(--subtle)
        "
      >
        World Clock
      </p>

      <h1 className="font-serif text-3xl tracking-[-0.03em]">
        Something went wrong
      </h1>

      <p className="max-w-md text-sm text-(--muted)">
        An unexpected error interrupted the page. Reloading
        usually resolves it.
      </p>

      {error.digest && (
        <p
          className="
            mt-1 font-mono text-[10px] tracking-[0.04em]
            text-(--subtle)
          "
        >
          ref {error.digest}
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="
          mt-4 inline-flex h-11 items-center justify-center
          rounded-full border border-(--border)
          bg-(--surface) px-6
          text-[11px] font-semibold uppercase
          tracking-[0.16em] text-(--foreground)
          transition-colors duration-200
          hover:bg-(--foreground)/6
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-(--accent)
        "
      >
        Try again
      </button>
    </div>
  );
}