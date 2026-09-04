import { useEffect, useRef } from "react";
import { createDeviceMetricsSessionController } from "@/hooks/deviceMetricsSessionController";
import { getDeviceBySerial } from "@/lib/device";
import { getDeviceMetricsKey } from "@/lib/deviceMetrics";
import {
  isTauriRuntime,
  onDeviceMetricsExit,
  onDeviceMetricsFrame,
  startDeviceMetrics,
  stopDeviceMetrics,
} from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";
import { useFeedbackStore } from "@/store/feedback";

export function useDeviceMetricsSession(active: boolean): void {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const backgroundEnabled = useDeviceMetricsStore((state) => state.backgroundEnabled);
  const paused = useDeviceMetricsStore((state) => state.paused);
  const restartNonce = useDeviceMetricsStore((state) => state.restartNonce);
  const showToast = useFeedbackStore((state) => state.showToast);
  const lastErrorRef = useRef("");
  const selected = getDeviceBySerial(devices, selectedDevice);
  const onlineDevice = selected?.state === "device" ? selected : null;
  const onlineSerial = onlineDevice?.serial ?? null;
  const deviceKey = onlineDevice ? getDeviceMetricsKey(onlineDevice) : null;
  const enabled = onlineSerial !== null && !paused && (active || backgroundEnabled);

  useEffect(() => {
    useDeviceMetricsStore.getState().bindDevice(deviceKey, onlineSerial);
  }, [deviceKey, onlineSerial]);

  useEffect(() => {
    if (!enabled || onlineSerial === null || deviceKey === null || !isTauriRuntime()) {
      return;
    }

    const store = useDeviceMetricsStore.getState();
    store.markStarting(deviceKey, onlineSerial);
    const controller = createDeviceMetricsSessionController(onlineSerial, {
      listenFrame: onDeviceMetricsFrame,
      listenExit: onDeviceMetricsExit,
      start: startDeviceMetrics,
      stop: stopDeviceMetrics,
      onStarted: (session) => {
        lastErrorRef.current = "";
        useDeviceMetricsStore
          .getState()
          .beginSession(deviceKey, onlineSerial, session.session_id);
      },
      onFrame: (frame) => {
        useDeviceMetricsStore.getState().acceptFrame(frame);
      },
      onExit: (exit) => {
        const message = exit.detail || exit.reason;
        useDeviceMetricsStore
          .getState()
          .acceptExit(exit.serial, exit.session_id, message);
        if (lastErrorRef.current !== message) {
          lastErrorRef.current = message;
          showToast("error", `设备性能采集已停止: ${message}`);
        }
      },
      onStopped: (session) => {
        useDeviceMetricsStore
          .getState()
          .markStopped(session.serial, session.session_id);
      },
      onStartFailure: (detail) => {
        useDeviceMetricsStore.getState().failStart(deviceKey, onlineSerial, detail);
        if (lastErrorRef.current !== detail) {
          lastErrorRef.current = detail;
          showToast("error", `启动设备性能采集失败: ${detail}`);
        }
      },
      onAsyncError: (error) => {
        console.error("Failed to stop device metrics session", error);
      },
    });

    void controller.run();
    return controller.dispose;
  }, [deviceKey, enabled, onlineSerial, restartNonce, showToast]);
}
