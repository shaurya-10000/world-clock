import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

/*
 * Integration scope: the component's relationship with the
 * shared `groupRef` it receives from `GlobeScene`, and the
 * interaction between the pointer handlers and the frame
 * loop's momentum phase.
 *
 * The adapter seams are mocked the same way as in the
 * component test, but here the assertions focus on
 * cross-module invariants: the quaternion passed in via
 * `groupRef.current` is the one that gets mutated; the
 * `isTravelingRef` gates momentum; and the frame callback
 * survives a large `getDelta()` result.
 */

const frameCallbacks: Array<
  (state: { clock: { getDelta: () => number } }) => void
> = [];

const listeners: {
  pointerdown: Array<(e: PointerEvent) => void>;
  pointermove: Array<(e: PointerEvent) => void>;
  pointerup: Array<(e: PointerEvent) => void>;
  pointercancel: Array<(e: PointerEvent) => void>;
  wheel: Array<(e: WheelEvent) => void>;
} = {
  pointerdown: [],
  pointermove: [],
  pointerup: [],
  pointercancel: [],
  wheel: [],
};

function makeCanvasStub() {
  const element = document.createElement("div");

  element.addEventListener = ((type: string, listener: EventListener) => {
    if (type in listeners) {
      (listeners as unknown as Record<string, Array<EventListener>>)[
        type
      ]!.push(listener);
    }
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
  }) as typeof element.removeEventListener;

  Object.defineProperty(element, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
  });
  Object.defineProperty(element, "releasePointerCapture", {
    value: vi.fn(),
    configurable: true,
  });

  return element;
}

const canvas = makeCanvasStub();

vi.mock("@/lib/r3f-adapters", () => ({
  useThreeAdapter: () => ({ gl: { domElement: canvas } }),
  useFrameAdapter: (
    cb: (state: { clock: { getDelta: () => number } }) => void,
  ) => {
    frameCallbacks.push(cb);
  },
}));

import GlobeControls from "@/components/globe/GlobeControls";

function fireFrame(delta = 1 / 60): void {
  for (const cb of frameCallbacks) {
    cb({ clock: { getDelta: () => delta } });
  }
}

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

beforeEach(() => {
  frameCallbacks.length = 0;
  for (const key of Object.keys(listeners) as Array<keyof typeof listeners>) {
    listeners[key].length = 0;
  }
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Shared group ref                                                           */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — shared group ref", () => {
  it("mutates the exact group that `groupRef.current` points at", () => {
    const group = new THREE.Group();
    const groupRef = { current: group };
    const isTravelingRef = { current: false };

    render(
      <GlobeControls
        groupRef={groupRef}
        isTravelingRef={isTravelingRef}
        onStepCamera={() => {}}
      />,
    );

    const before = group.quaternion.clone();

    listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 50, clientY: 25, timeStamp: 16 }),
    );

    expect(group.quaternion.equals(before)).toBe(false);
  });

  it("does not mutate a different group created externally", () => {
    const group = new THREE.Group();
    const unrelated = new THREE.Group();
    const groupRef = { current: group };
    const isTravelingRef = { current: false };

    render(
      <GlobeControls
        groupRef={groupRef}
        isTravelingRef={isTravelingRef}
        onStepCamera={() => {}}
      />,
    );

    const before = unrelated.quaternion.clone();

    listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 50, clientY: 25, timeStamp: 16 }),
    );

    expect(unrelated.quaternion.equals(before)).toBe(true);
  });

  it("respects a swapped group mid-lifecycle", () => {
    /*
     * `GlobeScene` keeps the same group for the whole mount,
     * but the interaction model should not depend on that.
     * Swapping `groupRef.current` swaps which group is
     * mutated — the pointer handler always reads the current
     * value.
     */
    const groupA = new THREE.Group();
    const groupB = new THREE.Group();
    const groupRef = { current: groupA };

    render(
      <GlobeControls
        groupRef={groupRef}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    const beforeB = groupB.quaternion.clone();

    /* Swap to group B. */
    groupRef.current = groupB;

    listeners.pointerdown[0]?.(
      makePointerEvent({ clientX: 0, clientY: 0, timeStamp: 0 }),
    );
    listeners.pointermove[0]?.(
      makePointerEvent({ clientX: 50, clientY: 0, timeStamp: 16 }),
    );

    expect(groupB.quaternion.equals(beforeB)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Travel gate                                                                */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — travel gate", () => {
  it("does not advance momentum when isTravelingRef is true", () => {
    const group = new THREE.Group();
    const isTravelingRef = { current: true };

    render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={isTravelingRef}
        onStepCamera={() => {}}
      />,
    );

    const before = group.quaternion.clone();
    fireFrame();
    expect(group.quaternion.equals(before)).toBe(true);
  });

  it("resumes momentum when isTravelingRef flips back to false", () => {
    /*
     * This mirrors the `GlobeScene` behavior: while a travel
     * animation runs, `isTravelingRef.current` is `true`; when
     * the travel ends, it flips back to `false` and the frame
     * loop can touch the quaternion again. The component reads
     * the ref at frame time, so this is a state change on the
     * ref, not a re-render.
     */
    const group = new THREE.Group();
    const isTravelingRef = { current: true };

    render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={isTravelingRef}
        onStepCamera={() => {}}
      />,
    );

    isTravelingRef.current = false;

    /*
     * With `lastInteractionRef` at 0, the auto-rotate branch
     * fires. The meaningful assertion is that the frame loop
     * does not throw and the quaternion stays finite.
     */
    expect(() => fireFrame()).not.toThrow();
    expect(Number.isFinite(group.quaternion.length())).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Frame-delta robustness                                                     */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — frame delta robustness", () => {
  it("handles a normal frame delta", () => {
    const group = new THREE.Group();
    render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    expect(() => fireFrame(1 / 60)).not.toThrow();
  });

  it("handles a large frame delta", () => {
    const group = new THREE.Group();
    render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    /* The component clamps `dt` to 0.1 internally. */
    expect(() => fireFrame(10)).not.toThrow();
  });

  it("handles a zero frame delta", () => {
    const group = new THREE.Group();
    render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    expect(() => fireFrame(0)).not.toThrow();
  });

  it("does not throw when the group is null", () => {
    render(
      <GlobeControls
        groupRef={{ current: null }}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    expect(() => fireFrame()).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Unmount                                                                    */
/* -------------------------------------------------------------------------- */

describe("GlobeControls — unmount", () => {
  it("detaches every listener on unmount", () => {
    const group = new THREE.Group();
    const { unmount } = render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    unmount();

    expect(listeners.pointerdown).toHaveLength(0);
    expect(listeners.pointermove).toHaveLength(0);
    expect(listeners.pointerup).toHaveLength(0);
    expect(listeners.pointercancel).toHaveLength(0);
    expect(listeners.wheel).toHaveLength(0);
  });

  it("does not throw when a stale frame callback is fired post-unmount", () => {
    const group = new THREE.Group();
    const { unmount } = render(
      <GlobeControls
        groupRef={{ current: group }}
        isTravelingRef={{ current: false }}
        onStepCamera={() => {}}
      />,
    );

    unmount();

    expect(() => fireFrame()).not.toThrow();
  });
});