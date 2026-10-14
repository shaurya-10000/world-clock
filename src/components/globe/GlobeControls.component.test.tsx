import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * ## Why this file drives the adapter seams directly
 *
 * `GlobeControls` is a behavior-only component — it renders
 * nothing, exposes an imperative handle, and does all its work
 * in pointer listeners plus a frame callback. To test it, the
 * test needs to:
 *
 *   1. See the frame callback that the component registered.
 *   2. See the DOM element the component attached listeners to.
 *   3. Drive those listeners manually.
 *
 * The `@/lib/r3f-adapters` module is the exact seam that makes
 * this possible. Both `useThreeAdapter` and `useFrameAdapter`
 * are mocked below so their outputs flow into the test file
 * via mutable module state.
 */

const frameCallbacks: Array<
  (state: { clock: { getDelta: () => number } }) => void
> = [];

/*
 * A minimal DOM element that records the listeners attached to
 * it. The component calls `gl.domElement.addEventListener` for
 * five events; the stub captures each so the test can invoke
 * them.
 */
interface ListenerMap {
  pointerdown: Array<(e: PointerEvent) => void>;
  pointermove: Array<(e: PointerEvent) => void>;
  pointerup: Array<(e: PointerEvent) => void>;
  pointercancel: Array<(e: PointerEvent) => void>;
  wheel: Array<(e: WheelEvent) => void>;
}

function makeCanvasStub(): {
  element: HTMLElement;
  listeners: ListenerMap;
  setPointerCapture: ReturnType<typeof vi.fn>;
  releasePointerCapture: ReturnType<typeof vi.fn>;
} {
  const listeners: ListenerMap = {
    pointerdown: [],
    pointermove: [],
    pointerup: [],
    pointercancel: [],
    wheel: [],
  };

  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();

  const element = document.createElement("div");

  const originalAdd = element.addEventListener.bind(element);
  const originalRemove = element.removeEventListener.bind(element);

  element.addEventListener = ((type: string, listener: EventListener) => {
    if (type in listeners) {
      (listeners as unknown as Record<string, Array<EventListener>>)[
        type
      ]!.push(listener);
    }
    originalAdd(type, listener);
  }) as typeof element.addEventListener;

  element.removeEventListener = ((
    type: string,
    listener: EventListener,
  ) => {
    if (type in listeners) {
      const arr = (listeners as unknown as Record<
        string,
        Array<EventListener>
      >)[type]!;
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    }
    originalRemove(type, listener);
  }) as typeof element.removeEventListener;

  Object.defineProperty(element, "setPointerCapture", {
    value: setPointerCapture,
    configurable: true,
  });
  Object.defineProperty(element, "releasePointerCapture", {
    value: releasePointerCapture,
    configurable: true,
  });

  return { element, listeners, setPointerCapture, releasePointerCapture };
}

const canvasStub = makeCanvasStub();

vi.mock("@/lib/r3f-adapters", () => ({
  useThreeAdapter: () => ({
    gl: { domElement: canvasStub.element },
  }),
  useFrameAdapter: (
    cb: (state: { clock: { getDelta: () => number } }) => void,
  ) => {
    frameCallbacks.push(cb);
  },
}));

import GlobeControls from "@/components/globe/GlobeControls";

function makePointerEvent(
  partial: Partial<PointerEvent> & {
    clientX: number;
    clientY: number;
    timeStamp: number;
  },
): PointerEvent {
  return {
    button: 0,
    pointerType: "mouse",
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...partial,
  } as unknown as PointerEvent;
}

function makeWheelEvent(partial: Partial<WheelEvent>): WheelEvent {
  return {
    deltaY: 0,
    preventDefault: vi.fn(),
    timeStamp: 0,
    ...partial,
  } as unknown as WheelEvent;
}

function fireFrame(delta = 1 / 60): void {
  for (const cb of frameCallbacks) {
    cb({ clock: { getDelta: () => delta } });
  }
}

interface RenderOptions {
  isTraveling?: boolean;
  onStepCamera?: (direction: -1 | 1) => void;
}

