import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type RefObject,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { LOGCAT_ROW_HEIGHT } from "@/lib/logcat";
import { createFollowScrollController } from "@/hooks/followScrollController";
import type {
  FollowScrollConfig,
  FollowScrollController,
} from "@/hooks/followScrollModel";
import type { LogcatFollowMode } from "@/store/logcat";

export {
  anchoredLogcatScrollTop,
  isNearLogcatBottom,
} from "@/hooks/followScrollModel";

interface UseFollowScrollOptions {
  visible: boolean;
  followMode: LogcatFollowMode;
  setFollowMode: (mode: LogcatFollowMode) => void;
  anchoredSeq: number | null;
  anchorIndex: number | null;
  setAnchoredSeq: (seq: number | null) => void;
  revision: number;
  bottomThreshold?: number;
  getItemOffset?: (index: number) => number;
}

interface UseFollowScrollResult {
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
  detachAt: (seq: number | null, index: number | null) => void;
  scrollToBottom: () => void;
  measureNow: () => void;
}

function fixedItemOffset(index: number): number {
  return index * LOGCAT_ROW_HEIGHT;
}

export function useFollowScroll({
  visible,
  followMode,
  setFollowMode,
  anchoredSeq,
  anchorIndex,
  setAnchoredSeq,
  revision,
  bottomThreshold = 40,
  getItemOffset = fixedItemOffset,
}: UseFollowScrollOptions): UseFollowScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<FollowScrollController | null>(null);
  const config: FollowScrollConfig = {
    visible,
    followMode,
    anchoredSeq,
    anchorIndex,
    bottomThreshold,
    getItemOffset,
    setFollowMode,
    setAnchoredSeq,
  };

  if (controllerRef.current === null) {
    controllerRef.current = createFollowScrollController(
      {
        getElement: () => scrollRef.current,
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frame) => window.cancelAnimationFrame(frame),
      },
      config,
    );
  }
  const controller = controllerRef.current;
  controller.update(config);
  const measureBeforePaint = followMode === "detached" && anchoredSeq !== null;

  useLayoutEffect(() => {
    if (!measureBeforePaint) {
      return;
    }
    controller.measureNow();
  }, [
    anchorIndex,
    anchoredSeq,
    bottomThreshold,
    controller,
    followMode,
    getItemOffset,
    measureBeforePaint,
    revision,
    visible,
  ]);

  useEffect(() => {
    if (measureBeforePaint) {
      return;
    }
    controller.schedulePositionUpdate();
  }, [
    anchorIndex,
    anchoredSeq,
    bottomThreshold,
    controller,
    followMode,
    getItemOffset,
    measureBeforePaint,
    revision,
    visible,
  ]);

  useEffect(() => () => controller.cleanup(), [controller]);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => controller.onWheel(event.deltaY),
    [controller],
  );
  const onPointerDown = useCallback(
    (_event: PointerEvent<HTMLDivElement>) => controller.onPointerDown(),
    [controller],
  );
  const onTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (touch) controller.onTouchStart(touch.clientY);
    },
    [controller],
  );
  const onTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (touch) controller.onTouchMove(touch.clientY);
    },
    [controller],
  );

  return {
    scrollRef,
    onScroll: controller.onScroll,
    onWheel,
    onPointerDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd: controller.onTouchEnd,
    detachAt: controller.detachAt,
    scrollToBottom: controller.scrollToBottom,
    measureNow: controller.measureNow,
  };
}
