import { describe, expect, it, vi } from "vitest";
import { createScreenRecordPollingController } from "@/hooks/screenRecordPollingController";
import type { ScreenRecordStatus } from "@/lib/tauri";

const IDLE_STATUS: ScreenRecordStatus = {
  active: false,
  serial: null,
  elapsed_secs: 0,
  pending_pull: false,
};

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

describe("screenRecordPollingController", () => {
  it("waits for the current request before scheduling the next refresh", async () => {
    const first = deferred<ScreenRecordStatus>();
    const scheduled: Array<() => void> = [];
    const loadStatus = vi.fn(() => first.promise);
    const controller = createScreenRecordPollingController({
      loadStatus,
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
    });

    controller.run();
    expect(loadStatus).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(0);

    first.resolve(IDLE_STATUS);
    await flushMicrotasks();
    expect(scheduled).toHaveLength(1);
    controller.dispose();
  });

  it("reports one toast per continuous failure and resets after recovery", async () => {
    const failure = new Error("invoke unavailable");
    const scheduled: Array<() => void> = [];
    const loadStatus = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(IDLE_STATUS)
      .mockRejectedValueOnce(failure);
    const onError = vi.fn();
    const controller = createScreenRecordPollingController({
      loadStatus,
      schedule: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
      onStatus: vi.fn(),
      onError,
    });

    controller.run();
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledTimes(1);

    scheduled[0]();
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledTimes(1);

    scheduled[1]();
    await flushMicrotasks();
    scheduled[2]();
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("cancels scheduled work on disposal", async () => {
    const cancelSchedule = vi.fn();
    const controller = createScreenRecordPollingController({
      loadStatus: vi.fn().mockResolvedValue(IDLE_STATUS),
      schedule: vi.fn(() => 9),
      cancelSchedule,
      onStatus: vi.fn(),
      onError: vi.fn(),
    });

    controller.run();
    await flushMicrotasks();
    controller.dispose();

    expect(cancelSchedule).toHaveBeenCalledWith(9);
  });

  it("rejects late callbacks after disposal", async () => {
    const pending = deferred<ScreenRecordStatus>();
    const onStatus = vi.fn();
    const onError = vi.fn();
    const controller = createScreenRecordPollingController({
      loadStatus: () => pending.promise,
      schedule: vi.fn(() => 9),
      cancelSchedule: vi.fn(),
      onStatus,
      onError,
    });

    controller.run();
    controller.dispose();
    pending.resolve(IDLE_STATUS);
    await flushMicrotasks();

    expect(onStatus).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
