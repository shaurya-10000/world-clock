import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useFavorites } from "@/lib/useFavorites";

const STORAGE_KEY = "world-clock:favorites";

/**
 * Helpers for writing test payloads in the two supported
 * on-disk shapes. Both accept `unknown` for the inner
 * payload so tests can write deliberately malformed entries
 * (numbers, nulls, nested objects) without casts.
 */
function writeVersioned(ids: unknown): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ v: 1, ids }),
  );
}

function writeLegacy(ids: unknown): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(ids),
  );
}

/**
 * jsdom provides a working `localStorage`, but Vitest reuses
 * the same environment across tests in a file. Clear it before
 * every test so state cannot leak between cases.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/* -------------------------------------------------------------------------- */
/* Initial state                                                              */
/* -------------------------------------------------------------------------- */

describe("useFavorites — initial state", () => {
  it("starts with an empty list when storage is empty", () => {
    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);
  });

  it("loads a v1 versioned payload on mount", () => {
    writeVersioned(["new-york", "tokyo"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([
      "new-york",
      "tokyo",
    ]);
  });

  it("loads a legacy bare-array payload on mount", () => {
    writeLegacy(["new-york", "tokyo"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([
      "new-york",
      "tokyo",
    ]);
  });

  it("returns an empty list when storage holds corrupt JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);
  });

  it("returns an empty list when storage holds a non-array, non-object", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(42));

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);
  });

  it("returns an empty list when the versioned object has no ids field", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1 }),
    );

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);
  });

  it("returns an empty list when the ids field is not an array", () => {
    writeVersioned("not-an-array");

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);
  });

  it("filters out non-string entries", () => {
    writeLegacy(["tokyo", 42, null, "london", {}]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual(["tokyo", "london"]);
  });

  it("filters out IDs that are not in the catalog", () => {
    writeLegacy(["tokyo", "atlantis", "london"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual(["tokyo", "london"]);
  });

  it("deduplicates repeated IDs", () => {
    writeLegacy(["tokyo", "tokyo", "tokyo"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual(["tokyo"]);
  });

  it("preserves the order the IDs were stored in", () => {
    writeVersioned(["london", "tokyo", "new-york"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([
      "london",
      "tokyo",
      "new-york",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* isFavorite                                                                 */
/* -------------------------------------------------------------------------- */

describe("useFavorites — isFavorite", () => {
  it("returns true for a favorited ID", () => {
    writeVersioned(["tokyo"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.isFavorite("tokyo")).toBe(true);
  });

  it("returns false for a non-favorited ID", () => {
    const { result } = renderHook(() => useFavorites());

    expect(result.current.isFavorite("tokyo")).toBe(false);
  });

  it("returns false for an unknown ID", () => {
    const { result } = renderHook(() => useFavorites());

    expect(result.current.isFavorite("not-a-real-id")).toBe(false);
  });

  it("is stable across renders when favorites did not change", () => {
    const { result, rerender } = renderHook(() =>
      useFavorites(),
    );

    const first = result.current.isFavorite;
    rerender();
    const second = result.current.isFavorite;

    expect(first).toBe(second);
  });

  it("updates its answer after a toggle", () => {
    const { result } = renderHook(() => useFavorites());

    expect(result.current.isFavorite("tokyo")).toBe(false);

    act(() => {
      result.current.toggle("tokyo");
    });

    expect(result.current.isFavorite("tokyo")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* toggle                                                                     */
/* -------------------------------------------------------------------------- */

describe("useFavorites — toggle", () => {
  it("adds a new favorite", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
    });

    expect(result.current.favorites).toEqual(["tokyo"]);
    expect(result.current.isFavorite("tokyo")).toBe(true);
  });

  it("removes an existing favorite", () => {
    writeVersioned(["tokyo", "london"]);

    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
    });

    expect(result.current.favorites).toEqual(["london"]);
    expect(result.current.isFavorite("tokyo")).toBe(false);
  });

  it("appends new favorites in toggle order", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
    });
    act(() => {
      result.current.toggle("london");
    });
    act(() => {
      result.current.toggle("new-york");
    });

    expect(result.current.favorites).toEqual([
      "tokyo",
      "london",
      "new-york",
    ]);
  });

  it("persists a v1 versioned payload after each toggle", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
    });

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      v: 1,
      ids: ["tokyo"],
    });
  });

  it("persists removals", () => {
    writeVersioned(["tokyo", "london"]);

    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
    });

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual({
      v: 1,
      ids: ["london"],
    });
  });

  it("upgrades a legacy payload to the versioned shape on the next write", () => {
    writeLegacy(["tokyo"]);

    const { result } = renderHook(() => useFavorites());

    // The legacy payload loads correctly.
    expect(result.current.favorites).toEqual(["tokyo"]);

    act(() => {
      result.current.toggle("london");
    });

    // After the write, the shape is versioned.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual({
      v: 1,
      ids: ["tokyo", "london"],
    });
  });

  it("is idempotent under even numbers of toggles", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
      result.current.toggle("tokyo");
    });

    expect(result.current.favorites).toEqual([]);
  });

  it("keeps a stable reference across renders", () => {
    const { result, rerender } = renderHook(() => useFavorites());

    const first = result.current.toggle;
    rerender();
    const second = result.current.toggle;

    expect(first).toBe(second);
  });

  it("rejects non-catalog IDs so state stays consistent across reloads", () => {
    const { result } = renderHook(() => useFavorites());

    expect(() => {
      act(() => {
        result.current.toggle("not-a-real-id");
      });
    }).not.toThrow();

    expect(result.current.favorites).toEqual([]);
    expect(result.current.isFavorite("not-a-real-id")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejecting a non-catalog ID does not disturb existing favorites", () => {
    writeVersioned(["tokyo", "london"]);

    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("not-a-real-id");
    });

    expect(result.current.favorites).toEqual(["tokyo", "london"]);
  });

  it("toggling the same ID twice returns to the original state", () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle("tokyo");
    });
    expect(result.current.favorites).toEqual(["tokyo"]);

    act(() => {
      result.current.toggle("tokyo");
    });
    expect(result.current.favorites).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-tab sync                                                             */
