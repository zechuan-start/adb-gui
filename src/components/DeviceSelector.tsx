import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Smartphone } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { listDevices } from "@/lib/tauri";
import { cn } from "@/lib/utils";

function deviceLabel(state: string) {
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

function deviceColor(state: string) {
  switch (state) {
    case "device":
      return "bg-emerald-400";
    case "unauthorized":
      return "bg-amber-400";
    case "offline":
      return "bg-slate-500";
    default:
      return "bg-red-400";
  }
}

export function DeviceSelector() {
  const { devices, selectedDevice, setSelectedDevice, setDevices } = useDeviceStore();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const list = await listDevices();
      setDevices(list);
    } catch (e) {
      console.error("Failed to list devices:", e);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selected = useMemo(
    () => devices.find((device) => device.serial === selectedDevice) ?? null,
    [devices, selectedDevice],
  );

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Smartphone className="h-4 w-4 text-muted-foreground" />
      <div className="relative min-w-[220px] max-w-[360px]">
        <select
          value={selectedDevice ?? ""}
          onChange={(e) => setSelectedDevice(e.target.value || null)}
          className="peer w-full appearance-none rounded-md border border-border bg-secondary px-3 py-1.5 pr-8 text-left text-sm text-foreground outline-none transition-colors focus:ring-1 focus:ring-ring"
        >
          {devices.length === 0 && <option value="">未连接设备</option>}
          {devices.map((device) => (
            <option key={device.serial} value={device.serial}>
              {device.model || device.serial} ({deviceLabel(device.state)})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <button
        type="button"
        onClick={refresh}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        title="刷新设备"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </button>
      {selected && (
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs", "bg-secondary text-muted-foreground")}>
          <span className={cn("h-2 w-2 rounded-full", deviceColor(selected.state))} />
          {deviceLabel(selected.state)}
        </span>
      )}
    </div>
  );
}
