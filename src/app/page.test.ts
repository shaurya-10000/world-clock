import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  resolveLocalLocation,
  useMediaQuery,
} from "@/app/page";

/* -------------------------------------------------------------------------- */
/* matchMedia shim                                                            */
/* -------------------------------------------------------------------------- */

function installMatchMedia(
  initialMatches: boolean,
  query = "(max-width: 767px)",
): {
  setMatches: (next: boolean) => void;
  listenerCount: () => number;
} {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  const mql = {
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ): void => {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ): void => {
      if (type === "change") listeners.delete(listener);
    },
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => true,
  };

  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia =
    () => mql;

  return {
    setMatches: (next: boolean) => {
      matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.size,
  };
}

function uninstallMatchMedia(): void {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
}

/* -------------------------------------------------------------------------- */
/* useMediaQuery                                                              */
/* -------------------------------------------------------------------------- */

describe("useMediaQuery", () => {
  it("returns false when the query does not match", () => {
    installMatchMedia(false);
    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );
    expect(result.current).toBe(false);
  });

  it("returns true when the query matches", () => {
    installMatchMedia(true);
    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );
    expect(result.current).toBe(true);
  });

  it("updates when the media query changes", () => {
    const controller = installMatchMedia(false);
    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );
    expect(result.current).toBe(false);
    act(() => {
      controller.setMatches(true);
    });
    expect(result.current).toBe(true);
  });

  it("re-renders again when the query flips back", () => {
    const controller = installMatchMedia(false);
    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );
    act(() => controller.setMatches(true));
    expect(result.current).toBe(true);
    act(() => controller.setMatches(false));
    expect(result.current).toBe(false);
  });

  it("subscribes exactly one listener per hook instance", () => {
    const controller = installMatchMedia(false);
    renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(controller.listenerCount()).toBe(1);
  });

  it("removes the listener on unmount", () => {
    const controller = installMatchMedia(false);
    const { unmount } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );
    expect(controller.listenerCount()).toBe(1);
    unmount();
    expect(controller.listenerCount()).toBe(0);
  });

  it("does not update after unmount", () => {
    const controller = installMatchMedia(false);
    const { result, unmount } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );
    unmount();
    act(() => {
      controller.setMatches(true);
    });
    expect(result.current).toBe(false);
  });

  it("re-subscribes when the query string changes", () => {
    const controller = installMatchMedia(false);
    const { rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: "(max-width: 767px)" } },
    );
    expect(controller.listenerCount()).toBe(1);
    rerender({ query: "(min-width: 1024px)" });
    expect(controller.listenerCount()).toBe(1);
  });

  it("returns false and does not throw when matchMedia is missing", () => {
    uninstallMatchMedia();

    const { result } = renderHook(() =>
      useMediaQuery("(max-width: 767px)"),
    );

    expect(result.current).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* resolveLocalLocation                                                       */
/* -------------------------------------------------------------------------- */

describe("resolveLocalLocation", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window =
      originalWindow;
    vi.restoreAllMocks();
  });

  it("returns null when window is undefined (SSR)", () => {
    (globalThis as unknown as { window: unknown }).window =
      undefined;
    expect(resolveLocalLocation()).toBeNull();
  });

  it("returns the catalogued location for a matching zone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
        }) as unknown as Intl.DateTimeFormat,
    );
    const result = resolveLocalLocation();
    expect(result).not.toBeNull();
    expect(result?.timezone).toBe("Asia/Tokyo");
    expect(result?.city).toBe("Tokyo");
  });

  it("returns null when the zone is not in the catalogue", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: "Mars/Olympus" }),
        }) as unknown as Intl.DateTimeFormat,
    );
    expect(resolveLocalLocation()).toBeNull();
  });

  it("returns null when Intl.DateTimeFormat throws", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("Intl is unavailable");
    });
    expect(resolveLocalLocation()).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  vi.restoreAllMocks();
});