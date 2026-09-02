import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { DevicePicker } from "@/components/layout/DevicePicker";
import { WifiConnectButton } from "@/components/WifiConnect";
import { getAdbInfo, listDevices } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";

export function TopBar() {
  const adbInfo = useDeviceStore((state) => state.adbInfo);
  const setAdbInfo = useDeviceStore((state) => state.setAdbInfo);
  const setDevices = useDeviceStore((state) => state.setDevices);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [refreshing, setRefreshing] = useState(false);
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

      <div className="ml-auto flex min-w-0 items-center justify-end">
        <span className="min-w-0 truncate font-data text-[10.5px] text-ink3" title={adbLabel}>
          {adbLabel}
        </span>
      </div>
    </header>
  );
}