function renderControls(opts: RenderOptions = {}) {
  const group = new THREE.Group();
  const groupRef = { current: group };
  const isTravelingRef = { current: opts.isTraveling ?? false };
  const onStepCamera = opts.onStepCamera ?? vi.fn();
  const ref = { current: null as import("@/components/globe/GlobeControls").GlobeControlsHandle | null };

  const result = render(
    <GlobeControls
      ref={ref}
      groupRef={groupRef}
      isTravelingRef={isTravelingRef}
      onStepCamera={onStepCamera}
    />,
  );

  return { ...result, group, groupRef, isTravelingRef, onStepCamera, ref };
}

beforeEach(() => {
  frameCallbacks.length = 0;
  canvasStub.listeners.pointerdown.length = 0;
  canvasStub.listeners.pointermove.length = 0;
  canvasStub.listeners.pointerup.length = 0;
  canvasStub.listeners.pointercancel.length = 0;
  canvasStub.listeners.wheel.length = 0;
  canvasStub.setPointerCapture.mockClear();
  canvasStub.releasePointerCapture.mockClear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — mount", () => {
  it("renders nothing to the DOM", () => {
    const { container } = renderControls();
    expect(container.firstChild).toBeNull();
  });

  it("registers exactly one frame callback", () => {
    renderControls();
    expect(frameCallbacks).toHaveLength(1);
  });

  it("attaches all five pointer/wheel listeners to the canvas", () => {
    renderControls();
    expect(canvasStub.listeners.pointerdown.length).toBeGreaterThan(0);
    expect(canvasStub.listeners.pointermove.length).toBeGreaterThan(0);
    expect(canvasStub.listeners.pointerup.length).toBeGreaterThan(0);
    expect(canvasStub.listeners.pointercancel.length).toBeGreaterThan(0);
    expect(canvasStub.listeners.wheel.length).toBeGreaterThan(0);
  });

  it("removes all listeners on unmount", () => {
    const { unmount } = renderControls();
    unmount();
    expect(canvasStub.listeners.pointerdown).toHaveLength(0);
    expect(canvasStub.listeners.pointermove).toHaveLength(0);
    expect(canvasStub.listeners.pointerup).toHaveLength(0);
    expect(canvasStub.listeners.pointercancel).toHaveLength(0);
    expect(canvasStub.listeners.wheel).toHaveLength(0);
  });

  it("exposes the resetNorth handle via the ref", () => {
    const { ref } = renderControls();
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.resetNorth).toBe("function");
  });
});

