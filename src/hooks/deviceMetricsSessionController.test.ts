import { describe, expect, it, vi } from "vitest";
import { createDeviceMetricsSessionController } from "@/hooks/deviceMetricsSessionController";
import type {
  DeviceMetricsExit,
  DeviceMetricsFrame,
  DeviceMetricsSessionInfo,
} from "@/lib/tauri";

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function frame(sessionId: number): DeviceMetricsFrame {
  return {
    serial: "device-a",
    session_id: sessionId,
    at_ms: 1000,
    cpu: null,
    memory: { total_kb: 100, available_kb: 40, used_kb: 60 },
    battery: null,
    processes: null,
  };
}

function dependencies(start: () => Promise<DeviceMetricsSessionInfo>) {
  let frameListener: ((value: DeviceMetricsFrame) => void) | null = null;
  let exitListener: ((value: DeviceMetricsExit) => void) | null = null;
  const stop = vi.fn(async () => undefined);
  const onStarted = vi.fn();
  const onFrame = vi.fn();
  const onExit = vi.fn();
  const onStopped = vi.fn();
  const onStartFailure = vi.fn();
  const onAsyncError = vi.fn();
  return {
    values: {
      listenFrame: async (callback: (value: DeviceMetricsFrame) => void) => {
        frameListener = callback;
        return () => {
          frameListener = null;
        };
      },
      listenExit: async (callback: (value: DeviceMetricsExit) => void) => {
        exitListener = callback;
        return () => {
          exitListener = null;
        };
      },
      start,
      stop,
      onStarted,
      onFrame,
      onExit,
      onStopped,
      onStartFailure,
      onAsyncError,
    },
    emitFrame: (value: DeviceMetricsFrame) => frameListener?.(value),
    emitExit: (value: DeviceMetricsExit) => exitListener?.(value),
  };
}

describe("createDeviceMetricsSessionController", () => {
  it("buffers an initial frame until start returns its session id", async () => {
    const pending = deferred<DeviceMetricsSessionInfo>();
    const deps = dependencies(() => pending.promise);
    const controller = createDeviceMetricsSessionController("device-a", deps.values);
    const running = controller.run();
    await Promise.resolve();
    await Promise.resolve();

    deps.emitFrame(frame(7));
    expect(deps.values.onFrame).not.toHaveBeenCalled();
    pending.resolve({ serial: "device-a", session_id: 7 });
    await running;

    expect(deps.values.onStarted).toHaveBeenCalledWith({
      serial: "device-a",
      session_id: 7,
    });
    expect(deps.values.onFrame).toHaveBeenCalledWith(frame(7));
  });

  it("stops the exact late session when disposed during start", async () => {
    const pending = deferred<DeviceMetricsSessionInfo>();
    const deps = dependencies(() => pending.promise);
    const controller = createDeviceMetricsSessionController("device-a", deps.values);
    const running = controller.run();
    await Promise.resolve();
    await Promise.resolve();
    controller.dispose();

    pending.resolve({ serial: "device-a", session_id: 9 });
    await running;

    expect(deps.values.stop).toHaveBeenCalledWith("device-a", 9);
    expect(deps.values.onStarted).not.toHaveBeenCalled();
  });

  it("rejects stale sessions and reports only the active exit", async () => {
    const deps = dependencies(async () => ({ serial: "device-a", session_id: 3 }));
    const controller = createDeviceMetricsSessionController("device-a", deps.values);
    await controller.run();

    deps.emitFrame(frame(2));
    deps.emitFrame(frame(3));
    deps.emitExit({
      serial: "device-a",
      session_id: 3,
      reason: "eof",
      detail: "closed",
    });
    deps.emitFrame(frame(3));

    expect(deps.values.onFrame).toHaveBeenCalledTimes(1);
    expect(deps.values.onExit).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(deps.values.onStopped).not.toHaveBeenCalled();
  });
});
