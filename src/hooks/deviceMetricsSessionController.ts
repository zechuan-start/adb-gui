import type {
  DeviceMetricsExit,
  DeviceMetricsFrame,
  DeviceMetricsSessionInfo,
} from "@/lib/tauri";

type Unlisten = () => void;
type QueuedEvent =
  | { type: "frame"; value: DeviceMetricsFrame }
  | { type: "exit"; value: DeviceMetricsExit };

export interface DeviceMetricsSessionControllerDependencies {
  listenFrame: (
    callback: (frame: DeviceMetricsFrame) => void,
  ) => Promise<Unlisten>;
  listenExit: (callback: (exit: DeviceMetricsExit) => void) => Promise<Unlisten>;
  start: (serial: string) => Promise<DeviceMetricsSessionInfo>;
  stop: (serial: string, sessionId: number) => Promise<void>;
  onStarted: (session: DeviceMetricsSessionInfo) => void;
  onFrame: (frame: DeviceMetricsFrame) => void;
  onExit: (exit: DeviceMetricsExit) => void;
  onStopped: (session: DeviceMetricsSessionInfo) => void;
  onStartFailure: (detail: string) => void;
  onAsyncError: (error: unknown) => void;
}

export interface DeviceMetricsSessionController {
  run: () => Promise<void>;
  dispose: () => void;
}

export function createDeviceMetricsSessionController(
  serial: string,
  dependencies: DeviceMetricsSessionControllerDependencies,
): DeviceMetricsSessionController {
  let disposed = false;
  let ended = false;
  let session: DeviceMetricsSessionInfo | null = null;
  let unlistenFrame: Unlisten | null = null;
  let unlistenExit: Unlisten | null = null;
  let runPromise: Promise<void> | null = null;
  const earlyEvents: QueuedEvent[] = [];

  function disposeListeners(): void {
    unlistenFrame?.();
    unlistenFrame = null;
    unlistenExit?.();
    unlistenExit = null;
  }

  function matches(event: { serial: string; session_id: number }): boolean {
    return event.serial === serial && event.session_id === session?.session_id;
  }

  function deliver(event: QueuedEvent): void {
    if (disposed || ended || !matches(event.value)) {
      return;
    }
    if (event.type === "frame") {
      dependencies.onFrame(event.value);
      return;
    }
    ended = true;
    dependencies.onExit(event.value);
  }

  function enqueue(event: QueuedEvent): void {
    if (disposed || event.value.serial !== serial) {
      return;
    }
    if (session !== null) {
      deliver(event);
      return;
    }
    earlyEvents.push(event);
    if (earlyEvents.length > 16) {
      earlyEvents.shift();
    }
  }

  async function setup(): Promise<void> {
    try {
      const nextUnlistenFrame = await dependencies.listenFrame((frame) => {
        enqueue({ type: "frame", value: frame });
      });
      if (disposed) {
        nextUnlistenFrame();
        return;
      }
      unlistenFrame = nextUnlistenFrame;

      const nextUnlistenExit = await dependencies.listenExit((exit) => {
        enqueue({ type: "exit", value: exit });
      });
      if (disposed) {
        nextUnlistenExit();
        return;
      }
      unlistenExit = nextUnlistenExit;

      const started = await dependencies.start(serial);
      if (disposed) {
        try {
          await dependencies.stop(started.serial, started.session_id);
        } catch (error) {
          dependencies.onAsyncError(error);
        }
        return;
      }
      if (started.serial !== serial) {
        await dependencies.stop(started.serial, started.session_id);
        throw new Error(
          `Device metrics session serial mismatch: expected ${serial}, got ${started.serial}`,
        );
      }

      session = started;
      dependencies.onStarted(started);
      for (const event of earlyEvents) {
        deliver(event);
      }
      earlyEvents.length = 0;
    } catch (error) {
      if (disposed) {
        return;
      }
      disposeListeners();
      earlyEvents.length = 0;
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
      disposeListeners();
      earlyEvents.length = 0;
      if (session !== null && !ended) {
        dependencies.onStopped(session);
      }
      if (session !== null) {
        void dependencies
          .stop(session.serial, session.session_id)
          .catch(dependencies.onAsyncError);
      }
    },
  };
}
