import { useEffect } from "react";
import type { DeviceInfo } from "@/lib/tauri";
import {
  getDeviceBySerial,
  getDeviceStateLabel,
  isOnlineDevice,
} from "@/lib/device";
import {
  useDeviceStore,
  type DeviceDetailState,
} from "@/store/device";

export interface DeviceSpecItem {
  key: string;
  label: string;
  value: string;
  title?: string;
}

export interface DeviceSpecStripModel {
  items: DeviceSpecItem[];
  loading: boolean;
}

export function getDeviceSpecStripModel(
  device: DeviceInfo | null,
  deviceDetail: DeviceDetailState,
): DeviceSpecStripModel | null {
  if (!device) {
    return null;
  }

  const model = device.model.trim();
  const serialItem: DeviceSpecItem = {
    key: "serial",
    label: "序列号",
    value: device.serial,
  };
  const baseItems: DeviceSpecItem[] = [
    ...(model ? [{ key: "model", label: "型号", value: model }] : []),
    serialItem,
  ];

  if (!isOnlineDevice(device)) {
    return {
      items: [
        ...baseItems,
        {
          key: "state",
          label: "状态",
          value: getDeviceStateLabel(device.state),
        },
      ],
      loading: false,
    };
  }

  const detailStateMatches = deviceDetail.serial === device.serial;
  const detail = detailStateMatches ? deviceDetail.detail : null;
  const loading = !detailStateMatches || deviceDetail.loading;
  if (!detail) {
    return {
      items: [
        ...baseItems,
        {
          key: "detail-status",
          label: "设备详情",
          value: loading ? "读取中..." : "读取失败",
          title: detailStateMatches ? deviceDetail.error ?? undefined : undefined,
        },
      ],
      loading,
    };
  }

  const android = joinValues(
    detail.android_version,
    detail.sdk_level ? `SDK ${detail.sdk_level}` : "",
  );
  const display = joinValues(detail.resolution, detail.density);
  const battery = joinValues(
    detail.battery_level ? `${detail.battery_level}%` : "",
    detail.battery_status,
  );

  return {
    items: [
      ...(detail.model.trim()
        ? [{ key: "model", label: "型号", value: detail.model.trim() }]
        : baseItems.filter((item) => item.key === "model")),
      serialItem,
      ...optionalItem("android", "Android / SDK", android),
      ...optionalItem("abi", "ABI", detail.abi),
      ...optionalItem("display", "分辨率 / 密度", display),
      ...optionalItem("battery", "电量", battery),
    ],
    loading: false,
  };
}

export function DeviceSpecStrip() {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const deviceDetail = useDeviceStore((state) => state.deviceDetail);
  const refreshDeviceDetail = useDeviceStore((state) => state.refreshDeviceDetail);
  const device = getDeviceBySerial(devices, selectedDevice);
  const onlineSerial = device && isOnlineDevice(device) ? device.serial : null;
  const model = getDeviceSpecStripModel(device, deviceDetail);

  useEffect(() => {
    if (!onlineSerial) {
      return;
    }
    void refreshDeviceDetail().catch(() => undefined);
  }, [onlineSerial, refreshDeviceDetail]);

  if (!model) {
    return null;
  }

  return (
    <section
      aria-label="设备规格"
      aria-busy={model.loading}
      className="grid min-h-[92px] shrink-0 grid-cols-3 border border-rule bg-surface2 lg:min-h-14 lg:grid-cols-6"
    >
      {model.items.map((item) => (
        <dl
          key={item.key}
          className="flex min-w-0 flex-col justify-center border-r border-rule px-3 py-2 last:border-r-0"
        >
          <dt className="text-[10px] uppercase text-ink3">{item.label}</dt>
          <dd
            className="mt-0.5 truncate font-data text-[11px] text-ink"
            title={item.title ?? item.value}
          >
            {item.value}
          </dd>
        </dl>
      ))}
    </section>
  );
}

function optionalItem(key: string, label: string, value: string): DeviceSpecItem[] {
  const normalized = value.trim();
  return normalized ? [{ key, label, value: normalized }] : [];
}

function joinValues(...values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(" / ");
}
