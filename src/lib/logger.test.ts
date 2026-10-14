import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * `process.env` in `@types/node` declares `NODE_ENV` as
 * `readonly`, and other keys as `string | undefined`. Tests
 * need to mutate both for each scenario, so this helper
 * centralizes the unsafe write in one place — with a comment
 * explaining why the cast is required — rather than sprinkling
 * `as any` casts through the file.
 */
function setEnv(key: string, value: string): void {
  (process.env as Record<string, string>)[key] = value;
}

function deleteEnv(key: string): void {
  delete (process.env as Record<string, string | undefined>)[key];
}

const ENV_KEYS = [
  "NEXT_PUBLIC_LOG_LEVEL",
  "NODE_ENV",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

let originalEnv: Record<EnvKey, string | undefined>;

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();

  originalEnv = {
    NEXT_PUBLIC_LOG_LEVEL:
      process.env.NEXT_PUBLIC_LOG_LEVEL,
    NODE_ENV: process.env.NODE_ENV,
  };
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      deleteEnv(key);
    } else {
      setEnv(key, value);
    }
  }
});

/** Spy on all four console methods the logger can call. */
function spyOnConsole() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi
      .spyOn(console, "error")
      .mockImplementation(() => {}),
  };
}

/** Re-import the logger fresh so it picks up the current env. */
async function loadLogger() {
  return await import("@/lib/logger");
}

/* -------------------------------------------------------------------------- */
/* Level policy                                                               */
/* -------------------------------------------------------------------------- */

