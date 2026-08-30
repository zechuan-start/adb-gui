import { useEffect } from "react";
import { createLogcatStreamController } from "@/hooks/logcatStreamController";
import { LOGCAT_CAPACITY } from "@/lib/logcat";
import {
  onLogcatBatch,
  onLogcatExit,
  startLogcat,
  stopLogcat,
} from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { useLogcatStore } from "@/store/logcat";

export function useLogcatStream(): void {
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const showToast = useFeedbackStore((state) => state.showToast);
  const restartNonce = useLogcatStore((state) => state.restartNonce);

  useEffect(() => {
    const store = useLogcatStore.getState();
    if (!selectedDevice) {
      if (store.serial !== null) {
        store.markDeviceUnavailable("设备已断开");
      } else {
        store.reset();
      }
      return;
    }
    if (store.serial !== selectedDevice) {
      store.reset();
    }
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDevice) {
      return;
    }

    const generation = restartNonce;
    const currentStore = useLogcatStore.getState();
    if (
      currentStore.serial === selectedDevice &&
      currentStore.streamState === "disconnected"
    ) {
      return;
    }

    function isCurrentGeneration(): boolean {
      return (
        useDeviceStore.getState().selectedDevice === selectedDevice &&
        useLogcatStore.getState().restartNonce === generation
      );
    }

    currentStore.setStreamState("starting");
    const controller = createLogcatStreamController(selectedDevice, {
      capacity: LOGCAT_CAPACITY,
      listenBatch: onLogcatBatch,
      listenExit: onLogcatExit,
      start: startLogcat,
      stop: stopLogcat,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frame) => window.cancelAnimationFrame(frame),
      onStarted: (session) => {
        if (!isCurrentGeneration()) {
          return;
        }
        useLogcatStore.getState().beginSession(session.serial, session.session_id);
      },
      onFrame: ({ lines, sessionId, disconnectDetail }) => {
        if (!isCurrentGeneration()) {
          return;
        }
        useLogcatStore.getState().flushFrame(lines, sessionId, disconnectDetail);
      },
      onStartFailure: (detail) => {
        if (!isCurrentGeneration()) {
          return;
        }
        useLogcatStore.getState().failStart(detail);
        showToast("error", `启动 Logcat 失败: ${detail}`);
      },
      onAsyncError: console.error,
    });

    // Register both listeners before starting adb so the initial dump cannot be lost.
    void controller.run();
    return controller.dispose;
  }, [restartNonce, selectedDevice, showToast]);
}
