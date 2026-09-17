import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { planLayoutFlip, type FlipPoint } from "@/lib/layoutFlip";
import {
  DROP_SETTLE_MS,
  EASE_IN_OUT,
  EASE_OUT,
  LAYOUT_SHIFT_MS,
  prefersReducedMotion,
} from "@/lib/motion";

export interface LayoutFlipApi<Id> {
  /**
   * Records where every element is painted. Call it before the change reaches
   * the DOM. The first capture wins until `play` consumes it, so a caller that
   * marks a landing element is not overwritten by a later generic capture.
   */
  capture: (landing?: Id | null) => void;
  /**
   * Animates every element from its captured position to its current slot.
   * Call it from a layout effect so the inverted frame is the first one painted.
   */
  play: (exclude: Id | null) => void;
  /** Element still animating into its slot after a drop. */
  landingId: Id | null;
}

interface RunningFlip {
  animation: Animation;
  to: FlipPoint;
  landing: boolean;
}

/**
 * Runs FLIP layout animations with WAAPI.
 *
 * Positions are relative to `container`, which must be the elements'
 * `offsetParent`: `offsetLeft`/`offsetTop` give the resting slot without any
 * transform, while `getBoundingClientRect` gives the painted position.
 *
 * Animations are additive, so an element that is picked up again while it is
 * still landing keeps its inline drag transform and glides onto the pointer
 * instead of jumping.
 */
export function useLayoutFlip<Id>(
  container: RefObject<HTMLElement | null>,
  elements: RefObject<ReadonlyMap<Id, HTMLElement>>,
): LayoutFlipApi<Id> {
  const firstRef = useRef<{ positions: Map<Id, FlipPoint>; landing: Id | null } | null>(null);
  const runningRef = useRef(new Map<Id, RunningFlip>());
  const [landingId, setLandingId] = useState<Id | null>(null);

  const stop = useCallback((id: Id) => {
    const running = runningRef.current.get(id);
    if (!running) {
      return;
    }
    runningRef.current.delete(id);
    running.animation.cancel();
    if (running.landing) {
      setLandingId(null);
    }
  }, []);

  const capture = useCallback((landing: Id | null = null) => {
    const origin = container.current?.getBoundingClientRect();
    if (firstRef.current || !origin || prefersReducedMotion()) {
      return;
    }
    const positions = new Map<Id, FlipPoint>();
    for (const [id, element] of elements.current) {
      const box = element.getBoundingClientRect();
      positions.set(id, { x: box.left - origin.left, y: box.top - origin.top });
    }
    firstRef.current = { positions, landing };
  }, [container, elements]);

  const play = useCallback((exclude: Id | null) => {
    const first = firstRef.current;
    if (!first) {
      return;
    }
    firstRef.current = null;

    const last = new Map<Id, FlipPoint>();
    for (const [id, element] of elements.current) {
      if (id !== exclude) {
        last.set(id, { x: element.offsetLeft, y: element.offsetTop });
      }
    }
    const heading = new Map<Id, FlipPoint>();
    for (const [id, running] of runningRef.current) {
      heading.set(id, running.to);
    }

    for (const { id, from } of planLayoutFlip(first.positions, last, heading)) {
      stop(id);
      const element = elements.current.get(id);
      const to = last.get(id);
      if (!from || !element || !to) {
        continue;
      }
      const landing = id === first.landing;
      const animation = element.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        {
          duration: landing ? DROP_SETTLE_MS : LAYOUT_SHIFT_MS,
          easing: landing ? EASE_OUT : EASE_IN_OUT,
          composite: "add",
        },
      );
      const running: RunningFlip = { animation, to, landing };
      runningRef.current.set(id, running);
      animation.addEventListener("finish", () => {
        if (runningRef.current.get(id) === running) {
          stop(id);
        }
      });
      if (landing) {
        setLandingId(id);
      }
    }
  }, [elements, stop]);

  useEffect(() => {
    const running = runningRef.current;
    return () => {
      for (const { animation } of running.values()) {
        animation.cancel();
      }
      running.clear();
    };
  }, []);

  return { capture, play, landingId };
}