describe("logger level policy", () => {
  describe("development (NODE_ENV !== 'production')", () => {
    beforeEach(() => {
      setEnv("NODE_ENV", "development");
      deleteEnv("NEXT_PUBLIC_LOG_LEVEL");
    });

    it("defaults to 'debug' — emits every level", async () => {
      const spies = spyOnConsole();
      const { logDebug, logInfo, logWarn, logError } =
        await loadLogger();

      logDebug("d");
      logInfo("i");
      logWarn("w");
      logError("e");

      expect(spies.log).toHaveBeenCalledTimes(1);
      expect(spies.info).toHaveBeenCalledTimes(1);
      expect(spies.warn).toHaveBeenCalledTimes(1);
      expect(spies.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("production (NODE_ENV === 'production')", () => {
    beforeEach(() => {
      setEnv("NODE_ENV", "production");
      deleteEnv("NEXT_PUBLIC_LOG_LEVEL");
    });

    it("defaults to 'error' — suppresses debug, info, warn", async () => {
      const spies = spyOnConsole();
      const { logDebug, logInfo, logWarn, logError } =
        await loadLogger();

      logDebug("d");
      logInfo("i");
      logWarn("w");
      logError("e");

      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.info).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("explicit NEXT_PUBLIC_LOG_LEVEL overrides", () => {
    it.each([
      ["debug", { log: 1, info: 1, warn: 1, error: 1 }],
      ["info", { log: 0, info: 1, warn: 1, error: 1 }],
      ["warn", { log: 0, info: 0, warn: 1, error: 1 }],
      ["error", { log: 0, info: 0, warn: 0, error: 1 }],
      ["silent", { log: 0, info: 0, warn: 0, error: 0 }],
    ] as const)(
      "level=%s gates each method correctly",
      async (level, expected) => {
        setEnv("NODE_ENV", "development");
        setEnv("NEXT_PUBLIC_LOG_LEVEL", level);

        const spies = spyOnConsole();
        const { logDebug, logInfo, logWarn, logError } =
          await loadLogger();

        logDebug("d");
        logInfo("i");
        logWarn("w");
        logError("e");

        expect(spies.log).toHaveBeenCalledTimes(expected.log);
        expect(spies.info).toHaveBeenCalledTimes(expected.info);
        expect(spies.warn).toHaveBeenCalledTimes(expected.warn);
        expect(spies.error).toHaveBeenCalledTimes(expected.error);
      },
    );

    it("overrides the production default to allow debug output", async () => {
      setEnv("NODE_ENV", "production");
      setEnv("NEXT_PUBLIC_LOG_LEVEL", "debug");

      const spies = spyOnConsole();
      const { logDebug } = await loadLogger();

      logDebug("visible");

      expect(spies.log).toHaveBeenCalledTimes(1);
    });

    it("overrides the development default to silence everything", async () => {
      setEnv("NODE_ENV", "development");
      setEnv("NEXT_PUBLIC_LOG_LEVEL", "silent");

      const spies = spyOnConsole();
      const { logDebug, logInfo, logWarn, logError } =
        await loadLogger();

      logDebug("d");
      logInfo("i");
      logWarn("w");
      logError("e");

      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.info).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
    });

    it("falls back to the environment default when the value is unrecognized", async () => {
      // A typo in `.env` should never crash the app — the
      // logger silently uses the default instead.
      setEnv("NODE_ENV", "development");
      setEnv("NEXT_PUBLIC_LOG_LEVEL", "verbose");

      const spies = spyOnConsole();
      const { logDebug } = await loadLogger();

      logDebug("visible");

      expect(spies.log).toHaveBeenCalledTimes(1);
    });

    it("ignores case-mismatched level names", async () => {
      setEnv("NODE_ENV", "production");
      setEnv("NEXT_PUBLIC_LOG_LEVEL", "DEBUG");

      const spies = spyOnConsole();
      const { logDebug, logError } = await loadLogger();

      logDebug("d");
      logError("e");

      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.error).toHaveBeenCalledTimes(1);
    });

    it("ignores an empty-string level and uses the env default", async () => {
      setEnv("NODE_ENV", "development");
      setEnv("NEXT_PUBLIC_LOG_LEVEL", "");

      const spies = spyOnConsole();
      const { logDebug } = await loadLogger();

      logDebug("visible");

      expect(spies.log).toHaveBeenCalledTimes(1);
    });

    it("silent overrides even in production", async () => {
      setEnv("NODE_ENV", "production");
      setEnv("NEXT_PUBLIC_LOG_LEVEL", "silent");

      const spies = spyOnConsole();
      const { logError } = await loadLogger();

      logError("hidden");

      expect(spies.error).not.toHaveBeenCalled();
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Message shape                                                              */
/* -------------------------------------------------------------------------- */

describe("log message shape", () => {
  beforeEach(() => {
    setEnv("NODE_ENV", "development");
    deleteEnv("NEXT_PUBLIC_LOG_LEVEL");
  });

  it("prefixes every message with the brand tag", async () => {
    const spies = spyOnConsole();
    const { logInfo } = await loadLogger();

    logInfo("hello");

    expect(spies.info).toHaveBeenCalledWith(
      "[world-clock]",
      "hello",
    );
  });

  it("forwards extra arguments untouched", async () => {
    const spies = spyOnConsole();
    const { logInfo } = await loadLogger();

    const payload = { userId: 42, ok: true };
    logInfo("event", payload, 7, null);

    expect(spies.info).toHaveBeenCalledWith(
      "[world-clock]",
      "event",
      payload,
      7,
      null,
    );
  });

  it("preserves the object reference for the extra argument", async () => {
    const spies = spyOnConsole();
    const { logInfo } = await loadLogger();

    const payload = { a: 1 };
    logInfo("with ref", payload);

    const call = spies.info.mock.calls[0];
    expect(call).toBeDefined();
    const forwarded = call?.[2];
    expect(forwarded).toBe(payload);
  });

  it("does not invoke the console when the level is suppressed", async () => {
    setEnv("NEXT_PUBLIC_LOG_LEVEL", "silent");

    const spies = spyOnConsole();
    const { logDebug } = await loadLogger();

    logDebug("filtered", { heavy: "payload" });

    expect(spies.log).not.toHaveBeenCalled();
  });

  it("never throws when given no extra arguments", async () => {
    spyOnConsole();
    const { logDebug, logInfo, logWarn, logError } =
      await loadLogger();

    expect(() => logDebug("d")).not.toThrow();
    expect(() => logInfo("i")).not.toThrow();
    expect(() => logWarn("w")).not.toThrow();
    expect(() => logError("e")).not.toThrow();
  });

  it("never throws when given non-string extra arguments", async () => {
    spyOnConsole();
    const { logInfo } = await loadLogger();

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logInfo("weird", circular)).not.toThrow();
    expect(() => logInfo("sym", Symbol("x"))).not.toThrow();
    expect(() => logInfo("fn", () => undefined)).not.toThrow();
  });

  it("never throws when given no message string", async () => {
    /*
     * TypeScript prevents this in practice, but a JS caller
     * or a `as any` escape hatch could pass `undefined`. The
     * logger must not crash — it forwards whatever it gets.
     */
    spyOnConsole();
    const { logInfo } = await loadLogger();

    expect(() =>
      (logInfo as (m: unknown) => void)(undefined),
    ).not.toThrow();
  });

  it("preserves the shape of every level's prefix", async () => {
    const spies = spyOnConsole();
    const { logDebug, logInfo, logWarn, logError } =
      await loadLogger();

    logDebug("d");
    logInfo("i");
    logWarn("w");
    logError("e");

    for (const spy of [
      spies.log,
      spies.info,
      spies.warn,
      spies.error,
    ]) {
      expect(spy.mock.calls[0]?.[0]).toBe("[world-clock]");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

describe("console wiring", () => {
  beforeEach(() => {
    setEnv("NODE_ENV", "development");
    setEnv("NEXT_PUBLIC_LOG_LEVEL", "debug");
  });

  it("routes each level to the matching console method", async () => {
    const spies = spyOnConsole();
    const { logDebug, logInfo, logWarn, logError } =
      await loadLogger();

    logDebug("d");
    logInfo("i");
    logWarn("w");
    logError("e");

    expect(spies.log).toHaveBeenCalledTimes(1);
    expect(spies.info).toHaveBeenCalledTimes(1);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("logs every call — no deduplication or throttling", async () => {
    const spies = spyOnConsole();
    const { logInfo } = await loadLogger();

    logInfo("a");
    logInfo("b");
    logInfo("c");

    expect(spies.info).toHaveBeenCalledTimes(3);
  });

  it("does not cross-route — logInfo never touches console.log", async () => {
    const spies = spyOnConsole();
    const { logInfo, logWarn, logError } = await loadLogger();

    logInfo("i");
    logWarn("w");
    logError("e");

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledTimes(1);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("returns void from every level", async () => {
    spyOnConsole();
    const { logDebug, logInfo, logWarn, logError } =
      await loadLogger();

    expect(logDebug("d")).toBeUndefined();
    expect(logInfo("i")).toBeUndefined();
    expect(logWarn("w")).toBeUndefined();
    expect(logError("e")).toBeUndefined();
  });

  it("returns void even when the level is suppressed", async () => {
    setEnv("NEXT_PUBLIC_LOG_LEVEL", "silent");
    spyOnConsole();

    const { logDebug, logInfo, logWarn, logError } =
      await loadLogger();

    expect(logDebug("d")).toBeUndefined();
    expect(logInfo("i")).toBeUndefined();
    expect(logWarn("w")).toBeUndefined();
    expect(logError("e")).toBeUndefined();
  });
});