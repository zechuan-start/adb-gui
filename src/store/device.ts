import { create } from "zustand";
import {
  getDeviceInfo,
  type AdbInfo,
  type DeviceDetail,
  type DeviceInfo,
} from "@/lib/tauri";
import {
  getDeviceBySerial,
  getPreferredSelectedDeviceSerial,
  getSelectableDevices,
  isOnlineDevice,
  mergeDevicesByIdentity,
} from "@/lib/device";

export interface DeviceDetailState {
  serial: string | null;
  detail: DeviceDetail | null;
  loading: boolean;
  error: string | null;
}

interface ActiveDeviceDetailRequest {
  generation: number;
  serial: string;
  promise: Promise<void>;
}

interface DeviceStore {
  adbInfo: AdbInfo | null;
  devices: DeviceInfo[];
  selectedDevice: string | null;
  deviceDetail: DeviceDetailState;
  currentActivity: string;
  currentPackage: string;
  setAdbInfo: (info: AdbInfo) => void;
  setDevices: (devices: DeviceInfo[]) => void;
  setSelectedDevice: (serial: string | null) => void;
  refreshDeviceDetail: () => Promise<void>;
  setCurrentActivity: (activity: string) => void;
}

let deviceDetailGeneration = 0;
let activeDeviceDetailRequest: ActiveDeviceDetailRequest | null = null;

export function createEmptyDeviceDetailState(): DeviceDetailState {
  return {
    serial: null,
    detail: null,
    loading: false,
    error: null,
  };
}

function invalidateDeviceDetailRequest(): void {
  deviceDetailGeneration += 1;
  activeDeviceDetailRequest = null;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  adbInfo: null,
  devices: [],
  selectedDevice: null,
  deviceDetail: createEmptyDeviceDetailState(),
  currentActivity: "",
  currentPackage: "",
  setAdbInfo: (info) => set({ adbInfo: info }),
  setDevices: (devices) => {
    set((state) => {
      const selectedDevice = getPreferredSelectedDeviceSerial(
        devices,
        state.selectedDevice,
        state.devices,
      );
      const selected = getDeviceBySerial(devices, selectedDevice);
      const resetDeviceDetail =
        selectedDevice !== state.selectedDevice ||
        (!isOnlineDevice(selected) && state.deviceDetail.serial !== null);
      if (resetDeviceDetail) {
        invalidateDeviceDetailRequest();
      }
      return {
        devices,
        selectedDevice,
        ...(resetDeviceDetail
          ? { deviceDetail: createEmptyDeviceDetailState() }
          : {}),
        ...(selectedDevice === state.selectedDevice
          ? {}
          : { currentActivity: "", currentPackage: "" }),
      };
    });
  },
  setSelectedDevice: (serial) => {
    set((state) => {
      const selectedDevice =
        mergeDevicesByIdentity(getSelectableDevices(state.devices)).find((merged) =>
          merged.transports.some((device) => device.serial === serial),
        )?.serial ?? null;
      if (selectedDevice === state.selectedDevice) {
        return state;
      }
      invalidateDeviceDetailRequest();
      return {
        selectedDevice,
        deviceDetail: createEmptyDeviceDetailState(),
        currentActivity: "",
        currentPackage: "",
      };
    });
  },
  refreshDeviceDetail: () => {
    const state = get();
    const device = getDeviceBySerial(state.devices, state.selectedDevice);
    if (!device || !isOnlineDevice(device)) {
      if (state.deviceDetail.serial !== null) {
        invalidateDeviceDetailRequest();
        set({ deviceDetail: createEmptyDeviceDetailState() });
      }
      return Promise.resolve();
    }

    if (
      state.deviceDetail.loading &&
      activeDeviceDetailRequest?.serial === device.serial &&
      activeDeviceDetailRequest.generation === deviceDetailGeneration
    ) {
      return activeDeviceDetailRequest.promise;
    }

    const serial = device.serial;
    const generation = ++deviceDetailGeneration;
    set({
      deviceDetail: {
        serial,
        detail: null,
        loading: true,
        error: null,
      },
    });

    const promise = Promise.resolve()
      .then(() => getDeviceInfo(serial))
      .then((detail) => {
        if (
          generation !== deviceDetailGeneration ||
          get().selectedDevice !== serial
        ) {
          return;
        }
        set({
          deviceDetail: {
            serial,
            detail,
            loading: false,
            error: null,
          },
        });
      })
      .catch((error: unknown) => {
        if (
          generation !== deviceDetailGeneration ||
          get().selectedDevice !== serial
        ) {
          return;
        }
        set({
          deviceDetail: {
            serial,
            detail: null,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      })
      .finally(() => {
        if (activeDeviceDetailRequest?.generation === generation) {
          activeDeviceDetailRequest = null;
        }
      });

    activeDeviceDetailRequest = { generation, serial, promise };
    return promise;
  },
  setCurrentActivity: (activity) => {
    const currentPackage = parsePackageFromActivity(activity);
    set({ currentActivity: activity, currentPackage });
  },
}));

function parsePackageFromActivity(activity: string): string {
  if (!activity) {
    return "";
  }

  const [component] = activity.split(/\s+/);
  if (!component) {
    return "";
  }

  const [packageName] = component.split("/");
  return packageName ?? "";
}
