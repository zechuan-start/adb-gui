import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Play, RefreshCw, Search, Square, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import {
  clearAppData,
  forceStopApp,
  launchApp,
  listPackages,
  uninstallApp,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

export function PackageManagerPanel() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);

  const [packages, setPackages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPkg, setSelectedPkg] = useState("");
  const [confirmAction, setConfirmAction] = useState<"clear" | "uninstall" | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const loadPackages = useCallback(async () => {
    if (!device || !isOnlineDevice(device)) return;
    setLoading(true);
    try {
      const pkgs = await listPackages(device.serial);
      setPackages(pkgs.sort());
    } catch (e) {
      showToast("error", `加载应用列表失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [device?.serial]);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const filtered = useMemo(() => {
    if (!search) return packages;
    const lower = search.toLowerCase();
    return packages.filter((p) => p.toLowerCase().includes(lower));
  }, [packages, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  const canAct = !!device && isOnlineDevice(device) && !!selectedPkg;

  async function handleAction(action: "force-stop" | "launch" | "clear" | "uninstall") {
    if (!device || !selectedPkg) return;
    try {
      let result = "";
      if (action === "force-stop") result = await forceStopApp(device.serial, selectedPkg);
      else if (action === "launch") result = await launchApp(device.serial, selectedPkg);
      else if (action === "clear") result = await clearAppData(device.serial, selectedPkg);
      else result = await uninstallApp(device.serial, selectedPkg);
      showToast("success", result || `${selectedPkg} ${action} 成功`);
      if (action === "uninstall") {
        setPackages((prev) => prev.filter((p) => p !== selectedPkg));
        setSelectedPkg("");
      }
    } catch (e) {
      showToast("error", `操作失败: ${e}`);
    } finally {
      setConfirmAction(null);
    }
  }

  if (!device || !isOnlineDevice(device)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请先连接在线设备
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索包名..."
            className="w-full rounded-md border border-border bg-secondary py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadPackages()}
          disabled={loading}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          title="刷新列表"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
        <span className="text-xs text-muted-foreground">{filtered.length} 个应用</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={parentRef} className="min-h-0 w-72 overflow-auto border-r border-border">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const pkg = filtered[vItem.index];
              return (
                <button
                  key={vItem.index}
                  type="button"
                  onClick={() => {
                    setSelectedPkg(pkg);
                    setConfirmAction(null);
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vItem.size}px`,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                  className={cn(
                    "flex items-center px-3 text-left text-xs font-mono truncate transition-colors",
                    selectedPkg === pkg
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  {pkg}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          {selectedPkg ? (
            <>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">选中包名</div>
                <div className="mt-1 font-mono text-sm">{selectedPkg}</div>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => void handleAction("launch")}
                  className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" /> 启动
                </button>
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => void handleAction("force-stop")}
                  className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Square className="h-4 w-4" /> 强停
                </button>
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => setConfirmAction(confirmAction === "clear" ? null : "clear")}
                  className="inline-flex items-center gap-2 rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4" /> 清数据
                </button>
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => setConfirmAction(confirmAction === "uninstall" ? null : "uninstall")}
                  className="inline-flex items-center gap-2 rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> 卸载
                </button>
              </div>

              {confirmAction && (
                <div className="flex items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
                  <span>
                    {confirmAction === "clear"
                      ? `确认清除 ${selectedPkg} 数据?`
                      : `确认卸载 ${selectedPkg}?`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleAction(confirmAction)}
                    className="rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-400"
                  >
                    确认
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              从左侧列表选择一个应用
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
