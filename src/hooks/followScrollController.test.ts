import { describe, expect, it, vi } from "vitest";
import { createFollowScrollController } from "@/hooks/followScrollController";
import type {
  FollowScrollConfig,
  FollowScrollController,
  FollowScrollElement,
} from "@/hooks/followScrollModel";

function createFrameHarness() {
  let nextFrame = 1;
  const frames = new Map<number, () => void>();
  return {
    requestFrame(callback: () => void): number {
      const frame = nextFrame;
      nextFrame += 1;
      frames.set(frame, callback);
      return frame;
    },
    cancelFrame(frame: number): void {
      frames.delete(frame);
    },
    runNext(): void {
      const next = frames.entries().next();
      if (next.done) throw new Error("No frame is scheduled");
      const [frame, callback] = next.value;
      frames.delete(frame);
      callback();
    },
    get size(): number {
      return frames.size;
    },
  };
}

function createViewport(scrollTop = 100, scrollHeight = 2_000, clientHeight = 400) {
  let currentScrollTop = scrollTop;
  const writes: number[] = [];
  const element: FollowScrollElement = {
    scrollHeight,
    clientHeight,
    get scrollTop() {
      return currentScrollTop;
    },
    set scrollTop(value: number) {
      currentScrollTop = value;
      writes.push(value);
    },
  };
  return { element, writes };
}

function createHarness(
  overrides: Partial<FollowScrollConfig> = {},
  viewport = createViewport(),
) {
  const frames = createFrameHarness();
  const modes: string[] = [];
  const anchors: Array<number | null> = [];
  let config: FollowScrollConfig = {
    visible: true,
    followMode: "follow",
    anchoredSeq: null,
    anchorIndex: null,
    bottomThreshold: 40,
    getItemOffset: (index) => index * 20,
    setFollowMode: (mode) => modes.push(mode),
    setAnchoredSeq: (seq) => anchors.push(seq),
    ...overrides,
  };
  const controller = createFollowScrollController(
    {
      getElement: () => viewport.element,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    },
    config,
  );
  return {
    controller,
    frames,
    modes,
    anchors,
    viewport,
    update(patch: Partial<FollowScrollConfig>): void {
      config = { ...config, ...patch };
      controller.update(config);
    },
  };
}

function createControllerSpy(): FollowScrollController {
  return {
    update: vi.fn(),
    schedulePositionUpdate: vi.fn(),
    measureNow: vi.fn(),
    onScroll: vi.fn(),
    onWheel: vi.fn(),
    onPointerDown: vi.fn(),
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    detachAt: vi.fn(),
    scrollToBottom: vi.fn(),
    cleanup: vi.fn(),
  };
}

