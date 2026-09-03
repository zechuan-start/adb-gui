import type { ProcessEntry } from "@/lib/tauri";

export interface ActivityPollingControllerDependencies {
  loadActivity: (serial: string) => Promise<string>;
  loadProcesses?: (serial: string) => Promise<ProcessEntry[]>;
  schedule: (callback: () => void, delayMs: number) => number;
  cancelSchedule: (handle: number) => void;
  now?: () => number;
  onActivity: (activity: string) => void;
  onError: (error: unknown) => void;
  onProcessRefreshing?: () => void;
  onProcesses?: (entries: ProcessEntry[], updatedAt: number) => void;
  onProcessError?: (error: unknown) => void;
}

export interface ActivityPollingController {
  run: () => void;
  refresh: () => Promise<void>;
  dispose: () => void;
}

const ACTIVITY_REFRESH_MS = 5_000;

export function createActivityPollingController(
  serial: string,
  dependencies: ActivityPollingControllerDependencies,
): ActivityPollingController {
  let disposed = false;
  let started = false;
  let inFlight = false;
  let refreshQueued = false;
  let scheduleHandle: number | null = null;
  let activeRefreshWaiters: Array<() => void> = [];
  let queuedRefreshWaiters: Array<() => void> = [];

  function resolveRefreshWaiters(waiters: Array<() => void>): void {
    waiters.forEach((resolve) => resolve());
  }

  function cancelScheduledRefresh(): void {
    if (scheduleHandle !== null) {
      dependencies.cancelSchedule(scheduleHandle);
      scheduleHandle = null;
    }
  }

  function scheduleRefresh(): void {
    if (disposed || !started) {
      return;
    }
    cancelScheduledRefresh();
    scheduleHandle = dependencies.schedule(() => {
      scheduleHandle = null;
      void refreshNow();
    }, ACTIVITY_REFRESH_MS);
  }

  async function refreshNow(): Promise<void> {
    if (disposed) {
      return;
    }
    if (inFlight) {
      refreshQueued = true;
      return;
    }
    inFlight = true;
    activeRefreshWaiters = queuedRefreshWaiters;
    queuedRefreshWaiters = [];
    const activityRequest = (async () => {
      try {
        const activity = await dependencies.loadActivity(serial);
        if (!disposed) {
          dependencies.onActivity(activity);
        }
      } catch (error) {
        if (!disposed) {
          dependencies.onError(error);
        }
      }
    })();
    const processRequest = (async () => {
      if (!dependencies.loadProcesses) {
        return;
      }
      dependencies.onProcessRefreshing?.();
      try {
        const entries = await dependencies.loadProcesses(serial);
        if (!disposed) {
          dependencies.onProcesses?.(entries, dependencies.now?.() ?? Date.now());
        }
      } catch (error) {
        if (!disposed) {
          dependencies.onProcessError?.(error);
        }
      }
    })();

    try {
      await Promise.allSettled([activityRequest, processRequest]);
    } finally {
      inFlight = false;
      const completedRefreshWaiters = activeRefreshWaiters;
      activeRefreshWaiters = [];
      resolveRefreshWaiters(completedRefreshWaiters);
      if (!disposed && refreshQueued) {
        refreshQueued = false;
        void refreshNow();
      } else {
        scheduleRefresh();
      }
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
    refresh: () => {
      if (disposed) {
        return Promise.resolve();
      }
      cancelScheduledRefresh();
      return new Promise<void>((resolve) => {
        queuedRefreshWaiters.push(resolve);
        if (inFlight) {
          refreshQueued = true;
          return;
        }
        void refreshNow();
      });
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      refreshQueued = false;
      cancelScheduledRefresh();
      resolveRefreshWaiters(activeRefreshWaiters);
      resolveRefreshWaiters(queuedRefreshWaiters);
      activeRefreshWaiters = [];
      queuedRefreshWaiters = [];
    },
  };
}
