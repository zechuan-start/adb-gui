import {
  clampLogcatScrollTop,
  createFrameLease,
  createTouchDeltaTracker,
  isNearLogcatBottom,
  type FollowScrollConfig,
  type FollowScrollController,
  type FollowScrollDependencies,
  type FollowScrollElement,
} from "@/hooks/followScrollModel";

interface AnchorSnapshot {
  seq: number;
  viewportOffset: number;
}

export function createFollowScrollController(
  dependencies: FollowScrollDependencies,
  initialConfig: FollowScrollConfig,
): FollowScrollController {
  let config = initialConfig;
  let anchorSnapshot: AnchorSnapshot | null = null;
  let lastScrollTop = 0;
  let hasScrollTop = false;
  let programmaticTarget: number | null = null;
  let positionFrame: number | null = null;
  const programmaticLease = createFrameLease(dependencies, 1);
  const userIntentLease = createFrameLease(dependencies, 2);
  const touchTracker = createTouchDeltaTracker(onWheel);

  function cancelPositionUpdate(): void {
    if (positionFrame !== null) dependencies.cancelFrame(positionFrame);
    positionFrame = null;
  }

  function releaseProgrammaticScroll(): void {
    programmaticTarget = null;
    programmaticLease.clear();
  }

  function rememberScrollTop(element: FollowScrollElement): void {
    lastScrollTop = element.scrollTop;
    hasScrollTop = true;
  }

  function writeScrollTop(element: FollowScrollElement, value: number): void {
    const target = clampLogcatScrollTop(
      value,
      element.scrollHeight,
      element.clientHeight,
    );
    if (Math.abs(element.scrollTop - target) < 0.5) {
      rememberScrollTop(element);
      return;
    }
    element.scrollTop = target;
    rememberScrollTop(element);
    programmaticTarget = element.scrollTop;
    programmaticLease.arm();
  }

  function applyCurrentMode(): void {
    const element = dependencies.getElement();
    if (!config.visible || !element) return;
    if (!hasScrollTop) rememberScrollTop(element);

    if (config.followMode === "follow") {
      anchorSnapshot = null;
      writeScrollTop(element, element.scrollHeight);
      return;
    }
    if (config.anchoredSeq === null) {
      anchorSnapshot = null;
      writeScrollTop(element, lastScrollTop);
      return;
    }
    if (config.anchorIndex === null) {
      anchorSnapshot = null;
      rememberScrollTop(element);
      config.setAnchoredSeq(null);
      return;
    }
    if (!anchorSnapshot || anchorSnapshot.seq !== config.anchoredSeq) {
      anchorSnapshot = {
        seq: config.anchoredSeq,
        viewportOffset: config.getItemOffset(config.anchorIndex) - element.scrollTop,
      };
      rememberScrollTop(element);
      return;
    }
    writeScrollTop(
      element,
      config.getItemOffset(config.anchorIndex) - anchorSnapshot.viewportOffset,
    );
  }

  function schedulePositionUpdate(): void {
    cancelPositionUpdate();
    if (!config.visible) return;
    positionFrame = dependencies.requestFrame(() => {
      positionFrame = null;
      applyCurrentMode();
    });
  }

  function armPotentialUserScroll(): void {
    cancelPositionUpdate();
    releaseProgrammaticScroll();
    const element = dependencies.getElement();
    if (element) rememberScrollTop(element);
    userIntentLease.arm();
  }

  function beginUserMovement(detach: boolean): void {
    armPotentialUserScroll();
    anchorSnapshot = null;
    config.setAnchoredSeq(null);
    if (detach) config.setFollowMode("detached");
  }

  function onScroll(): void {
    const element = dependencies.getElement();
    if (!element) return;
    rememberScrollTop(element);
    if (
      programmaticLease.isActive()
      && programmaticTarget !== null
      && Math.abs(element.scrollTop - programmaticTarget) < 1
    ) {
      releaseProgrammaticScroll();
      return;
    }
    if (programmaticTarget !== null) releaseProgrammaticScroll();
    if (!userIntentLease.isActive()) return;

    cancelPositionUpdate();
    anchorSnapshot = null;
    config.setAnchoredSeq(null);
    config.setFollowMode(
      isNearLogcatBottom(element, config.bottomThreshold) ? "follow" : "detached",
    );
    userIntentLease.arm();
  }

  function onWheel(deltaY: number): void {
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    if (deltaY > 0 && config.followMode === "follow") return;
    const element = dependencies.getElement();
    if (deltaY > 0 && element && isNearLogcatBottom(element, config.bottomThreshold)) {
      scrollToBottom();
      return;
    }
    beginUserMovement(deltaY < 0);
  }

  function detachAt(seq: number | null, index: number | null): void {
    cancelPositionUpdate();
    releaseProgrammaticScroll();
    userIntentLease.clear();
    const element = dependencies.getElement();
    if (element) rememberScrollTop(element);
    anchorSnapshot = seq !== null && index !== null && element
      ? { seq, viewportOffset: config.getItemOffset(index) - element.scrollTop }
      : null;
    config.setFollowMode("detached");
    config.setAnchoredSeq(seq);
  }

  function scrollToBottom(): void {
    cancelPositionUpdate();
    userIntentLease.clear();
    anchorSnapshot = null;
    config.setAnchoredSeq(null);
    config.setFollowMode("follow");
    const element = dependencies.getElement();
    if (config.visible && element) writeScrollTop(element, element.scrollHeight);
  }

  return {
    update: (nextConfig) => {
      config = nextConfig;
    },
    schedulePositionUpdate,
    measureNow: () => {
      cancelPositionUpdate();
      applyCurrentMode();
    },
    onScroll,
    onWheel,
    onPointerDown: armPotentialUserScroll,
    ...touchTracker,
    detachAt,
    scrollToBottom,
    cleanup: () => {
      cancelPositionUpdate();
      releaseProgrammaticScroll();
      userIntentLease.clear();
      touchTracker.onTouchEnd();
    },
  };
}
