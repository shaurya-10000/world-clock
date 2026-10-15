"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";

import { logDebug } from "@/lib/logger";
import {
  useFrameAdapter,
  useThreeAdapter,
} from "@/lib/r3f-adapters";

import {
  AUTO_ROTATE_RESUME_DELAY_MS,
  AUTO_ROTATE_SPEED,
  DRAG_SENSITIVITY,
  MOMENTUM_DECAY_PER_SECOND,
  MOMENTUM_MIN_VELOCITY,
  NORTH_RESET_DURATION,
  WHEEL_STEP_DELTA,
} from "./constants";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Number of recent pointer deltas kept for velocity
 * estimation.
 *
 * More samples means smoother velocity but a longer tail
 * before a change in direction is reflected. 6 corresponds
 * to roughly 100 ms of movement at 60 Hz — long enough to
 * reject a single jittery frame, short enough to feel
 * responsive.
 */
const VELOCITY_SAMPLE_COUNT = 6;

/**
 * The maximum time a single frame is allowed to advance the
 * simulation, in seconds.
 *
 * When the tab is backgrounded, `requestAnimationFrame`
 * stops firing but the clock keeps ticking. On resume, the
 * first `dt` can be tens of seconds, which would jump the
 * globe by a huge amount if it were applied directly.
 * Clamping to 100 ms makes a resume indistinguishable from a
 * slow frame.
 */
const MAX_FRAME_DELTA_SECONDS = 0.1;

/**
 * How much the distance between two fingers must change,
 * relative to where it was when the last zoom step fired (or
 * when the pinch began), before another camera step is taken.
 *
 * A value of 1.25 means: spreading the fingers 25% further
 * apart zooms in one step, bringing them 20% (1 / 1.25)
 * closer together zooms out one step. After each step the
 * baseline is reset to the current distance, so one long
 * pinch can walk several steps along the camera-distance
 * ladder.
 */
const PINCH_STEP_RATIO = 1.25;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface GlobeControlsHandle {
  /**
   * Animate the globe to face the given latitude with the
   * poles vertical on screen.
   *
   * Called by the "reset north" button in `Globe.tsx`.
   */
  readonly resetNorth: (latitude: number) => void;
}

interface GlobeControlsProps {
  /**
   * The globe group whose quaternion this component rotates.
   *
   * The ref points at a `THREE.Group` created by `GlobeScene`.
   * This component never renders a mesh — it only mutates the
   * group's rotation in response to user input.
   */
  readonly groupRef: React.RefObject<THREE.Group | null>;

  /**
   * Whether a travel animation is currently running. Read
   * from the frame loop on every frame.
   *
   * A ref rather than a boolean so the frame callback does
   * not have to be re-created (and therefore re-subscribed)
   * every time the travel state flips.
   */
  readonly isTravelingRef: React.RefObject<boolean>;

  /**
   * Fired when the user scrolls or pinches past the wheel
   * threshold. `direction` is `-1` to zoom in (closer to the
   * globe) or `+1` to zoom out.
   */
  readonly onStepCamera: (direction: -1 | 1) => void;

  /**
   * Imperative handle for programmatic control. Only
   * `resetNorth` is exposed today.
   */
  readonly ref?: React.Ref<GlobeControlsHandle>;
}

/* -------------------------------------------------------------------------- */
/* Module-scope scratch                                                       */
/* -------------------------------------------------------------------------- */

/*
 * Scratch objects reused every frame. Allocating a new
 * `Quaternion` inside the frame loop — or inside the
 * pointer-move handler, which fires at pointer-polling
 * frequency — would churn the GC. The frame loop in
 * particular can run for seconds at a time during momentum;
 * the allocations would add up.
 *
 * ## Two scratch sets, one per path
 *
 * The pointer path and the frame path each get their own
 * pair of quaternions. An earlier version of this file
 * shared one pair between the two paths; it was safe
 * because pointer events and rAF callbacks never interleave
 * within a single JS turn, but the safety was subtle and
 * not obvious from the code. The split is explicit now.
 *
 * Each pair is `(yaw, pitch)`, composed into a `composed`
 * scratch. The `composed` scratch is per-path because the
 * pointer path's composed delta is applied immediately,
 * while the frame path's is applied after the momentum
 * decay calculation. Sharing a `composed` between the two
 * would risk the frame loop overwriting the pointer delta
 * before it is premultiplied — again, only in exotic
 * scenarios, but cheap to prevent.
 *
 * Module-scope rather than instance-scope because this
 * codebase mounts exactly one `GlobeControls` per document.
 * If a future feature ever renders a second globe in the
 * same page, these must become instance-scope refs.
 */

