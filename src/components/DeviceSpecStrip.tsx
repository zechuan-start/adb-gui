import { useT, messages, errorText, type Messages } from "@/i18n";
import { useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { DeviceInfo } from "@/lib/tauri";
import {
  batteryStatusLabel,
  getDeviceBySerial,
  getDeviceStateLabel,
  getSelectableDevices,
  isOnlineDevice,
  mergeDevicesByIdentity,
  transportKind,
  transportLabel,
} from "@/lib/device";
import { cn } from "@/lib/utils";
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
  t: Messages = messages(),
): DeviceSpecStripModel | null {
  if (!device) {
    return null;
  }

  const resolvedTransports = transports ?? [device];
  const model = device.model.trim();
  const serialItem: DeviceSpecItem = {
    key: "serial",
    label: t.shell.spec.serial,
    value: device.device_id ?? device.serial,
  };
  const transportItem: DeviceSpecItem = {
    key: "transport",
    label: t.shell.spec.transport,
    value: getTransportDescription(device, resolvedTransports, t),
  };
  const baseItems: DeviceSpecItem[] = [
    ...(model ? [{ key: "model", label: t.shell.spec.model, value: model }] : []),
    serialItem,
    transportItem,
  ];

  if (!isOnlineDevice(device)) {
    return {
      items: [
        ...baseItems,
        {
          key: "state",
          label: t.shell.spec.state,
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
          label: t.shell.spec.details,
          value: loading ? t.shell.spec.loading : t.shell.spec.failed,
          title: detailStateMatches ? deviceDetail.error ? errorText(deviceDetail.error, t) : undefined : undefined,
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
    batteryStatusLabel(detail.battery_status, t),
  );
  const vendorModel = joinValues(detail.manufacturer, detail.model);

  return {
    items: [
      ...(vendorModel
        ? [{ key: "model", label: t.shell.spec.vendorModel, value: vendorModel }]
        : baseItems.filter((item) => item.key === "model")),
      serialItem,
      transportItem,
      ...optionalItem("android", "Android / SDK", android),
      ...optionalItem("abi", "ABI", detail.abi),
      ...optionalItem("display", t.shell.spec.display, display),
      ...optionalItem("battery", t.shell.spec.battery, battery),
    ],
    loading: false,
  };
}

export function getForegroundActivityLabel(
  device: DeviceInfo | null,
  currentActivity: string,
  t: Messages = messages(),
): string {
  if (!device || !isOnlineDevice(device)) {
    return t.shell.spec.unavailable;
  }
  return currentActivity || t.shell.spec.noActivity;
}

interface DeviceSpecStripProps {
  activityRefreshing: boolean;
  onRefreshActivity: () => void;
}

export function DeviceSpecStrip({
  activityRefreshing,
  onRefreshActivity,
}: DeviceSpecStripProps) {
  const t = useT();
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
      aria-label={t.shell.spec.label}
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
          disabled={!onlineSerial || activityRefreshing}
          className="flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-ink2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title={activityRefreshing ? t.shell.spec.refreshingActivity : t.shell.spec.refreshActivity}
          aria-label={activityRefreshing ? t.shell.spec.refreshingActivity : t.shell.spec.refreshActivity}
          aria-busy={activityRefreshing}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", activityRefreshing && "animate-spin")}
          />
        </button>
      </dl>
    </section>
  );
}

function optionalItem(key: string, label: string, value: string): DeviceSpecItem[] {
  const normalized = value.trim();
  return normalized ? [{ key, label, value: normalized }] : [];
}

function getTransportDescription(device: DeviceInfo, transports: DeviceInfo[], t: Messages): string {
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
  return t.shell.spec.connections({ labels, primary: transportLabel(transportKind(device)) });
}

function joinValues(...values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(" / ");
}
