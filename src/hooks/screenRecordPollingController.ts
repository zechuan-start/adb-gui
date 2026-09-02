import type { ScreenRecordStatus } from "@/lib/tauri";

interface ScreenRecordPollingDependencies {
  loadStatus: () => Promise<ScreenRecordStatus>;
  schedule: (callback: () => void, delayMs: number) => number;
  cancelSchedule: (handle: number) => void;
  onStatus: (status: ScreenRecordStatus) => void;
  onError: (error: unknown) => void;
}

export interface ScreenRecordPollingController {
  run: () => void;
  dispose: () => void;
}

const SCREEN_RECORD_REFRESH_MS = 1_000;

export function createScreenRecordPollingController(
  dependencies: ScreenRecordPollingDependencies,
): ScreenRecordPollingController {
  let disposed = false;
  let started = false;
  let inFlight = false;
  let scheduleHandle: number | null = null;
  let lastError = "";

  function scheduleRefresh(): void {
    if (disposed || !started) {
      return;
    }
    scheduleHandle = dependencies.schedule(() => {
      scheduleHandle = null;
      void refreshNow();
    }, SCREEN_RECORD_REFRESH_MS);
  }

  async function refreshNow(): Promise<void> {
    if (disposed || inFlight) {
      return;
    }
    inFlight = true;
    try {
      const status = await dependencies.loadStatus();
      if (!disposed) {
        lastError = "";
        dependencies.onStatus(status);
      }
    } catch (error) {
      const message = String(error);
      if (!disposed && lastError !== message) {
        lastError = message;
        dependencies.onError(error);
      }
    } finally {
      inFlight = false;
      scheduleRefresh();
    }
  }

  return {
    run: () => {
      if (disposed || started) {
        return;
      }
      started = true;
      void refreshNow();
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (scheduleHandle !== null) {
        dependencies.cancelSchedule(scheduleHandle);
        scheduleHandle = null;
      }
    },
  };
}
