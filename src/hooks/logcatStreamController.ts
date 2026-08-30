import type {
  LogcatBatch,
  LogcatExit,
  LogcatLine,
  LogcatSessionInfo,
} from "@/lib/tauri";

type Unlisten = () => void;

interface QueuedBatch {
  sessionId: number;
  lines: LogcatLine[];
  head: number;
}

export interface LogcatStreamFrame {
  sessionId: number;
  lines: LogcatLine[];
  disconnectDetail: string | null;
}

export interface LogcatStreamControllerDependencies {
  capacity: number;
  listenBatch: (callback: (batch: LogcatBatch) => void) => Promise<Unlisten>;
  listenExit: (callback: (exit: LogcatExit) => void) => Promise<Unlisten>;
  start: (serial: string) => Promise<LogcatSessionInfo>;
  stop: (serial: string, sessionId: number) => Promise<void>;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
  onStarted: (session: LogcatSessionInfo) => void;
  onFrame: (frame: LogcatStreamFrame) => void;
  onStartFailure: (detail: string) => void;
  onAsyncError: (error: unknown) => void;
}

export interface LogcatStreamController {
  run: () => Promise<void>;
  dispose: () => void;
}

export function createLogcatStreamController(
  serial: string,
  dependencies: LogcatStreamControllerDependencies,
): LogcatStreamController {
  let disposed = false;
  let sessionInfo: LogcatSessionInfo | null = null;
  let unlistenBatch: Unlisten | null = null;
  let unlistenExit: Unlisten | null = null;
  let frame: number | null = null;
  let queuedLineCount = 0;
  let queuedBatchHead = 0;
  let runPromise: Promise<void> | null = null;
  const queuedBatches: QueuedBatch[] = [];
  const queuedExits: LogcatExit[] = [];

  function disposeListeners(): void {
    unlistenBatch?.();
    unlistenBatch = null;
    unlistenExit?.();
    unlistenExit = null;
  }

  function clearQueue(): void {
    queuedBatches.length = 0;
    queuedBatchHead = 0;
    queuedLineCount = 0;
    queuedExits.length = 0;
  }

  function compactBatchQueue(): void {
    if (queuedBatchHead > 1024 && queuedBatchHead * 2 >= queuedBatches.length) {
      queuedBatches.splice(0, queuedBatchHead);
      queuedBatchHead = 0;
    }
  }

  function trimQueuedLines(): void {
    let overflow = queuedLineCount - dependencies.capacity;
    while (overflow > 0 && queuedBatchHead < queuedBatches.length) {
      const oldest = queuedBatches[queuedBatchHead];
      const available = oldest.lines.length - oldest.head;
      const dropCount = Math.min(available, overflow);
      oldest.head += dropCount;
      overflow -= dropCount;
      queuedLineCount -= dropCount;
      if (oldest.head === oldest.lines.length) {
        queuedBatchHead += 1;
      }
    }
    compactBatchQueue();
  }

  function flushFrame(): void {
    frame = null;
    const activeSession = sessionInfo;
    if (disposed || activeSession === null) {
      return;
    }

    const lines: LogcatLine[] = [];
    for (let batchIndex = queuedBatchHead; batchIndex < queuedBatches.length; batchIndex += 1) {
      const batch = queuedBatches[batchIndex];
      if (batch.sessionId !== activeSession.session_id) {
        continue;
      }
      for (let lineIndex = batch.head; lineIndex < batch.lines.length; lineIndex += 1) {
        lines.push(batch.lines[lineIndex]);
      }
    }

    let matchingExit: LogcatExit | null = null;
    for (let index = queuedExits.length - 1; index >= 0; index -= 1) {
      const exit = queuedExits[index];
      if (exit.session_id === activeSession.session_id) {
        matchingExit = exit;
        break;
      }
    }
    clearQueue();

    if (lines.length > 0 || matchingExit !== null) {
      dependencies.onFrame({
        sessionId: activeSession.session_id,
        lines,
        disconnectDetail: matchingExit
          ? matchingExit.detail || matchingExit.reason
          : null,
      });
    }
  }

  function scheduleFrame(): void {
    if (disposed || sessionInfo === null || frame !== null) {
      return;
    }
    frame = dependencies.requestFrame(flushFrame);
  }

  function queueBatch(batch: LogcatBatch): void {
    if (
      disposed ||
      batch.serial !== serial ||
      batch.lines.length === 0 ||
      (sessionInfo !== null && batch.session_id !== sessionInfo.session_id)
    ) {
      return;
    }

    queuedBatches.push({
      sessionId: batch.session_id,
      lines: batch.lines,
      head: 0,
    });
    queuedLineCount += batch.lines.length;
    trimQueuedLines();
    scheduleFrame();
  }

  function queueExit(exit: LogcatExit): void {
    if (
      disposed ||
      exit.serial !== serial ||
      (sessionInfo !== null && exit.session_id !== sessionInfo.session_id)
    ) {
      return;
    }

    queuedExits.push(exit);
    if (queuedExits.length > 8) {
      queuedExits.shift();
    }
    scheduleFrame();
  }

  async function setup(): Promise<void> {
    try {
      const batchListener = await dependencies.listenBatch(queueBatch);
      if (disposed) {
        batchListener();
        return;
      }
      unlistenBatch = batchListener;

      const exitListener = await dependencies.listenExit(queueExit);
      if (disposed) {
        exitListener();
        return;
      }
      unlistenExit = exitListener;

      const startedSession = await dependencies.start(serial);
      if (disposed) {
        try {
          await dependencies.stop(startedSession.serial, startedSession.session_id);
        } catch (error) {
          dependencies.onAsyncError(error);
        }
        return;
      }
      if (startedSession.serial !== serial) {
        await dependencies.stop(startedSession.serial, startedSession.session_id);
        throw new Error(
          `Logcat session serial mismatch: expected ${serial}, got ${startedSession.serial}`,
        );
      }

      sessionInfo = startedSession;
      dependencies.onStarted(startedSession);
      scheduleFrame();
    } catch (error) {
      if (disposed) {
        return;
      }
      disposeListeners();
      clearQueue();
      dependencies.onStartFailure(String(error));
    }
  }

  return {
    run: () => {
      runPromise ??= setup();
      return runPromise;
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (frame !== null) {
        dependencies.cancelFrame(frame);
        frame = null;
      }
      disposeListeners();
      clearQueue();
      const activeSession = sessionInfo;
      if (activeSession) {
        void dependencies
          .stop(activeSession.serial, activeSession.session_id)
          .catch(dependencies.onAsyncError);
      }
    },
  };
}
