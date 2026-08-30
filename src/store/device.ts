import { create } from "zustand";
import type { DeviceInfo, AdbInfo } from "@/lib/tauri";
import { getPreferredSelectedDeviceSerial } from "@/lib/device";

interface DeviceStore {
  adbInfo: AdbInfo | null;
  devices: DeviceInfo[];
  selectedDevice: string | null;
  currentActivity: string;
  currentPackage: string;
  setAdbInfo: (info: AdbInfo) => void;
  setDevices: (devices: DeviceInfo[]) => void;
  setSelectedDevice: (serial: string | null) => void;
  setCurrentActivity: (activity: string) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  adbInfo: null,
  devices: [],
  selectedDevice: null,
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
      return {
        devices,
        selectedDevice,
        ...(selectedDevice === state.selectedDevice
          ? {}
          : { currentActivity: "", currentPackage: "" }),
      };
    });
  },
  setSelectedDevice: (serial) => {
    set((state) => {
      const selectedDevice = serial
        ? getPreferredSelectedDeviceSerial(state.devices, serial)
        : null;
      if (selectedDevice === state.selectedDevice) {
        return state;
      }
      return {
        selectedDevice,
        currentActivity: "",
        currentPackage: "",
      };
    });
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
