import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  DEFAULT_VISUAL_MODE,
  VISUAL_MODE_SCHEMA_VERSION,
  VISUAL_MODE_STORAGE_KEY,
  type GlobeVisualMode,
} from "@/components/globe/constants";
import { useVisualMode } from "@/lib/useVisualMode";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Write a versioned payload exactly the way the hook does, so
 * tests exercise the real on-disk shape rather than a
 * hand-rolled approximation that could drift.
 */
function writeVersioned(mode: unknown, version: unknown): void {
  window.localStorage.setItem(
    VISUAL_MODE_STORAGE_KEY,
    JSON.stringify({ v: version, mode }),
  );
}

/**
 * Write an arbitrary raw string to the storage key. Used for
 * the corrupt-JSON and wrong-shape cases.
 */
function writeRaw(value: string): void {
  window.localStorage.setItem(VISUAL_MODE_STORAGE_KEY, value);
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

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

describe("useVisualMode — initial state", () => {
  it("starts at the default when storage is empty", () => {
    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("loads a persisted 'minimal' mode on mount", () => {
    writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe("minimal");
  });

  it("loads a persisted 'realistic' mode on mount", () => {
    writeVersioned("realistic", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe("realistic");
  });

  it("never returns null, even on the very first render", () => {
    /*
     * The public API normalizes the internal `null` sentinel
     * to the default mode. A consumer that reads
     * `visualMode` during the first render sees a valid mode.
     */
    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).not.toBeNull();
    expect(
      ["minimal", "realistic"],
    ).toContain(result.current.visualMode);
  });
});

/* -------------------------------------------------------------------------- */
/* Corrupt / wrong-shape payloads                                             */
/* -------------------------------------------------------------------------- */

describe("useVisualMode — corrupt payloads", () => {
  it("returns the default for unparseable JSON", () => {
    writeRaw("{not json");

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("returns the default for a bare string payload", () => {
    writeRaw(JSON.stringify("realistic"));

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("returns the default for a bare number payload", () => {
    writeRaw(JSON.stringify(42));

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("returns the default for a payload missing the `v` field", () => {
    writeRaw(JSON.stringify({ mode: "minimal" }));

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("returns the default for a payload missing the `mode` field", () => {
    writeRaw(
      JSON.stringify({ v: VISUAL_MODE_SCHEMA_VERSION }),
    );

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("returns the default for an unrecognized mode string", () => {
    writeVersioned(
      "holographic",
      VISUAL_MODE_SCHEMA_VERSION,
    );

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("returns the default for a numeric mode value", () => {
    writeVersioned(1, VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("ignores payloads with a future schema version", () => {
    writeVersioned(
      "minimal",
      VISUAL_MODE_SCHEMA_VERSION + 1,
    );

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("ignores payloads with a past schema version", () => {
    writeVersioned(
      "minimal",
      VISUAL_MODE_SCHEMA_VERSION - 1,
    );

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("ignores payloads with a non-numeric version", () => {
    writeVersioned("minimal", "1");

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });
});

/* -------------------------------------------------------------------------- */
/* setVisualMode                                                              */
/* -------------------------------------------------------------------------- */

describe("useVisualMode — setVisualMode", () => {
  it("updates the in-memory mode", () => {
    const { result } = renderHook(() => useVisualMode());

    act(() => {
      result.current.setVisualMode("minimal");
    });

    expect(result.current.visualMode).toBe("minimal");
  });

  it("persists the mode with the current schema version", () => {
    const { result } = renderHook(() => useVisualMode());

    act(() => {
      result.current.setVisualMode("minimal");
    });

    const raw = window.localStorage.getItem(
      VISUAL_MODE_STORAGE_KEY,
    );

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      v: VISUAL_MODE_SCHEMA_VERSION,
      mode: "minimal",
    });
  });

  it("persists a change back to the default mode", () => {
    writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());

    act(() => {
      result.current.setVisualMode("realistic");
    });

    const raw = window.localStorage.getItem(
      VISUAL_MODE_STORAGE_KEY,
    );

    expect(JSON.parse(raw as string)).toEqual({
      v: VISUAL_MODE_SCHEMA_VERSION,
      mode: "realistic",
    });
  });

  it("is a no-op for an invalid mode (does not touch state)", () => {
    writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());

    act(() => {
      // Simulate a caller who reached the hook through
      // `any` and passed garbage.
      (
        result.current.setVisualMode as (
          m: string,
        ) => void
      )("holographic");
    });

    expect(result.current.visualMode).toBe("minimal");

    const raw = window.localStorage.getItem(
      VISUAL_MODE_STORAGE_KEY,
    );

    expect(JSON.parse(raw as string)).toEqual({
      v: VISUAL_MODE_SCHEMA_VERSION,
      mode: "minimal",
    });
  });

  it("is a no-op for an invalid mode (does not touch storage)", () => {
    const { result } = renderHook(() => useVisualMode());

    act(() => {
      (
        result.current.setVisualMode as (
          m: string,
        ) => void
      )("holographic");
    });

    /*
     * Nothing was written — the store still has no
     * preference for this key. That matters because an
     * invalid write would be interpreted as a corrupt
     * payload on next load, silently losing the user's
     * previous choice.
     */
    expect(
      window.localStorage.getItem(VISUAL_MODE_STORAGE_KEY),
    ).toBeNull();
  });

  it("keeps a stable reference across renders", () => {
    const { result, rerender } = renderHook(() =>
      useVisualMode(),
    );

    const first = result.current.setVisualMode;
    rerender();
    const second = result.current.setVisualMode;

    expect(first).toBe(second);
  });

  it("is idempotent — setting the same mode twice is safe", () => {
    const { result } = renderHook(() => useVisualMode());

    act(() => {
      result.current.setVisualMode("minimal");
      result.current.setVisualMode("minimal");
    });

    expect(result.current.visualMode).toBe("minimal");

    const raw = window.localStorage.getItem(
      VISUAL_MODE_STORAGE_KEY,
    );

    expect(JSON.parse(raw as string)).toEqual({
      v: VISUAL_MODE_SCHEMA_VERSION,
      mode: "minimal",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-tab sync                                                             */
/* -------------------------------------------------------------------------- */

describe("useVisualMode — cross-tab sync", () => {
  it("updates when another tab writes the same key", () => {
    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);

    act(() => {
      writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VISUAL_MODE_STORAGE_KEY,
          newValue: window.localStorage.getItem(
            VISUAL_MODE_STORAGE_KEY,
          ),
        }),
      );
    });

    expect(result.current.visualMode).toBe("minimal");
  });

  it("ignores storage events for other keys", () => {
    writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe("minimal");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: JSON.stringify({
            v: 1,
            mode: "realistic",
          }),
        }),
      );
    });

    expect(result.current.visualMode).toBe("minimal");
  });

  it("handles a storage event with a null newValue (cleared)", () => {
    writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());
    expect(result.current.visualMode).toBe("minimal");

    act(() => {
      window.localStorage.removeItem(
        VISUAL_MODE_STORAGE_KEY,
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VISUAL_MODE_STORAGE_KEY,
          newValue: null,
        }),
      );
    });

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("reverts to the default when another tab writes a corrupt value", () => {
    writeVersioned("minimal", VISUAL_MODE_SCHEMA_VERSION);

    const { result } = renderHook(() => useVisualMode());
    expect(result.current.visualMode).toBe("minimal");

    act(() => {
      writeRaw("{not json");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VISUAL_MODE_STORAGE_KEY,
          newValue: "{not json",
        }),
      );
    });

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);
  });

  it("does not dispatch its own writes back to the same tab", () => {
    /*
     * `localStorage.setItem` does not fire a `storage`
     * event in the tab that wrote it — only in other tabs.
     * jsdom honors that, but the test verifies the hook
     * does not go out of its way to synthesize one.
     */
    const { result } = renderHook(() => useVisualMode());
    const listener = vi.fn();

    window.addEventListener("storage", listener);

    act(() => {
      result.current.setVisualMode("minimal");
    });

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("storage", listener);
  });
});

/* -------------------------------------------------------------------------- */
/* Storage failures                                                           */
/* -------------------------------------------------------------------------- */

describe("useVisualMode — storage failures", () => {
  it("operates in-memory when getItem throws", () => {
    vi.spyOn(
      Storage.prototype,
      "getItem",
    ).mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useVisualMode());

    expect(result.current.visualMode).toBe(DEFAULT_VISUAL_MODE);

    act(() => {
      result.current.setVisualMode("minimal");
    });

    expect(result.current.visualMode).toBe("minimal");
  });

  it("does not throw when setItem throws (quota exceeded)", () => {
    vi.spyOn(
      Storage.prototype,
      "setItem",
    ).mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() => useVisualMode());

    expect(() => {
      act(() => {
        result.current.setVisualMode("minimal");
      });
    }).not.toThrow();

    /*
     * In-memory state advanced even though persistence
     * failed. The user sees the change immediately; only
     * persistence across a reload is lost.
     */
    expect(result.current.visualMode).toBe("minimal");
  });

  it("does not throw on an unparseable stored value", () => {
    writeRaw("\u0000\u0000");

    expect(() =>
      renderHook(() => useVisualMode()),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("useVisualMode — purity", () => {
  it("returns a stable mode reference when nothing changed", () => {
    /*
     * `visualMode` is a string, so identity is trivial — but
     * the test pins the contract that the hook does not
     * return a wrapper object that changes identity on
     * every render.
     */
    const { result, rerender } = renderHook(() =>
      useVisualMode(),
    );

    const first = result.current.visualMode;
    rerender();
    const second = result.current.visualMode;

    expect(first).toBe(second);
  });

  it("returns the same mode string as what was persisted", () => {
    const { result } = renderHook(() => useVisualMode());

    act(() => {
      result.current.setVisualMode("minimal");
    });

    const raw = window.localStorage.getItem(
      VISUAL_MODE_STORAGE_KEY,
    );

    const persisted = JSON.parse(raw as string) as {
      mode: GlobeVisualMode;
    };

    expect(persisted.mode).toBe(result.current.visualMode);
  });
});