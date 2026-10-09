import { errorIdentity, type AppErrorPayload } from "@/i18n/errors";
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
import { useSettingsStore } from "@/store/settings";

export function useDeviceMetricsSession(active: boolean): void {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const backgroundEnabled = useSettingsStore((state) => state.available && state.preferences.performance.backgroundEnabled);
  const paused = useDeviceMetricsStore((state) => state.paused);
  const restartNonce = useDeviceMetricsStore((state) => state.restartNonce);
  const showToast = useFeedbackStore((state) => state.showToast);
  const lastErrorRef = useRef("");
  const activeRef = useRef(active);
  activeRef.current = active;
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

    // The performance panel renders these errors inline; only toast when the
    // panel is out of view, once per distinct error.
    function reportOutOfView(error: AppErrorPayload): void {
      const key = errorIdentity(error);
      if (lastErrorRef.current === key) {
        return;
      }
      lastErrorRef.current = key;
      if (!activeRef.current) {
        showToast("error", error);
      }
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
        const error: AppErrorPayload = exit.detail
          ? { code: "metrics_stopped", causes: [exit.detail] }
          : { code: "metrics_stopped", detail: exit.reason };
        useDeviceMetricsStore.getState().acceptExit(exit.serial, exit.session_id, error);
        reportOutOfView(error);
      },
      onStopped: (session) => {
        useDeviceMetricsStore
          .getState()
          .markStopped(session.serial, session.session_id);
      },
      onStartFailure: (detail) => {
        const error: AppErrorPayload = { code: "metrics_start", causes: [detail] };
        useDeviceMetricsStore.getState().failStart(deviceKey, onlineSerial, error);
        reportOutOfView(error);
      },
      onAsyncError: (error) => {
        console.error("Failed to stop device metrics session", error);
      },
    });

    void controller.run();
    return controller.dispose;
  }, [deviceKey, enabled, onlineSerial, restartNonce, showToast]);
}