describe("createFollowScrollController", () => {
  it("uses the latest visibility and anchor index when a queued frame runs", () => {
    const hidden = createHarness();
    hidden.controller.schedulePositionUpdate();
    hidden.update({ visible: false });
    hidden.frames.runNext();
    expect(hidden.viewport.writes).toEqual([]);

    const anchored = createHarness({
      followMode: "detached",
      anchoredSeq: 7,
      anchorIndex: 10,
    });
    anchored.controller.measureNow();
    anchored.controller.schedulePositionUpdate();
    anchored.update({ anchorIndex: 7 });
    anchored.frames.runNext();
    expect(anchored.viewport.writes).toEqual([40]);
  });

  it("immediately compensates an anchored row after FIFO eviction", () => {
    const harness = createHarness(
      {
        followMode: "detached",
        anchoredSeq: 9_000,
        anchorIndex: 8_000,
      },
      createViewport(159_900, 200_000, 400),
    );
    harness.controller.measureNow();
    expect(harness.viewport.writes).toEqual([]);

    // A full 10,000-row window evicts 200 matching rows from its head.
    harness.update({ anchorIndex: 7_800 });
    harness.controller.measureNow();

    expect(harness.viewport.element.scrollTop).toBe(155_900);
    expect(harness.viewport.writes).toEqual([155_900]);
  });

  it("clears a missing anchor immediately without moving the viewport", () => {
    const harness = createHarness({
      followMode: "detached",
      anchoredSeq: 9_000,
      anchorIndex: null,
    });

    harness.controller.measureNow();

    expect(harness.anchors).toEqual([null]);
    expect(harness.viewport.writes).toEqual([]);
    expect(harness.frames.size).toBe(0);
  });

  it("cancels a queued follow write when the user detaches before the frame", () => {
    const harness = createHarness();
    harness.controller.schedulePositionUpdate();
    harness.controller.detachAt(5, 10);

    expect(harness.frames.size).toBe(0);
    expect(harness.viewport.writes).toEqual([]);
    expect(harness.modes).toEqual(["detached"]);
    expect(harness.anchors).toEqual([5]);
  });

  it("can schedule after the StrictMode cleanup cycle", () => {
    const harness = createHarness();
    harness.controller.schedulePositionUpdate();
    harness.controller.cleanup();
    expect(harness.frames.size).toBe(0);

    harness.controller.schedulePositionUpdate();
    harness.frames.runNext();
    expect(harness.viewport.writes).toEqual([1_600]);
  });

  it("ignores its matching programmatic scroll event", () => {
    const harness = createHarness({}, createViewport(500, 1_000, 400));
    harness.controller.schedulePositionUpdate();
    harness.frames.runNext();
    expect(harness.viewport.writes).toEqual([600]);

    harness.controller.onScroll();
    expect(harness.modes).toEqual([]);
    expect(harness.anchors).toEqual([]);
    expect(harness.frames.size).toBe(0);
  });

  it("does not treat a layout clamp as user intent or clear the anchor", () => {
    const harness = createHarness(
      { followMode: "detached", anchoredSeq: 35, anchorIndex: 35 },
      createViewport(600, 1_000, 400),
    );
    harness.controller.measureNow();
    harness.viewport.element.scrollHeight = 980;
    harness.viewport.element.scrollTop = 580;
    harness.controller.onScroll();

    expect(harness.modes).toEqual([]);
    expect(harness.anchors).toEqual([]);
    harness.update({ anchorIndex: 34 });
    harness.controller.schedulePositionUpdate();
    harness.frames.runNext();
    expect(harness.modes).toEqual([]);
    expect(harness.anchors).toEqual([]);
  });

  it("uses wheel direction and follows when detached at the bottom", () => {
    const harness = createHarness({}, createViewport(600, 1_000, 400));
    harness.controller.onWheel(1);
    expect(harness.modes).toEqual([]);

    harness.controller.onWheel(-1);
    expect(harness.modes).toEqual(["detached"]);

    harness.modes.length = 0;
    harness.anchors.length = 0;
    harness.update({ followMode: "detached" });
    harness.controller.onWheel(1);
    expect(harness.modes).toEqual(["follow"]);
    expect(harness.anchors).toEqual([null]);
  });

  it("uses touch movement direction instead of detaching on every move", () => {
    const harness = createHarness({}, createViewport(600, 1_000, 400));
    harness.controller.onTouchStart(100);
    harness.controller.onTouchMove(90);
    expect(harness.modes).toEqual([]);

    harness.controller.onTouchMove(110);
    expect(harness.modes).toEqual(["detached"]);
  });

  it("releases a programmatic target when no scroll event arrives", () => {
    const harness = createHarness({}, createViewport(500, 1_000, 400));
    harness.controller.schedulePositionUpdate();
    harness.frames.runNext();
    harness.frames.runNext();

    harness.controller.onWheel(-1);
    harness.viewport.element.scrollTop = 550;
    harness.controller.onScroll();
    expect(harness.modes).toContain("detached");
  });

  it("measures anchored revisions before passive effects and keeps other modes on rAF", async () => {
    type RecordedEffect = () => void | (() => void);
    type EffectDependencies = readonly unknown[] | undefined;
    const layoutEffects: RecordedEffect[] = [];
    const passiveEffects: RecordedEffect[] = [];
    const layoutDependencies: EffectDependencies[] = [];
    const passiveDependencies: EffectDependencies[] = [];
    const refs: Array<{ current: unknown }> = [];
    const controllers: FollowScrollController[] = [];
    let refCursor = 0;
    let layoutEffectCursor = 0;
    let passiveEffectCursor = 0;

    function dependenciesChanged(
      previous: EffectDependencies,
      next: EffectDependencies,
    ): boolean {
      if (previous === undefined || next === undefined) return true;
      return previous.length !== next.length ||
        next.some((value, index) => !Object.is(value, previous[index]));
    }

    function beginRender(): void {
      refCursor = 0;
      layoutEffectCursor = 0;
      passiveEffectCursor = 0;
      layoutEffects.length = 0;
      passiveEffects.length = 0;
    }

    vi.resetModules();
    vi.doMock("react", () => ({
      useCallback: <T>(callback: T) => callback,
      useEffect: (effect: RecordedEffect, dependencies: EffectDependencies) => {
        const index = passiveEffectCursor;
        passiveEffectCursor += 1;
        if (dependenciesChanged(passiveDependencies[index], dependencies)) {
          passiveDependencies[index] = dependencies;
          passiveEffects.push(effect);
        }
      },
      useLayoutEffect: (effect: RecordedEffect, dependencies: EffectDependencies) => {
        const index = layoutEffectCursor;
        layoutEffectCursor += 1;
        if (dependenciesChanged(layoutDependencies[index], dependencies)) {
          layoutDependencies[index] = dependencies;
          layoutEffects.push(effect);
        }
      },
      useRef: <T>(initialValue: T) => {
        const index = refCursor;
        refCursor += 1;
        const existing = refs[index] as { current: T } | undefined;
        if (existing) return existing;
        const created = { current: initialValue };
        refs[index] = created;
        return created;
      },
    }));
    vi.doMock("@/hooks/followScrollController", () => ({
      createFollowScrollController: () => {
        const controller = createControllerSpy();
        controllers.push(controller);
        return controller;
      },
    }));

    try {
      const { useFollowScroll } = await import("@/hooks/useFollowScroll");
      const renderHook = (
        followMode: FollowScrollConfig["followMode"],
        anchoredSeq: number | null,
        revision: number,
      ) => {
        beginRender();
        useFollowScroll({
          visible: true,
          followMode,
          setFollowMode: vi.fn(),
          anchoredSeq,
          anchorIndex: anchoredSeq === null ? null : 7_800,
          setAnchoredSeq: vi.fn(),
          revision,
        });
        const controller = controllers[0];
        if (!controller) throw new Error("Follow scroll controller was not created");
        return {
          controller,
          layout: [...layoutEffects],
          passive: [...passiveEffects],
        };
      };

      const anchored = renderHook("detached", 9_000, 1);
      anchored.layout.forEach((effect) => effect());
      expect(anchored.controller.measureNow).toHaveBeenCalledOnce();
      expect(anchored.controller.schedulePositionUpdate).not.toHaveBeenCalled();
      anchored.passive.forEach((effect) => effect());
      expect(anchored.controller.schedulePositionUpdate).not.toHaveBeenCalled();

      const nextAnchoredRevision = renderHook("detached", 9_000, 2);
      nextAnchoredRevision.layout.forEach((effect) => effect());
      nextAnchoredRevision.passive.forEach((effect) => effect());
      expect(nextAnchoredRevision.controller.measureNow).toHaveBeenCalledTimes(2);
      expect(nextAnchoredRevision.controller.schedulePositionUpdate).not.toHaveBeenCalled();

      let revision = 3;
      for (const [followMode, anchoredSeq] of [
        ["follow", null],
        ["detached", null],
      ] as const) {
        const deferred = renderHook(followMode, anchoredSeq, revision);
        revision += 1;
        deferred.layout.forEach((effect) => effect());
        deferred.passive.forEach((effect) => effect());
      }
      expect(anchored.controller.measureNow).toHaveBeenCalledTimes(2);
      expect(anchored.controller.schedulePositionUpdate).toHaveBeenCalledTimes(2);
      expect(controllers).toHaveLength(1);
    } finally {
      vi.doUnmock("react");
      vi.doUnmock("@/hooks/followScrollController");
      vi.resetModules();
    }
  });
});
