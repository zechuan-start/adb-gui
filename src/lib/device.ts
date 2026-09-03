import type { DeviceInfo } from "@/lib/tauri";

export type TransportKind = "usb" | "network";

export interface MergedDevice {
  serial: string;
  primary: DeviceInfo;
  transports: DeviceInfo[];
}

export function deviceCacheKey(device: DeviceInfo): string {
  return device.device_id ?? device.alias_identity ?? device.serial;
}

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
  return device.is_network;
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

export function transportKind(device: DeviceInfo): TransportKind {
  return device.is_network ? "network" : "usb";
}

export function transportLabel(kind: TransportKind): string {
  return kind === "network" ? "WiFi" : "USB";
}

export function mergeDevicesByIdentity(devices: DeviceInfo[]): MergedDevice[] {
  const groups: Array<Array<{ device: DeviceInfo; index: number }>> = [];
  const groupsByIdentity = new Map<
    string,
    Array<{ device: DeviceInfo; index: number }>
  >();

  devices.forEach((device, index) => {
    if (device.device_id === null) {
      groups.push([{ device, index }]);
      return;
    }

    const existing = groupsByIdentity.get(device.device_id);
    if (existing) {
      existing.push({ device, index });
      return;
    }

    const group = [{ device, index }];
    groupsByIdentity.set(device.device_id, group);
    groups.push(group);
  });

  return groups.map((group) => {
    // An identity can stay attached to an offline USB transport, so availability
    // must be evaluated before the USB preference on every refresh.
    const transports = [...group]
      .sort((left, right) => {
        const availability = Number(!isOnlineDevice(left.device))
          - Number(!isOnlineDevice(right.device));
        if (availability !== 0) {
          return availability;
        }

        const connection = Number(left.device.is_network)
          - Number(right.device.is_network);
        return connection !== 0 ? connection : left.index - right.index;
      })
      .map(({ device }) => device);
    const primary = transports[0];
    return { serial: primary.serial, primary, transports };
  });
}

export function activeTransports(merged: MergedDevice): DeviceInfo[] {
  const online = merged.transports.filter(isOnlineDevice);
  const candidates = online.length > 0 ? online : [merged.primary];
  const seen = new Set<TransportKind>();
  return candidates.filter((device) => {
    const kind = transportKind(device);
    if (seen.has(kind)) {
      return false;
    }
    seen.add(kind);
    return true;
  });
}

export function transportSummary(merged: MergedDevice): string {
  const labels = activeTransports(merged).map((device) =>
    transportLabel(transportKind(device)),
  );
  if (labels.length === 1) {
    return `${labels[0]} 连接`;
  }

  const primary = transportLabel(transportKind(merged.primary));
  return `${labels.join(" 和 ")} 连接, 当前使用 ${primary}`;
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

export function getPreferredSelectedDeviceSerial(
  devices: DeviceInfo[],
  selectedSerial: string | null,
  previousDevices: DeviceInfo[] = devices,
): string | null {
  const selectableDevices = getSelectableDevices(devices);
  const mergedDevices = mergeDevicesByIdentity(selectableDevices);
  const selectedGroup = mergedDevices.find((merged) =>
    merged.transports.some((device) => device.serial === selectedSerial),
  );
  if (selectedGroup && isOnlineDevice(selectedGroup.primary)) {
    return selectedGroup.serial;
  }

  const selected = getDeviceBySerial(devices, selectedSerial);
  const previousSelected = getDeviceBySerial(previousDevices, selectedSerial);
  const deviceId = previousSelected?.device_id;
  const onlineIdentityGroup = deviceId
    ? mergedDevices.find(
        (merged) =>
          merged.primary.device_id === deviceId && isOnlineDevice(merged.primary),
      )
    : null;
  if (onlineIdentityGroup) {
    return onlineIdentityGroup.serial;
  }

  const aliasIdentity =
    selected?.alias_identity ?? previousSelected?.alias_identity;
  const onlineAliasGroup = aliasIdentity
    ? mergedDevices.find(
        (merged) =>
          isOnlineDevice(merged.primary)
          && merged.transports.some(
            (device) =>
              device.alias_identity === aliasIdentity && isOnlineDevice(device),
          ),
      )
    : null;
  if (onlineAliasGroup) {
    return onlineAliasGroup.serial;
  }

  const onlineGroup = mergedDevices.find((merged) =>
    isOnlineDevice(merged.primary),
  );
  if (onlineGroup) {
    return onlineGroup.serial;
  }

  if (selectedGroup) {
    return selectedGroup.serial;
  }

  return mergedDevices[0]?.serial ?? null;
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
