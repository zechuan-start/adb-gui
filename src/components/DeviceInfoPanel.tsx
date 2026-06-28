import { useEffect, useState } from "react";
import { Copy, Info, X } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceInfo } from "@/lib/tauri";
import type { DeviceDetail } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";

const INFO_FIELDS: { key: keyof DeviceDetail; label: string }[] = [
  { key: "model", label: "型号" },
  { key: "manufacturer", label: "厂商" },
  { key: "android_version", label: "Android" },
  { key: "sdk_level", label: "SDK" },
  { key: "abi", label: "ABI" },
  { key: "resolution", label: "分辨率" },
  { key: "density", label: "密度" },
  { key: "battery_level", label: "电量" },
  { key: "battery_status", label: "电池状态" },
];

export function DeviceInfoButton() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !device || !isOnlineDevice(device)) {
      setInfo(null);
      return;
    }

    setLoading(true);
    getDeviceInfo(device.serial)
      .then(setInfo)
      .catch((e) => showToast("error", `获取设备信息失败: ${e}`))
      .finally(() => setLoading(false));
  }, [open, device?.serial]);

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    showToast("success", "已复制");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={!device || !isOnlineDevice(device)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title="设备信息"
      >
        <Info className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-border bg-card p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">设备信息</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading && (
            <div className="py-4 text-center text-xs text-muted-foreground">加载中...</div>
          )}

          {info && (
            <div className="space-y-1">
              {INFO_FIELDS.map(({ key, label }) => {
                const value = info[key];
                if (!value) return null;
                const display = key === "battery_level" ? `${value}%` : value;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-secondary/60"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{display}</span>
                      <button
                        type="button"
                        onClick={() => void copyValue(value)}
                        className="text-muted-foreground hover:text-foreground"
                        title="复制"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !info && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              设备不可用
            </div>
          )}
        </div>
      )}
    </div>
  );
}