/* -------------------------------------------------------------------------- */

describe("useFavorites — cross-tab sync", () => {
  it("updates when another tab writes to the same key", () => {
    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);

    act(() => {
      writeVersioned(["tokyo"]);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: window.localStorage.getItem(STORAGE_KEY),
        }),
      );
    });

    expect(result.current.favorites).toEqual(["tokyo"]);
  });

  it("ignores storage events for other keys", () => {
    writeVersioned(["tokyo"]);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual(["tokyo"]);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: "whatever",
        }),
      );
    });

    expect(result.current.favorites).toEqual(["tokyo"]);
  });

  it("handles a storage event with a null newValue (clear)", () => {
    writeVersioned(["tokyo"]);

    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual(["tokyo"]);

    act(() => {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: null,
        }),
      );
    });

    expect(result.current.favorites).toEqual([]);
  });

  it("does not dispatch its own writes back to the same tab", () => {
    /*
     * `localStorage.setItem` does not fire a `storage`
     * event in the tab that wrote it — only in other tabs.
     * jsdom honors that, but the test verifies the hook
     * does not go out of its way to synthesize one.
     */
    const { result } = renderHook(() => useFavorites());
    const listener = vi.fn();

    window.addEventListener("storage", listener);

    act(() => {
      result.current.toggle("tokyo");
    });

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("storage", listener);
  });
});

/* -------------------------------------------------------------------------- */
/* Storage failures                                                           */
/* -------------------------------------------------------------------------- */

describe("useFavorites — storage failures", () => {
  it("operates in-memory when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);

    act(() => {
      result.current.toggle("tokyo");
    });

    expect(result.current.favorites).toEqual(["tokyo"]);
  });

  it("does not throw when setItem throws (quota exceeded)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() => useFavorites());

    expect(() => {
      act(() => {
        result.current.toggle("tokyo");
      });
    }).not.toThrow();

    expect(result.current.favorites).toEqual(["tokyo"]);
  });

  it("keeps the UI list empty when storage holds an unparseable value", () => {
    window.localStorage.setItem(STORAGE_KEY, "\u0000\u0000");

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([]);
  });

  it("does not throw when removeItem is called on a disabled store", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() =>
      renderHook(() => useFavorites()),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("useFavorites — purity", () => {
  it("does not mutate the stored array on read", () => {
    const stored = ["tokyo", "london"];
    writeVersioned(stored);

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).not.toBe(stored);
    expect(result.current.favorites).toEqual(stored);
  });

  it("returns a new array reference after each toggle", () => {
    const { result } = renderHook(() => useFavorites());

    const empty = result.current.favorites;

    act(() => {
      result.current.toggle("tokyo");
    });

    expect(result.current.favorites).not.toBe(empty);
  });

  it("returns the same array reference when nothing changed", () => {
    const { result, rerender } = renderHook(() => useFavorites());

    const first = result.current.favorites;
    rerender();
    const second = result.current.favorites;

    expect(first).toBe(second);
  });
});