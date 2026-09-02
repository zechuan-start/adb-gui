import { useEffect, useState } from "react";
import { Copy, Info, X } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
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
  const deviceDetail = useDeviceStore((s) => s.deviceDetail);
  const refreshDeviceDetail = useDeviceStore((s) => s.refreshDeviceDetail);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const detailMatchesDevice = deviceDetail.serial === device?.serial;
  const info = detailMatchesDevice ? deviceDetail.detail : null;
  const loading = detailMatchesDevice && deviceDetail.loading;
  const error = detailMatchesDevice ? deviceDetail.error : null;

  useEffect(() => {
    if (!open || !device || !isOnlineDevice(device)) {
      return;
    }

    let active = true;
    void refreshDeviceDetail().catch((nextError: unknown) => {
      if (active) {
        showToast("error", `获取设备信息失败: ${String(nextError)}`);
      }
    });
    return () => {
      active = false;
    };
  }, [device?.serial, device?.state, open, refreshDeviceDetail, showToast]);

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
        className="inline-flex h-[34px] w-[34px] items-center justify-center border border-rule text-ink2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        title="设备信息"
        aria-label="设备信息"
      >
        <Info className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 border border-rule bg-popover p-3 text-popover-foreground shadow-[3px_3px_0_var(--color-hard-shadow)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">设备信息</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink3 hover:text-ink"
              aria-label="关闭设备信息"
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
                    className="flex items-center justify-between gap-2 px-2 py-1 text-xs hover:bg-hover"
                  >
                    <span className="text-ink3">{label}</span>
                    <div className="flex items-center gap-1">
                      <span className="max-w-40 truncate font-mono" title={display}>
                        {display}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyValue(value)}
                        className="text-ink3 hover:text-ink"
                        title="复制"
                        aria-label={`复制${label}`}
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
            <div className="py-4 text-center text-xs text-ink3">
              {error ? `获取失败: ${error}` : "设备不可用"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
