import { describe, expect, it } from "vitest";
import {
  createLogcatStreamController,
  type LogcatStreamControllerDependencies,
  type LogcatStreamFrame,
} from "@/hooks/logcatStreamController";
import type {
  LogcatBatch,
  LogcatExit,
  LogcatLine,
  LogcatSessionInfo,
} from "@/lib/tauri";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface HarnessOptions {
  capacity?: number;
  session?: LogcatSessionInfo;
  startPromise?: Promise<LogcatSessionInfo>;
  exitListenerError?: Error;
}

function deferred<T>(): Deferred<T> {
  let resolver: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolver === null) {
        throw new Error("Deferred resolver is unavailable");
      }
      resolver(value);
    },
  };
}

function line(index: number): LogcatLine {
  return {
    time: "08-29 22:00:00.000",
    level: "I",
    tag: "Test",
    pid: "1",
    tid: "1",
    message: `message-${index}`,
    raw: `raw-${index}`,
  };
}

async function advanceSetup(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

function createHarness(options: HarnessOptions = {}) {
  let batchCallback: ((batch: LogcatBatch) => void) | null = null;
  let exitCallback: ((exit: LogcatExit) => void) | null = null;
  let nextFrame = 1;
  const frames = new Map<number, () => void>();
  const started: LogcatSessionInfo[] = [];
  const flushed: LogcatStreamFrame[] = [];
  const failures: string[] = [];
  const asyncErrors: unknown[] = [];
  const stops: Array<[string, number]> = [];
  const canceledFrames: number[] = [];
  let batchUnlistenCount = 0;
  let exitUnlistenCount = 0;
  let startCount = 0;
  const session = options.session ?? { serial: "device-a", session_id: 7 };

  const dependencies: LogcatStreamControllerDependencies = {
    capacity: options.capacity ?? 10,
    listenBatch: async (callback) => {
      batchCallback = callback;
      return () => {
        batchUnlistenCount += 1;
      };
    },
    listenExit: async (callback) => {
      if (options.exitListenerError) {
        throw options.exitListenerError;
      }
      exitCallback = callback;
      return () => {
        exitUnlistenCount += 1;
      };
    },
    start: async () => {
      startCount += 1;
      return options.startPromise ?? session;
    },
    stop: async (serial, sessionId) => {
      stops.push([serial, sessionId]);
    },
    requestFrame: (callback) => {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      canceledFrames.push(id);
      frames.delete(id);
    },
    onStarted: (value) => {
      started.push(value);
    },
    onFrame: (value) => {
      flushed.push(value);
    },
    onStartFailure: (detail) => {
      failures.push(detail);
    },
    onAsyncError: (error) => {
      asyncErrors.push(error);
    },
  };

  return {
    dependencies,
    started,
    flushed,
    failures,
    asyncErrors,
    stops,
    frames,
    canceledFrames,
    get batchUnlistenCount() {
      return batchUnlistenCount;
    },
    get exitUnlistenCount() {
      return exitUnlistenCount;
    },
    get startCount() {
      return startCount;
    },
    emitBatch(batch: LogcatBatch): void {
      if (batchCallback === null) {
        throw new Error("Batch listener is not registered");
      }
      batchCallback(batch);
    },
    emitExit(exit: LogcatExit): void {
      if (exitCallback === null) {
        throw new Error("Exit listener is not registered");
      }
      exitCallback(exit);
    },
    runFrame(): void {
      const next = frames.entries().next();
      if (next.done) {
        throw new Error("No frame is scheduled");
      }
      const [id, callback] = next.value;
      frames.delete(id);
      callback();
    },
  };
}

describe("createLogcatStreamController", () => {
  it("buffers early batch and exit events and commits them in one frame", async () => {
    const pendingStart = deferred<LogcatSessionInfo>();
    const harness = createHarness({ startPromise: pendingStart.promise });
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    const running = controller.run();
    await advanceSetup();

    harness.emitBatch({ serial: "device-a", session_id: 7, lines: [line(1)] });
    harness.emitExit({
      serial: "device-a",
      session_id: 7,
      reason: "eof",
      detail: "",
    });
    expect(harness.frames.size).toBe(0);

    pendingStart.resolve({ serial: "device-a", session_id: 7 });
    await running;
    expect(harness.frames.size).toBe(1);
    harness.runFrame();

    expect(harness.flushed).toEqual([
      {
        sessionId: 7,
        lines: [line(1)],
        disconnectDetail: "eof",
      },
    ]);
  });

  it("stops a session that returns after disposal", async () => {
    const pendingStart = deferred<LogcatSessionInfo>();
    const harness = createHarness({ startPromise: pendingStart.promise });
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    const running = controller.run();
    await advanceSetup();

    controller.dispose();
    pendingStart.resolve({ serial: "device-a", session_id: 11 });
    await running;

    expect(harness.stops).toEqual([["device-a", 11]]);
    expect(harness.started).toHaveLength(0);
    expect(harness.flushed).toHaveLength(0);
  });

  it("rejects callbacks and session IDs left over from an A to B to A switch", async () => {
    const firstA = createHarness({ session: { serial: "device-a", session_id: 1 } });
    const firstController = createLogcatStreamController("device-a", firstA.dependencies);
    await firstController.run();
    firstController.dispose();

    const deviceB = createHarness({ session: { serial: "device-b", session_id: 2 } });
    const middleController = createLogcatStreamController("device-b", deviceB.dependencies);
    await middleController.run();
    middleController.dispose();

    const secondA = createHarness({ session: { serial: "device-a", session_id: 3 } });
    const secondController = createLogcatStreamController("device-a", secondA.dependencies);
    await secondController.run();

    firstA.emitBatch({ serial: "device-a", session_id: 1, lines: [line(1)] });
    secondA.emitBatch({ serial: "device-a", session_id: 1, lines: [line(2)] });
    secondA.emitExit({
      serial: "device-a",
      session_id: 1,
      reason: "eof",
      detail: "old session",
    });
    secondA.emitBatch({ serial: "device-a", session_id: 3, lines: [line(3)] });
    secondA.runFrame();

    expect(firstA.flushed).toHaveLength(0);
    expect(secondA.flushed).toEqual([
      { sessionId: 3, lines: [line(3)], disconnectDetail: null },
    ]);
  });

  it("keeps only the newest rows when the queued capacity is exceeded", async () => {
    const harness = createHarness({ capacity: 3 });
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    await controller.run();

    harness.emitBatch({ serial: "device-a", session_id: 7, lines: [line(0), line(1)] });
    harness.emitBatch({
      serial: "device-a",
      session_id: 7,
      lines: [line(2), line(3), line(4)],
    });
    expect(harness.frames.size).toBe(1);
    harness.runFrame();

    expect(harness.flushed[0]?.lines).toEqual([line(2), line(3), line(4)]);
  });

  it("coalesces multiple batches and the latest exit into one frame", async () => {
    const harness = createHarness();
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    await controller.run();

    harness.emitBatch({ serial: "device-a", session_id: 7, lines: [line(1)] });
    harness.emitBatch({ serial: "device-a", session_id: 7, lines: [line(2)] });
    harness.emitExit({ serial: "device-a", session_id: 7, reason: "eof", detail: "first" });
    harness.emitExit({ serial: "device-a", session_id: 7, reason: "error", detail: "last" });
    expect(harness.frames.size).toBe(1);
    harness.runFrame();

    expect(harness.flushed).toEqual([
      { sessionId: 7, lines: [line(1), line(2)], disconnectDetail: "last" },
    ]);
  });

  it("cancels a queued frame and ignores callbacks after disposal", async () => {
    const harness = createHarness();
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    await controller.run();
    harness.emitBatch({ serial: "device-a", session_id: 7, lines: [line(1)] });

    controller.dispose();
    controller.dispose();
    harness.emitBatch({ serial: "device-a", session_id: 7, lines: [line(2)] });

    expect(harness.canceledFrames).toHaveLength(1);
    expect(harness.frames.size).toBe(0);
    expect(harness.flushed).toHaveLength(0);
    expect(harness.stops).toEqual([["device-a", 7]]);
  });

  it("cleans up the first listener when the second listener fails", async () => {
    const harness = createHarness({ exitListenerError: new Error("listen failed") });
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    await controller.run();

    expect(harness.batchUnlistenCount).toBe(1);
    expect(harness.exitUnlistenCount).toBe(0);
    expect(harness.startCount).toBe(0);
    expect(harness.failures).toEqual(["Error: listen failed"]);
  });

  it("stops and reports a session whose returned serial does not match", async () => {
    const harness = createHarness({ session: { serial: "device-b", session_id: 9 } });
    const controller = createLogcatStreamController("device-a", harness.dependencies);
    await controller.run();

    expect(harness.stops).toEqual([["device-b", 9]]);
    expect(harness.started).toHaveLength(0);
    expect(harness.failures[0]).toContain("expected device-a, got device-b");
  });
});
