import { describe, expect, it, vi } from "vitest";
import { createActivityPollingController } from "@/hooks/activityPollingController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("activityPollingController", () => {
  it("waits for one request to settle before scheduling the next poll", async () => {
    const first = deferred<string>();
    const loadActivity = vi.fn(() => first.promise);
    const scheduled: Array<() => void> = [];
    const onActivity = vi.fn();
    const controller = createActivityPollingController("device-a", {
      loadActivity,
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
      onActivity,
      onError: vi.fn(),
    });

    controller.run();
    expect(loadActivity).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(0);

    first.resolve("com.example/.MainActivity");
    await flushMicrotasks();
    expect(onActivity).toHaveBeenCalledWith("com.example/.MainActivity");
    expect(scheduled).toHaveLength(1);
  });

  it("coalesces manual refreshes while a request is in flight", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loadActivity = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createActivityPollingController("device-a", {
      loadActivity,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
      onActivity: vi.fn(),
      onError: vi.fn(),
    });

    controller.run();
    const firstRefresh = controller.refresh();
    const secondRefresh = controller.refresh();
    let manualRefreshSettled = false;
    void Promise.all([firstRefresh, secondRefresh]).then(() => {
      manualRefreshSettled = true;
    });
    expect(loadActivity).toHaveBeenCalledTimes(1);

    first.resolve("first");
    await flushMicrotasks();
    expect(loadActivity).toHaveBeenCalledTimes(2);
    expect(manualRefreshSettled).toBe(false);
    second.resolve("second");
    await Promise.all([firstRefresh, secondRefresh]);
    expect(manualRefreshSettled).toBe(true);
  });

  it("settles active and queued manual refreshes when disposed", async () => {
    const activity = deferred<string>();
    const controller = createActivityPollingController("device-a", {
      loadActivity: () => activity.promise,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
      onActivity: vi.fn(),
      onError: vi.fn(),
    });

    const activeRefresh = controller.refresh();
    const queuedRefresh = controller.refresh();
    controller.dispose();

    await expect(Promise.all([activeRefresh, queuedRefresh])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });

  it("rejects late success and failure callbacks after disposal", async () => {
    const success = deferred<string>();
    const onActivity = vi.fn();
    const onError = vi.fn();
    const successController = createActivityPollingController("device-a", {
      loadActivity: () => success.promise,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
      onActivity,
      onError,
    });
    successController.run();
    successController.dispose();
    success.resolve("stale");
    await flushMicrotasks();

    const failure = deferred<string>();
    const failureController = createActivityPollingController("device-b", {
      loadActivity: () => failure.promise,
      schedule: vi.fn(() => 2),
      cancelSchedule: vi.fn(),
      onActivity,
      onError,
    });
    failureController.run();
    failureController.dispose();
    failure.reject(new Error("stale"));
    await flushMicrotasks();

    expect(onActivity).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a polling failure without replacing the last successful activity", async () => {
    const failure = new Error("device offline");
    const loadActivity = vi.fn()
      .mockResolvedValueOnce("com.example/.MainActivity")
      .mockRejectedValueOnce(failure);
    const scheduled: Array<() => void> = [];
    const activities: string[] = [];
    const onError = vi.fn();
    const controller = createActivityPollingController("device-a", {
      loadActivity,
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
      onActivity: (activity) => activities.push(activity),
      onError,
    });

    controller.run();
    await flushMicrotasks();
    scheduled[0]();
    await flushMicrotasks();

    expect(activities).toEqual(["com.example/.MainActivity"]);
    expect(onError).toHaveBeenCalledWith(failure);
    controller.dispose();
  });

  it("publishes process results independently within the same polling cycle", async () => {
    const activity = deferred<string>();
    const processes = deferred<Array<{ pid: string; name: string }>>();
    const onProcesses = vi.fn();
    const onProcessError = vi.fn();
    const scheduled: Array<() => void> = [];
    const controller = createActivityPollingController("device-a", {
      loadActivity: () => activity.promise,
      loadProcesses: () => processes.promise,
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
      now: () => 1234,
      onActivity: vi.fn(),
      onError: vi.fn(),
      onProcessRefreshing: vi.fn(),
      onProcesses,
      onProcessError,
    });

    controller.run();
    processes.resolve([{ pid: "42", name: "com.example.app:remote" }]);
    await flushMicrotasks();
    expect(onProcesses).toHaveBeenCalledWith(
      [{ pid: "42", name: "com.example.app:remote" }],
      1234,
    );
    expect(scheduled).toHaveLength(0);

    activity.reject(new Error("activity failed"));
    await flushMicrotasks();
    expect(onProcessError).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    controller.dispose();
  });

  it("rejects late process callbacks after disposal", async () => {
    const activity = deferred<string>();
    const processes = deferred<Array<{ pid: string; name: string }>>();
    const onProcesses = vi.fn();
    const onProcessError = vi.fn();
    const controller = createActivityPollingController("device-a", {
      loadActivity: () => activity.promise,
      loadProcesses: () => processes.promise,
      schedule: vi.fn(() => 1),
      cancelSchedule: vi.fn(),
      onActivity: vi.fn(),
      onError: vi.fn(),
      onProcesses,
      onProcessError,
    });

    controller.run();
    controller.dispose();
    processes.resolve([{ pid: "1", name: "stale" }]);
    activity.resolve("stale");
    await flushMicrotasks();

    expect(onProcesses).not.toHaveBeenCalled();
    expect(onProcessError).not.toHaveBeenCalled();
  });
});