const pointerYawQuaternion = new THREE.Quaternion();
const pointerPitchQuaternion = new THREE.Quaternion();
const pointerComposedQuaternion = new THREE.Quaternion();

const frameYawQuaternion = new THREE.Quaternion();
const framePitchQuaternion = new THREE.Quaternion();
const frameComposedQuaternion = new THREE.Quaternion();

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/* -------------------------------------------------------------------------- */
/* Momentum sample buffer                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A fixed-length ring buffer for pointer-move samples.
 *
 * The buffer has a fixed capacity of `VELOCITY_SAMPLE_COUNT`
 * and overwrites the oldest entry in place, rather than
 * `shift`-ing a growing array. `shift` is O(n); the ring
 * buffer is O(1) per push. Pointer events fire at
 * pointer-polling frequency (~120 Hz on some devices), and
 * during a long drag the shift cost is the dominant
 * per-event work.
 *
 * The iteration order for reading (`forEach` for the
 * velocity computation) is oldest-to-newest, matching the
 * array-based version this replaced.
 */
class MomentumBuffer {
  private readonly dx: Float32Array;
  private readonly dy: Float32Array;
  private readonly dt: Float32Array;
  private readonly capacity: number;
  private size: number;
  private writeIndex: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.dx = new Float32Array(capacity);
    this.dy = new Float32Array(capacity);
    this.dt = new Float32Array(capacity);
    this.size = 0;
    this.writeIndex = 0;
  }

  clear(): void {
    this.size = 0;
    this.writeIndex = 0;
  }

  push(dx: number, dy: number, dt: number): void {
    this.dx[this.writeIndex] = dx;
    this.dy[this.writeIndex] = dy;
    this.dt[this.writeIndex] = dt;

    this.writeIndex = (this.writeIndex + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  /**
   * Sum the stored samples into (dx, dy, dt). Only samples
   * with a non-zero delta contribute — the initial
   * pointer-down often has one or two frames where the
   * position is identical, and those would bias the average
   * toward zero velocity.
   *
   * Returns `null` when no sample has moved.
   */
  sumMoving(): { dx: number; dy: number; dt: number } | null {
    let sumDx = 0;
    let sumDy = 0;
    let sumDt = 0;
    let moved = false;

    for (let i = 0; i < this.size; i += 1) {
      const index = (this.writeIndex - this.size + i + this.capacity) %
        this.capacity;
      const sampleDx = this.dx[index]!;
      const sampleDy = this.dy[index]!;

      if (sampleDx === 0 && sampleDy === 0) continue;

      moved = true;
      sumDx += sampleDx;
      sumDy += sampleDy;
      sumDt += this.dt[index]!;
    }

    return moved ? { dx: sumDx, dy: sumDy, dt: sumDt } : null;
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pointer-driven globe rotation.
 *
 * Implements the Google-Earth interaction model: the camera
 * is fixed on the equator plane, and the user spins the
 * globe by dragging. This is the opposite of R3F's
 * `<OrbitControls>`, which orbits the camera around a
 * stationary globe — a model that fails for a sphere-of-the-
 * Earth app because it makes "north" move when the user
 * expects the geography to move.
 *
 * Handles four interaction modes:
 *
 *   1. **Drag** — pointer down, move, up. The globe's
 *      quaternion is composed with an axis-angle rotation
 *      derived from the screen delta.
 *   2. **Momentum** — after release, the globe continues to
 *      spin with an exponentially decaying velocity
 *      estimated from the last few drag samples.
 *   3. **Auto-rotate** — after
 *      `AUTO_ROTATE_RESUME_DELAY_MS` of inactivity, the
 *      globe starts a slow idle Y-axis spin.
 *   4. **Zoom** — wheel events and two-finger touch pinches
 *      advance steps on the camera-distance ladder in
 *      `Globe.tsx`. While two fingers are down the globe does
 *      not rotate; it only zooms.
 *
 * All rotation work happens in the frame loop by mutating
 * the globe group's quaternion directly. No React state is
 * written per frame — that would re-render the whole scene
 * 60 times a second. The only state this component tracks
 * is the interaction phase, which flips rarely.
 *
 * ## Clock consistency
 *
 * All timestamp comparisons are within the same clock. The
 * reset-north animation uses `performance.now()` for both
 * its start time and its per-frame elapsed calculation. An
 * earlier version seeded the start time from
 * `event.timeStamp`, which is a different epoch than
 * `performance.now()` and produced a "reset does nothing on
 * the first click" failure when the two clocks disagreed.
 *
 * Pointer-move velocity estimation uses `event.timeStamp`
 * because the two samples being compared are both from
 * pointer events. That is a different concern from the
 * reset animation and correctly uses a different clock.
 *
 * ## Interaction-phase state is all refs
 *
 * Every piece of interaction state in this component is a
 * ref. None of it is React state, and none of it is
 * intended to trigger a re-render. The component's only
 * observable output is the mutation of the globe group's
 * quaternion — which the render loop of the parent scene
 * picks up automatically.
 */
export default function GlobeControls({
  groupRef,
  isTravelingRef,
  onStepCamera,
  ref,
}: GlobeControlsProps) {
  const { gl } = useThreeAdapter();

  /* Whether a pointer drag is currently in progress. */
  const isDraggingRef = useRef(false);

  /* Pointer position and timestamp during an active drag. */
  const lastPointerRef = useRef<{
    x: number;
    y: number;
    t: number;
  }>({
    x: 0,
    y: 0,
    t: 0,
  });

  /*
   * Ring buffer of recent drag deltas, used to estimate the
   * release velocity.
   */
  const samplesRef = useRef(new MomentumBuffer(VELOCITY_SAMPLE_COUNT));

  /*
   * Angular velocity carried over from the last drag release,
   * in radians per second. Decayed per frame; consumed by
   * the frame callback.
   */
  const velocityRef = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  /*
   * Timestamp of the last user interaction (any pointer or
   * wheel event), in `performance.now()` milliseconds. Used
   * to gate auto-rotate.
   */
  const lastInteractionRef = useRef<number>(0);

  /*
   * Currently-down touch pointers, keyed by `pointerId`, with
   * their latest client position. Only touch pointers are
   * tracked; mouse and pen input keep the plain single-pointer
   * drag path.
   */
  const touchPointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );

  /*
   * Pinch-zoom state. `active` is true while two or more touch
   * pointers are down. `baseDistance` is the finger distance
   * the next zoom step is measured against. Mutated in place.
   */
  const pinchRef = useRef<{ active: boolean; baseDistance: number }>({
    active: false,
    baseDistance: 0,
  });

  /*
   * The reset-north animation is orchestrated in the frame
   * loop below, using a start-quaternion / target-quaternion
   * / start-time triple. Set when `resetNorth` is called;
   * cleared when the animation completes or the user grabs
   * the globe.
   *
   * `startTime` is in `performance.now()` milliseconds,
   * matching the clock the frame loop reads.
   */
  const resetTargetRef = useRef<{
    startQuaternion: THREE.Quaternion;
    targetQuaternion: THREE.Quaternion;
    startTime: number;
  } | null>(null);

  /* ------------------------------------------------------------------ */
  /* Reset north — imperative handle                                    */
  /* ------------------------------------------------------------------ */

  /**
   * The reset-north handler. Stable across renders because
   * its only external dependency is `groupRef`, which is a
   * `useRef` and never changes identity.
   */
  const resetNorth = useCallback(
    (latitude: number) => {
      const group = groupRef.current;
      if (!group) return;

      /*
       * The "reset north" pose: the globe's north pole
       * points up on screen, and the given latitude faces
       * the camera (which is on +Z).
       *
       * Build the target quaternion from a single rotation
       * applied to the identity: rotate so that the point
       * at `(0, sin(lat), cos(lat))` on the globe's surface
       * ends up on +Z.
       */
      const latRad = (latitude * Math.PI) / 180;
      const front = new THREE.Vector3(0, 0, 1);

      const targetDirection = new THREE.Vector3(
        0,
        Math.sin(latRad),
        Math.cos(latRad),
      ).normalize();

      const targetQuaternion = new THREE.Quaternion()
        .setFromUnitVectors(targetDirection, front);

      /*
       * Seed the animation's start time from
       * `performance.now()`. This is the same clock the
       * frame loop reads for its per-frame elapsed
       * calculation, which is what makes the first frame
       * of the animation produce a meaningful elapsed
       * value.
       */
      resetTargetRef.current = {
        startQuaternion: group.quaternion.clone(),
        targetQuaternion,
        startTime: performance.now(),
      };

      velocityRef.current.x = 0;
      velocityRef.current.y = 0;
    },
    [groupRef],
  );

  /*
   * `useImperativeHandle` publishes the handle synchronously
   * during layout, before any consumer's layout effect runs.
   * The handle is recreated only when `resetNorth` changes,
   * which — because `resetNorth` only depends on `groupRef`
   * — is effectively never.
   */
  useImperativeHandle(
    ref,
    () => ({ resetNorth }),
    [resetNorth],
  );

  /* ------------------------------------------------------------------ */
  /* Pointer events                                                     */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const touches = touchPointersRef.current;
    const pinch = pinchRef.current;

    /*
     * Tell the browser this canvas handles touch gestures
     * itself. Without `touch-action: none`, a two-finger pinch
     * is claimed by the browser (page zoom / scroll) and the
     * canvas receives `pointercancel` instead of pinch moves.
     * The previous value is restored on cleanup.
     */
    const previousTouchAction = canvas.style
      ? canvas.style.touchAction
      : "";
    if (canvas.style) {
      canvas.style.touchAction = "none";
    }

    /*
     * Distance in client pixels between the first two tracked
     * touch pointers, or 0 when fewer than two are down.
     */
    const measurePinchDistance = (): number => {
      const iterator = touches.values();
      const first = iterator.next().value;
      const second = iterator.next().value;

      if (!first || !second) return 0;

      return Math.hypot(first.x - second.x, first.y - second.y);
    };

    /* ------------------------------ down ---------------------------- */

    const onPointerDown = (event: PointerEvent): void => {
      /* Only respond to the primary button / first touch. */
      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }

      /*
       * Touch bookkeeping for pinch-zoom. A second finger
       * turns the gesture from a drag into a pinch: the drag
       * is ended without momentum, and from then on finger
       * movement only changes the zoom step.
       */
      if (event.pointerType === "touch") {
        touches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        if (touches.size >= 2) {
          isDraggingRef.current = false;
          velocityRef.current.x = 0;
          velocityRef.current.y = 0;
          samplesRef.current.clear();
          resetTargetRef.current = null;

          pinch.active = true;
          pinch.baseDistance = measurePinchDistance();

          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {
            /* Capture is best-effort; events still reach the canvas. */
          }

          lastInteractionRef.current = performance.now();
          event.preventDefault();
          return;
        }
      }

      const group = groupRef.current;
      if (!group) return;

      /*
       * Cancel any in-flight reset animation. The user has
       * taken control back; the animation must yield
       * immediately.
       */
      resetTargetRef.current = null;

      /* Kill momentum so the release velocity is not carried over. */
      velocityRef.current.x = 0;
      velocityRef.current.y = 0;

      isDraggingRef.current = true;

      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
      };

      samplesRef.current.clear();

      canvas.setPointerCapture(event.pointerId);

      lastInteractionRef.current = performance.now();

      /*
       * Prevent default on primary-button pointer-downs and
       * touch. This blocks the browser's native image drag
       * behavior, which would otherwise ghost-drag the canvas
       * out of the page. It does not block text selection
       * because the canvas has no text.
       */
      event.preventDefault();
    };

    /* ------------------------------ move ---------------------------- */

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch") {
        const tracked = touches.get(event.pointerId);

        if (tracked) {
          tracked.x = event.clientX;
          tracked.y = event.clientY;
        }

        /*
         * Pinch in progress: convert the change in finger
         * distance into camera steps and never rotate.
         */
        if (pinch.active) {
          const distance = measurePinchDistance();

          if (distance <= 0) return;

          if (pinch.baseDistance <= 0) {
            pinch.baseDistance = distance;
            return;
          }

          const ratio = distance / pinch.baseDistance;

          if (ratio >= PINCH_STEP_RATIO) {
            /* Fingers spreading apart: zoom in. */
            onStepCamera(-1);
            pinch.baseDistance = distance;
          } else if (ratio <= 1 / PINCH_STEP_RATIO) {
            /* Fingers coming together: zoom out. */
            onStepCamera(1);
            pinch.baseDistance = distance;
          }

          lastInteractionRef.current = performance.now();
          return;
        }
      }

      if (!isDraggingRef.current) return;

      const group = groupRef.current;
      if (!group) return;

      const previous = lastPointerRef.current;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      const dt = Math.max(event.timeStamp - previous.t, 0);

      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
      };

      /*
       * Zero-delta moves (common on hover events that sneak
       * through the capture) would produce a zero-length
       * rotation axis. Skip them.
       */
      if (dx === 0 && dy === 0) return;

      /*
       * Arcball rotation. The user's drag maps to a
       * rotation about two screen-aligned axes:
       *
       *   - Horizontal drag (dx) rotates the globe about
       *     the world +Y axis.
       *   - Vertical drag (dy) rotates the globe about the
       *     world axis aligned with screen-right, which —
       *     because the camera sits on the equator plane
       *     at `(0, 0, distance)` — is world +X.
       *
       * The two rotations are composed into a single
       * axis-angle delta and left-multiplied into the
       * globe's current quaternion. Left-multiplication is
       * what makes the drag feel "attached to the world"
       * rather than "attached to the object's local frame".
       */
      const yawQuaternion = pointerYawQuaternion.setFromAxisAngle(
        Y_AXIS,
        dx * DRAG_SENSITIVITY,
      );
      const pitchQuaternion =
        pointerPitchQuaternion.setFromAxisAngle(
          X_AXIS,
          dy * DRAG_SENSITIVITY,
        );

      const composed = pointerComposedQuaternion.multiplyQuaternions(
        pitchQuaternion,
        yawQuaternion,
      );

      group.quaternion.premultiply(composed);
      group.quaternion.normalize();

      samplesRef.current.push(dx, dy, Math.max(dt, 1));

      lastInteractionRef.current = performance.now();
    };

    /* ------------------------------ up ------------------------------ */

    const endDrag = (event: PointerEvent): void => {
      isDraggingRef.current = false;

      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (error) {
        /*
         * Capture may already have been released by the
         * browser — for example if the pointer left the
         * window and the browser auto-released. Log in
         * development so an unexpected release failure is
         * visible, but never throw.
         */
        if (process.env.NODE_ENV !== "production") {
          logDebug(
            "globe-controls pointer-capture release failed",
            error,
          );
        }
      }
    };

    /*
     * Remove a lifted/cancelled touch pointer from the pinch
     * bookkeeping. Returns `true` when the event belonged to a
     * pinch and has been fully handled. After a pinch ends the
     * remaining finger does not resume dragging until it is
     * lifted and pressed again, which avoids the globe jumping
     * to that finger's position.
     */
    const endTouchPointer = (event: PointerEvent): boolean => {
      if (event.pointerType !== "touch") return false;

      touches.delete(event.pointerId);

      if (!pinch.active) return false;

      if (touches.size < 2) {
        pinch.active = false;
        pinch.baseDistance = 0;
      } else {
        pinch.baseDistance = measurePinchDistance();
      }

      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* Capture may already have been released. */
      }

      lastInteractionRef.current = performance.now();

      return true;
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (endTouchPointer(event)) return;

      if (!isDraggingRef.current) return;

      endDrag(event);

      /*
       * Compute release velocity from the ring buffer.
       * Only samples that actually moved contribute — the
       * initial pointer-down often has one or two frames
       * where the position is identical to the down
       * position.
       */
      const sum = samplesRef.current.sumMoving();

      if (!sum) {
        velocityRef.current.x = 0;
        velocityRef.current.y = 0;
        lastInteractionRef.current = performance.now();
        return;
      }

      /*
       * Radians per millisecond, converted to radians per
       * second by multiplying by 1000. The sign of the drag
       * direction is preserved so momentum continues in the
       * same direction the finger was moving.
       */
      const seconds = Math.max(sum.dt / 1000, 0.001);
      const angularVelocityY =
        (sum.dx * DRAG_SENSITIVITY) / seconds;
      const angularVelocityX =
        (sum.dy * DRAG_SENSITIVITY) / seconds;

      velocityRef.current.x = angularVelocityX;
      velocityRef.current.y = angularVelocityY;

      lastInteractionRef.current = performance.now();
    };

    /* --------------------------- cancel ----------------------------- */

    const onPointerCancel = (event: PointerEvent): void => {
      if (endTouchPointer(event)) return;

      if (!isDraggingRef.current) return;

      endDrag(event);

      /*
       * A cancelled pointer does not produce release
       * velocity. Reset all drag state to match what
       * `onPointerUp` would produce on a zero-velocity
       * release.
       */
      velocityRef.current.x = 0;
      velocityRef.current.y = 0;
      samplesRef.current.clear();

      lastInteractionRef.current = performance.now();
    };

    /* ------------------------------ wheel --------------------------- */

    const onWheel = (event: WheelEvent): void => {
      /*
       * Only treat the wheel as a zoom step when the delta
       * exceeds the threshold. This filters trackpad
       * inertial tails that would otherwise rack up dozens
       * of steps.
       */
      if (Math.abs(event.deltaY) < WHEEL_STEP_DELTA) return;

      event.preventDefault();

      /*
       * `deltaY < 0` means scroll up, which conventionally
       * means "zoom in" — move the camera closer.
       */
      onStepCamera(event.deltaY < 0 ? -1 : 1);

      lastInteractionRef.current = performance.now();
    };

    /* ------------------------------ bind ---------------------------- */

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    /*
     * `{ passive: false }` is required so `preventDefault()`
     * inside `onWheel` actually suppresses the browser's
     * native page zoom. Without it, the listener runs in the
     * passive phase and `preventDefault` is a no-op (with a
     * console warning).
     */
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);

      touches.clear();
      pinch.active = false;
      pinch.baseDistance = 0;

      if (canvas.style) {
        canvas.style.touchAction = previousTouchAction;
      }
    };
  }, [gl, groupRef, onStepCamera]);

  /* ------------------------------------------------------------------ */
  /* Frame loop                                                         */
  /* ------------------------------------------------------------------ */

  useFrameAdapter((state) => {
    const group = groupRef.current;
    if (!group) return;

    const dt = Math.min(
      state.clock.getDelta(),
      MAX_FRAME_DELTA_SECONDS,
    );

    /* ---------------------------- reset north --------------------- */

    const reset = resetTargetRef.current;
    if (reset) {
      const elapsed = performance.now() - reset.startTime;
      const progress = Math.min(elapsed / NORTH_RESET_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      /*
       * `slerpQuaternions(a, b, t, target)` writes directly
       * into `target`, which here is the group's own
       * quaternion. This is a single interpolation from the
       * start quaternion to the target quaternion.
       */
      group.quaternion.slerpQuaternions(
        reset.startQuaternion,
        reset.targetQuaternion,
        eased,
      );

      if (progress >= 1) {
        group.quaternion.copy(reset.targetQuaternion);
        resetTargetRef.current = null;
      }

      return;
    }

    /* ---------------------------- drag ---------------------------- */

    /*
     * While the pointer is down, the pointer event handler
     * already mutates the quaternion. Momentum and
     * auto-rotate must not touch it — that would fight the
     * user.
     */
    if (isDraggingRef.current) return;

    /* ---------------------------- travel -------------------------- */

    /*
     * Travel animations live in `GlobeScene` and mutate the
     * same quaternion. Suppress momentum and auto-rotate
     * while a travel is active.
     */
    if (isTravelingRef.current) return;

    /* ---------------------------- momentum ------------------------ */

    const velocity = velocityRef.current;
    const speed = Math.sqrt(
      velocity.x * velocity.x + velocity.y * velocity.y,
    );

    if (speed > MOMENTUM_MIN_VELOCITY) {
      const yawQuaternion = frameYawQuaternion.setFromAxisAngle(
        Y_AXIS,
        velocity.y * dt,
      );
      const pitchQuaternion =
        framePitchQuaternion.setFromAxisAngle(
          X_AXIS,
          velocity.x * dt,
        );

      const composed = frameComposedQuaternion.multiplyQuaternions(
        pitchQuaternion,
        yawQuaternion,
      );

      group.quaternion.premultiply(composed);
      group.quaternion.normalize();

      /*
       * Exponential decay. `Math.pow(base, dt)` gives the
       * correct fractional decay for a frame of length dt.
       */
      const decay = Math.pow(MOMENTUM_DECAY_PER_SECOND, dt);
      velocity.x *= decay;
      velocity.y *= decay;

      return;
    }

    /* Clamp tiny residual velocity so the frame loop can stop. */
    velocity.x = 0;
    velocity.y = 0;

    /* ---------------------------- auto-rotate --------------------- */

    const now = performance.now();
    const sinceInteraction = now - lastInteractionRef.current;

    if (sinceInteraction < AUTO_ROTATE_RESUME_DELAY_MS) return;

    const autoRotateQuaternion =
      frameYawQuaternion.setFromAxisAngle(
        Y_AXIS,
        AUTO_ROTATE_SPEED * dt,
      );

    group.quaternion.premultiply(autoRotateQuaternion);
    group.quaternion.normalize();
  });

  return null;
}