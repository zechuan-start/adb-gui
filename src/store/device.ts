
import { create } from "zustand";
import type { DeviceInfo, AdbInfo } from "@/lib/tauri";

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
      const stillExists = devices.some((d) => d.serial === state.selectedDevice);
      return {
        devices,
        selectedDevice: stillExists ? state.selectedDevice : devices[0]?.serial ?? null,
      };
    });
  },
  setSelectedDevice: (serial) => set({ selectedDevice: serial }),
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
