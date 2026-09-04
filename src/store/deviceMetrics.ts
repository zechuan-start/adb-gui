import { create } from "zustand";
import {
  DeviceMetricsRingBuffer,
  METRICS_HISTORY_CAPACITY,
} from "@/lib/deviceMetrics";
import type {
  DeviceBatteryUsage,
  DeviceMetricsFrame,
  DeviceProcessUsage,
} from "@/lib/tauri";

export type DeviceMetricsStreamState =
  | "idle"
  | "starting"
  | "streaming"
  | "stopped"
  | "error";

export interface DeviceMetricsHistoryPoint {
  atMs: number;
  cpuPercent: number | null;
  memoryUsedKb: number;
  memoryAvailableKb: number;
  memoryTotalKb: number;
}

interface DeviceMetricsStore {
  deviceKey: string | null;
  serial: string | null;
  sessionId: number | null;
  streamState: DeviceMetricsStreamState;
  error: string;
  history: DeviceMetricsRingBuffer<DeviceMetricsHistoryPoint>;
  revision: number;
  latestFrame: DeviceMetricsFrame | null;
  battery: DeviceBatteryUsage | null;
  processes: DeviceProcessUsage[] | null;
  backgroundEnabled: boolean;
  restartNonce: number;
  bindDevice: (deviceKey: string | null, serial: string | null) => void;
  markStarting: (deviceKey: string, serial: string) => void;
  beginSession: (deviceKey: string, serial: string, sessionId: number) => void;
  acceptFrame: (frame: DeviceMetricsFrame) => void;
  acceptExit: (serial: string, sessionId: number, detail: string) => void;
  failStart: (deviceKey: string, serial: string, detail: string) => void;
  markStopped: (serial: string, sessionId: number) => void;
  setBackgroundEnabled: (enabled: boolean) => void;
  restart: () => void;
}

function clearDeviceState(
  deviceKey: string | null,
  serial: string | null,
  backgroundEnabled: boolean,
  restartNonce: number,
): Pick<
  DeviceMetricsStore,
  | "deviceKey"
  | "serial"
  | "sessionId"
  | "streamState"
  | "error"
  | "history"
  | "revision"
  | "latestFrame"
  | "battery"
  | "processes"
  | "backgroundEnabled"
  | "restartNonce"
> {
  return {
    deviceKey,
    serial,
    sessionId: null,
    streamState: deviceKey === null ? "idle" : "stopped",
    error: "",
    history: new DeviceMetricsRingBuffer(METRICS_HISTORY_CAPACITY),
    revision: 0,
    latestFrame: null,
    battery: null,
    processes: null,
    backgroundEnabled,
    restartNonce,
  };
}

export const useDeviceMetricsStore = create<DeviceMetricsStore>((set) => ({
  ...clearDeviceState(null, null, false, 0),
  bindDevice: (deviceKey, serial) => {
    set((state) => {
      if (state.deviceKey !== deviceKey) {
        return clearDeviceState(
          deviceKey,
          serial,
          state.backgroundEnabled,
          state.restartNonce,
        );
      }
      if (state.serial === serial) {
        return state;
      }
      return {
        serial,
        sessionId: null,
        streamState: deviceKey === null ? "idle" : "stopped",
        error: "",
      };
    });
  },
  markStarting: (deviceKey, serial) => {
    set((state) =>
      state.deviceKey === deviceKey && state.serial === serial
        ? { sessionId: null, streamState: "starting", error: "" }
        : state,
    );
  },
  beginSession: (deviceKey, serial, sessionId) => {
    set((state) =>
      state.deviceKey === deviceKey && state.serial === serial
        ? { sessionId, streamState: "streaming", error: "" }
        : state,
    );
  },
  acceptFrame: (frame) => {
    set((state) => {
      if (state.serial !== frame.serial || state.sessionId !== frame.session_id) {
        return state;
      }
      state.history.push({
        atMs: frame.at_ms,
        cpuPercent: frame.cpu?.total_percent ?? null,
        memoryUsedKb: frame.memory.used_kb,
        memoryAvailableKb: frame.memory.available_kb,
        memoryTotalKb: frame.memory.total_kb,
      });
      return {
        streamState: "streaming",
        error: "",
        latestFrame: frame,
        battery: frame.battery ?? state.battery,
        processes: frame.processes ?? state.processes,
        revision: state.revision + 1,
      };
    });
  },
  acceptExit: (serial, sessionId, error) => {
    set((state) =>
      state.serial === serial && state.sessionId === sessionId
        ? { sessionId: null, streamState: "error", error }
        : state,
    );
  },
  failStart: (deviceKey, serial, error) => {
    set((state) =>
      state.deviceKey === deviceKey && state.serial === serial
        ? { sessionId: null, streamState: "error", error }
        : state,
    );
  },
  markStopped: (serial, sessionId) => {
    set((state) =>
      state.serial === serial && state.sessionId === sessionId
        ? { sessionId: null, streamState: "stopped", error: "" }
        : state,
    );
  },
  setBackgroundEnabled: (backgroundEnabled) => set({ backgroundEnabled }),
  restart: () => {
    set((state) => ({ restartNonce: state.restartNonce + 1, error: "" }));
  },
}));
