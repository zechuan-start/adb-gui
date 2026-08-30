import { LOGCAT_ROW_HEIGHT } from "@/lib/logcat";
import type { LogcatFollowMode } from "@/store/logcat";

export interface FollowScrollElement {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export interface FollowScrollConfig {
  visible: boolean;
  followMode: LogcatFollowMode;
  anchoredSeq: number | null;
  anchorIndex: number | null;
  bottomThreshold: number;
  getItemOffset: (index: number) => number;
  setFollowMode: (mode: LogcatFollowMode) => void;
  setAnchoredSeq: (seq: number | null) => void;
}

export interface FrameScheduler {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
}

export interface FollowScrollDependencies extends FrameScheduler {
  getElement: () => FollowScrollElement | null;
}

export interface FollowScrollController {
  update: (config: FollowScrollConfig) => void;
  schedulePositionUpdate: () => void;
  measureNow: () => void;
  onScroll: () => void;
  onWheel: (deltaY: number) => void;
  onPointerDown: () => void;
  onTouchStart: (clientY: number) => void;
  onTouchMove: (clientY: number) => void;
  onTouchEnd: () => void;
  detachAt: (seq: number | null, index: number | null) => void;
  scrollToBottom: () => void;
  cleanup: () => void;
}

export interface FrameLease {
  arm: () => void;
  clear: () => void;
  isActive: () => boolean;
}

export function createTouchDeltaTracker(onDelta: (deltaY: number) => void) {
  let lastTouchY: number | null = null;

  return {
    onTouchStart: (clientY: number) => {
      lastTouchY = Number.isFinite(clientY) ? clientY : null;
    },
    onTouchMove: (clientY: number) => {
      if (!Number.isFinite(clientY)) return;
      if (lastTouchY !== null) onDelta(lastTouchY - clientY);
      lastTouchY = clientY;
    },
    onTouchEnd: () => {
      lastTouchY = null;
    },
  };
}

export function createFrameLease(
  scheduler: FrameScheduler,
  holdFrames: number,
): FrameLease {
  let active = false;
  let frame: number | null = null;

  function clear(): void {
    active = false;
    if (frame !== null) scheduler.cancelFrame(frame);
    frame = null;
  }

  function schedule(remaining: number): void {
    frame = scheduler.requestFrame(() => {
      if (remaining > 1) {
        schedule(remaining - 1);
        return;
      }
      active = false;
      frame = null;
    });
  }

  return {
    arm: () => {
      clear();
      active = true;
      schedule(holdFrames);
    },
    clear,
    isActive: () => active,
  };
}

export function isNearLogcatBottom(
  metrics: FollowScrollElement,
  threshold = 40,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < threshold;
}

export function clampLogcatScrollTop(
  value: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  return Math.max(0, Math.min(value, Math.max(0, scrollHeight - clientHeight)));
}

export function anchoredLogcatScrollTop(
  anchorIndex: number,
  viewportOffset: number,
  scrollHeight: number,
  clientHeight: number,
  itemHeight = LOGCAT_ROW_HEIGHT,
): number {
  return clampLogcatScrollTop(
    anchorIndex * itemHeight - viewportOffset,
    scrollHeight,
    clientHeight,
  );
}
