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

export function isNetworkDevice(device: DeviceInfo): boolean {
  return device.serial.includes(":") || device.serial.includes("._adb-tls-connect._tcp");
}

export function isSelectableDevice(device: DeviceInfo): boolean {
  return isOnlineDevice(device) || !isNetworkDevice(device);
}

export function isConnectedNetworkDevice(device: DeviceInfo): boolean {
  return isNetworkDevice(device) && isOnlineDevice(device);
}

export function getSelectableDevices(devices: DeviceInfo[]): DeviceInfo[] {
  return devices.filter(isSelectableDevice);
}

export function getDeviceLabel(device: DeviceInfo | null): string {
  if (!device) {
    return "未连接设备";
  }

  return device.model?.trim() || device.serial;
}

export function getDeviceDisplayLabel(device: DeviceInfo): string {
  const label = getDeviceLabel(device);
  return label === device.serial ? label : `${label} - ${device.serial}`;
}

export function getPreferredSelectedDeviceSerial(devices: DeviceInfo[], selectedSerial: string | null): string | null {
  const selectableDevices = getSelectableDevices(devices);
  const selected = getDeviceBySerial(devices, selectedSerial);
  if (selected?.state === "device") {
    return selected.serial;
  }

  if (selected && isNetworkDevice(selected)) {
    const onlineNetwork = devices.find(isConnectedNetworkDevice);
    if (onlineNetwork) {
      return onlineNetwork.serial;
    }
  }

  const online = selectableDevices.find(isOnlineDevice);
  if (online) {
    return online.serial;
  }

  if (selected && isSelectableDevice(selected)) {
    return selected.serial;
  }

  return selectableDevices[0]?.serial ?? null;
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
