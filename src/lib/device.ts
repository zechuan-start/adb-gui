import type { DeviceInfo } from "@/lib/tauri";

export function getDeviceBySerial(devices: DeviceInfo[], serial: string | null): DeviceInfo | null {
  if (!serial) {
    return null;
  }

  return devices.find((device) => device.serial === serial) ?? null;
}

export function isOnlineDevice(device: DeviceInfo | null): boolean {
  return device?.state === "device";
}

export function getDeviceLabel(device: DeviceInfo | null): string {
  if (!device) {
    return "未连接设备";
  }

  return device.model?.trim() || device.serial;
}

export function getDeviceStateLabel(state: string): string {
  switch (state) {
    case "device":
      return "在线";
    case "unauthorized":
      return "未授权";
    case "offline":
      return "离线";
    default:
      return state || "未知";
  }
}