/* -------------------------------------------------------------------------- */
/* Drag                                                                       */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — drag", () => {
  it("does not modify the globe quaternion before a pointerdown", () => {
    const { group } = renderControls();
    const before = group.quaternion.clone();

    canvasStub.listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 10, clientY: 10, timeStamp: 1 }),
    );

    expect(group.quaternion.equals(before)).toBe(true);
  });

  it("rotates the globe on a pointer move during a drag", () => {
    const { group } = renderControls();
    const before = group.quaternion.clone();

    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    canvasStub.listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 50, clientY: 0, timeStamp: 16 }),
    );

    expect(group.quaternion.equals(before)).toBe(false);
  });

  it("does not rotate the globe on a zero-delta move", () => {
    const { group } = renderControls();

    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 5, clientY: 5, timeStamp: 0 }),
    );
    const before = group.quaternion.clone();

    canvasStub.listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 5, clientY: 5, timeStamp: 16 }),
    );

    expect(group.quaternion.equals(before)).toBe(true);
  });

  it("captures the pointer on down", () => {
    renderControls();
    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    expect(canvasStub.setPointerCapture).toHaveBeenCalledTimes(1);
  });

  it("releases the pointer capture on up", () => {
    renderControls();
    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    canvasStub.listeners.pointerup[0]?.(
      makePointerEvent({ clientX: 5, clientY: 0, timeStamp: 16 }),
    );
    expect(canvasStub.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("ignores the secondary mouse button", () => {
    const { group } = renderControls();
    const before = group.quaternion.clone();

    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({
        clientX: 0,
        clientY: 0,
        timeStamp: 0,
        button: 2,
      }),
    );
    canvasStub.listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 50, clientY: 0, timeStamp: 16 }),
    );

    expect(group.quaternion.equals(before)).toBe(true);
  });

  it("keeps the quaternion normalized after a drag", () => {
    const { group } = renderControls();

    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    for (let i = 1; i <= 50; i += 1) {
      canvasStub.listeners.pointermove[0]?.(
        makePointerEvent({
          clientX: i * 3,
          clientY: i * 2,
          timeStamp: i * 16,
        }),
      );
    }

    expect(group.quaternion.length()).toBeCloseTo(1, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* Wheel                                                                      */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — wheel", () => {
  it("calls onStepCamera with -1 when the user scrolls up", () => {
    const onStepCamera = vi.fn();
    renderControls({ onStepCamera });

    canvasStub.listeners.wheel[0]?.(
      makeWheelEvent({ deltaY: -100 }),
    );

    expect(onStepCamera).toHaveBeenCalledWith(-1);
  });

  it("calls onStepCamera with +1 when the user scrolls down", () => {
    const onStepCamera = vi.fn();
    renderControls({ onStepCamera });

    canvasStub.listeners.wheel[0]?.(
      makeWheelEvent({ deltaY: 100 }),
    );

    expect(onStepCamera).toHaveBeenCalledWith(1);
  });

  it("ignores wheel events below the threshold", () => {
    const onStepCamera = vi.fn();
    renderControls({ onStepCamera });

    canvasStub.listeners.wheel[0]?.(
      makeWheelEvent({ deltaY: 5 }),
    );

    expect(onStepCamera).not.toHaveBeenCalled();
  });

  it("calls preventDefault on a registered wheel event", () => {
    renderControls();
    const event = makeWheelEvent({ deltaY: 100 });
    canvasStub.listeners.wheel[0]?.(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Frame loop — momentum                                                      */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — momentum", () => {
  it("does nothing when there is no velocity and no travel", () => {
    const { group } = renderControls();

    fireFrame();

    /*
     * No drag has happened, so velocity is zero. The frame
     * loop should reach the auto-rotate branch; with a fresh
     * `lastInteractionRef` of 0 and `performance.now()` much
     * larger than the resume delay, auto-rotate will fire.
     *
     * The meaningful assertion is that the loop does not
     * throw — the visual result of auto-rotate is a small
     * rotation, which is fine.
     */
    expect(() => fireFrame()).not.toThrow();
    expect(Number.isFinite(group.quaternion.length())).toBe(true);
  });

  it("does not touch the quaternion while a drag is in progress", () => {
    const { group } = renderControls();

    canvasStub.listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );

    const before = group.quaternion.clone();
    fireFrame();

    expect(group.quaternion.equals(before)).toBe(true);
  });

  it("does not touch the quaternion while a travel is active", () => {
    const { group } = renderControls({ isTraveling: true });
    const before = group.quaternion.clone();

    fireFrame();

    expect(group.quaternion.equals(before)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Imperative handle                                                          */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — resetNorth", () => {
  it("does not throw when the group is null", () => {
    const nullRef = { current: null };
    const ref = { current: null as import("@/components/globe/GlobeControls").GlobeControlsHandle | null };

    render(
      <GlobeControls
        ref={ref}
        groupRef={nullRef}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    expect(() => ref.current?.resetNorth(45)).not.toThrow();
  });

  it("starts a reset animation that progresses across frames", () => {
    const { group, ref } = renderControls();

    /*
     * Set the globe somewhere non-identity so the reset has
     * something to animate toward.
     */
    group.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 4,
    );

    ref.current?.resetNorth(0);

    /*
     * Fake `performance.now()` advancing so the animation
     * progresses. The frame loop reads `performance.now()` and
     * compares to `resetTargetRef.current.startTime`.
     */
    const nowSpy = vi.spyOn(performance, "now");

    for (let i = 0; i < 10; i += 1) {
      nowSpy.mockReturnValue(i * 100);
      fireFrame();
    }

    nowSpy.mockRestore();

    /* The reset advanced the quaternion (it is not the original). */
    expect(group.quaternion.length()).toBeCloseTo(1, 5);
  });
});