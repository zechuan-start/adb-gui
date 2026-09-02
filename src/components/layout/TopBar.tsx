import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { DeviceInfoButton } from "@/components/DeviceInfoPanel";
import { DevicePicker } from "@/components/layout/DevicePicker";
import { WifiConnectButton } from "@/components/WifiConnect";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { getAdbInfo, listDevices } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";

interface TopBarProps {
  onRefreshActivity: () => void;
}

export function TopBar({ onRefreshActivity }: TopBarProps) {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const currentActivity = useDeviceStore((state) => state.currentActivity);
  const adbInfo = useDeviceStore((state) => state.adbInfo);
  const setAdbInfo = useDeviceStore((state) => state.setAdbInfo);
  const setDevices = useDeviceStore((state) => state.setDevices);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [refreshing, setRefreshing] = useState(false);
  const device = getDeviceBySerial(devices, selectedDevice);
  const online = isOnlineDevice(device);
  const adbLabel = adbInfo ? `adb ${adbInfo.version} · ${adbInfo.source}` : "adb 未就绪";

  async function refreshDevices() {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      const [info, nextDevices] = await Promise.all([getAdbInfo(), listDevices()]);
      setAdbInfo(info);
      setDevices(nextDevices);
    } catch (error) {
      showToast("error", `刷新设备失败: ${String(error)}`);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-rule bg-surface px-[18px]">
      <div className="flex w-[clamp(190px,32vw,292px)] min-w-0 items-center">
        <DevicePicker />
      </div>
      <button
        type="button"
        onClick={() => void refreshDevices()}
        disabled={refreshing}
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-rule text-ink2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        title="刷新设备"
        aria-label="刷新设备"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </button>
      <WifiConnectButton />
      <DeviceInfoButton />

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="hidden shrink-0 font-data text-[10.5px] text-ink3 min-[1120px]:inline" title={adbLabel}>
          {adbLabel}
        </span>
        <span className="h-4 w-px shrink-0 bg-rule" aria-hidden="true" />
        <span className="hidden shrink-0 text-[11px] text-ink3 min-[980px]:inline">Activity</span>
        <span
          className="min-w-0 truncate font-data text-[11px] text-ink2"
          title={currentActivity || (online ? "暂无前台 Activity" : "设备不可用")}
        >
          {currentActivity || (online ? "暂无前台 Activity" : "设备不可用")}
        </span>
        <button
          type="button"
          onClick={onRefreshActivity}
          disabled={!online}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-rule text-ink2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="刷新前台 Activity"
          aria-label="刷新前台 Activity"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
