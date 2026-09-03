import { useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { DeviceInfo } from "@/lib/tauri";
import {
  getDeviceBySerial,
  getDeviceStateLabel,
  getSelectableDevices,
  isOnlineDevice,
  mergeDevicesByIdentity,
  transportKind,
  transportLabel,
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
  transports?: DeviceInfo[],
): DeviceSpecStripModel | null {
  if (!device) {
    return null;
  }

  const resolvedTransports = transports ?? [device];
  const model = device.model.trim();
  const serialItem: DeviceSpecItem = {
    key: "serial",
    label: "序列号",
    value: device.serial,
  };
  const transportItem: DeviceSpecItem = {
    key: "transport",
    label: "连接方式",
    value: getTransportDescription(device, resolvedTransports),
  };
  const baseItems: DeviceSpecItem[] = [
    ...(model ? [{ key: "model", label: "型号", value: model }] : []),
    serialItem,
    transportItem,
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
  const vendorModel = joinValues(detail.manufacturer, detail.model);

  return {
    items: [
      ...(vendorModel
        ? [{ key: "model", label: "厂商 / 型号", value: vendorModel }]
        : baseItems.filter((item) => item.key === "model")),
      serialItem,
      transportItem,
      ...optionalItem("android", "Android / SDK", android),
      ...optionalItem("abi", "ABI", detail.abi),
      ...optionalItem("display", "分辨率 / 密度", display),
      ...optionalItem("battery", "电量", battery),
    ],
    loading: false,
  };
}

export function getForegroundActivityLabel(
  device: DeviceInfo | null,
  currentActivity: string,
): string {
  if (!device || !isOnlineDevice(device)) {
    return "设备不可用";
  }
  return currentActivity || "暂无前台 Activity";
}

interface DeviceSpecStripProps {
  onRefreshActivity: () => void;
}

export function DeviceSpecStrip({ onRefreshActivity }: DeviceSpecStripProps) {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const deviceDetail = useDeviceStore((state) => state.deviceDetail);
  const currentActivity = useDeviceStore((state) => state.currentActivity);
  const refreshDeviceDetail = useDeviceStore((state) => state.refreshDeviceDetail);
  const device = getDeviceBySerial(devices, selectedDevice);
  const mergedDevices = useMemo(
    () => mergeDevicesByIdentity(getSelectableDevices(devices)),
    [devices],
  );
  const merged = device
    ? mergedDevices.find((item) =>
        item.transports.some((transport) => transport.serial === device.serial),
      )
    : null;
  const onlineSerial = device && isOnlineDevice(device) ? device.serial : null;
  const model = getDeviceSpecStripModel(
    device,
    deviceDetail,
    merged?.transports ?? (device ? [device] : undefined),
  );

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
      className="shrink-0 border border-rule bg-surface2"
    >
      <div className="grid min-h-[92px] grid-cols-3 border-b border-rule lg:min-h-14 lg:grid-cols-7">
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
      </div>

      <dl className="flex min-h-9 items-center gap-2.5 px-3 py-1.5">
        <dt className="shrink-0 text-[10px] uppercase text-ink3">Activity</dt>
        <dd className="min-w-0 flex-1 break-all font-data text-[11px] leading-5 text-ink">
          {getForegroundActivityLabel(device, currentActivity)}
        </dd>
        <button
          type="button"
          onClick={onRefreshActivity}
          disabled={!onlineSerial}
          className="flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-ink2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="刷新前台 Activity"
          aria-label="刷新前台 Activity"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </dl>
    </section>
  );
}

function optionalItem(key: string, label: string, value: string): DeviceSpecItem[] {
  const normalized = value.trim();
  return normalized ? [{ key, label, value: normalized }] : [];
}

function getTransportDescription(device: DeviceInfo, transports: DeviceInfo[]): string {
  const labels: string[] = [];
  if (transports.some((transport) => transportKind(transport) === "usb")) {
    labels.push(transportLabel("usb"));
  }
  if (transports.some((transport) => transportKind(transport) === "network")) {
    labels.push(transportLabel("network"));
  }
  if (labels.length === 1) {
    return labels[0];
  }
  return `${labels.join(" 和 ")} (当前 ${transportLabel(transportKind(device))})`;
}

function joinValues(...values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(" / ");
}
