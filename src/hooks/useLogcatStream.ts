import { useEffect } from "react";
import { createLogcatStreamController } from "@/hooks/logcatStreamController";
import { LOGCAT_CAPACITY } from "@/lib/logcat";
import { getDeviceBySerial } from "@/lib/device";
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
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const showToast = useFeedbackStore((state) => state.showToast);
  const restartNonce = useLogcatStore((state) => state.restartNonce);
  const selected = getDeviceBySerial(devices, selectedDevice);
  const onlineSerial = selected?.state === "device" ? selected.serial : null;

  useEffect(() => {
    const store = useLogcatStore.getState();
    if (!onlineSerial) {
      if (store.serial !== null) {
        store.markDeviceUnavailable(selectedDevice ? "设备不可用" : "设备已断开");
      } else {
        store.reset();
      }
      return;
    }
    if (store.serial !== onlineSerial) {
      store.reset();
    }
  }, [onlineSerial, selectedDevice]);

  useEffect(() => {
    if (!onlineSerial) {
      return;
    }

    const generation = restartNonce;
    const currentStore = useLogcatStore.getState();
    if (
      currentStore.serial === onlineSerial &&
      currentStore.streamState === "disconnected"
    ) {
      return;
    }

    function isCurrentGeneration(): boolean {
      const deviceState = useDeviceStore.getState();
      const currentDevice = getDeviceBySerial(
        deviceState.devices,
        deviceState.selectedDevice,
      );
      return (
        currentDevice?.serial === onlineSerial &&
        currentDevice.state === "device" &&
        useLogcatStore.getState().restartNonce === generation
      );
    }

    currentStore.setStreamState("starting");
    const controller = createLogcatStreamController(onlineSerial, {
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
  }, [onlineSerial, restartNonce, showToast]);
}
